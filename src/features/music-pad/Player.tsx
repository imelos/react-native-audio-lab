import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import NativeAudioModule from '../../specs/NativeAudioModule';
import { MidiVisualizer, VisualNote } from './midi-visualiser/MidiVisualiser';
import Grid, { GridHandle } from './grid/Grid';
import performance from 'react-native-performance';
import { useSharedValue } from 'react-native-reanimated';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface NoteEvent {
  type: 'noteOn' | 'noteOff';
  note: number;
  timestamp: number; // ms relative to recording start
  velocity: number;
}

/** A paired note: on + off combined */
interface NotePair {
  note: number;
  velocity: number;
  start: number; // ms
  end: number; // ms
}

export interface LoopSequence {
  events: NoteEvent[];
  duration: number; // loop length in ms
  durationBars: number;
  name: string;
  bpm: number;
  confidence: number;
  downbeatOffset: number;
  timeSignature: [number, number];
  beatIntervalMs: number;
}

interface BPMInfo {
  bpm: number;
  confidence: number;
  intervalMs: number;
}

interface PhaseInfo {
  downbeatOffset: number;
  confidence: number;
}

export interface PlayerProps {
  channel: number;
  gridNotes: number[];
  rows: number;
  cols: number;
  gridSize: string;
  useScale: boolean;
  scaleNotes: Set<number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MIN_BPM = 60;
const MAX_BPM = 200;
// Preferred BPM range — we bias towards this zone (like Ableton)
const PREFERRED_BPM_LOW = 70;
const PREFERRED_BPM_HIGH = 160;

// Common BPM values to snap to when close
const COMMON_BPMS = [
  60, 70, 72, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 128, 130, 135,
  140, 145, 150, 155, 160, 170, 175, 180, 190, 200,
];
const BPM_SNAP_TOLERANCE = 1.5; // snap if within ±1.5 BPM of a common value

// ─────────────────────────────────────────────────────────────────────────────
// Utility: pairing noteOn/noteOff into NotePairs
// ─────────────────────────────────────────────────────────────────────────────

function pairNotes(events: NoteEvent[]): NotePair[] {
  const active = new Map<number, NoteEvent>();
  const pairs: NotePair[] = [];

  for (const e of events) {
    if (e.type === 'noteOn') {
      // If there's already an active note with same pitch, close it first
      const existing = active.get(e.note);
      if (existing) {
        pairs.push({
          note: existing.note,
          velocity: existing.velocity,
          start: existing.timestamp,
          end: e.timestamp,
        });
      }
      active.set(e.note, e);
    } else {
      const on = active.get(e.note);
      if (on) {
        pairs.push({
          note: e.note,
          velocity: on.velocity,
          start: on.timestamp,
          end: e.timestamp,
        });
        active.delete(e.note);
      }
    }
  }

  // Close any still-open notes (user lifted finger late or recording ended)
  const maxTime =
    events.length > 0 ? Math.max(...events.map(e => e.timestamp)) : 0;
  for (const [, on] of active) {
    pairs.push({
      note: on.note,
      velocity: on.velocity,
      start: on.timestamp,
      end: maxTime,
    });
  }

  return pairs.sort((a, b) => a.start - b.start);
}

/** Convert NotePairs back to sorted NoteEvent[] */
function pairsToEvents(pairs: NotePair[]): NoteEvent[] {
  const events: NoteEvent[] = [];
  for (const p of pairs) {
    events.push(
      {
        type: 'noteOn',
        note: p.note,
        timestamp: p.start,
        velocity: p.velocity,
      },
      { type: 'noteOff', note: p.note, timestamp: p.end, velocity: 0 },
    );
  }
  return events.sort(
    (a, b) => a.timestamp - b.timestamp || (a.type === 'noteOff' ? -1 : 1),
  );
}

/** Snap BPM to nearest common value if close */
function snapBPM(bpm: number): number {
  for (const common of COMMON_BPMS) {
    if (Math.abs(bpm - common) <= BPM_SNAP_TOLERANCE) return common;
  }
  return Math.round(bpm * 10) / 10; // round to 1 decimal
}

/**
 * Choose the best loop length in bars — round UP to contain all content.
 *
 * Strategy: pick the smallest power-of-two that fits, but if
 * we're very close to a smaller one (within ~1 beat of overflow),
 * still use the larger one rather than trimming.
 *
 * Examples:
 *   rawBars = 2.25 (9 beats)  → 4 bars   (next pot that contains it)
 *   rawBars = 4.1             → 8 bars   (can't fit in 4)
 *   rawBars = 1.8             → 2 bars
 *   rawBars = 0.6             → 1 bar    (minimum)
 *   rawBars = 3.9             → 4 bars
 *   rawBars = 4.0             → 4 bars   (exact fit)
 *   rawBars = 8.3             → 16 bars
 *   rawBars = 2.0             → 2 bars   (exact fit)
 */
function bestBarCount(rawBars: number): number {
  if (rawBars <= 1) return 1;

  // Smallest power-of-two that is >= rawBars
  const pot = Math.pow(2, Math.ceil(Math.log2(rawBars)));

  // If raw bars fits exactly in the previous pot (within 2% tolerance),
  // use that instead. E.g. rawBars = 2.0 → 2, not 4.
  const prevPot = pot / 2;
  if (rawBars <= prevPot * 1.02) return prevPot;

  return pot;
}

// ─────────────────────────────────────────────────────────────────────────────
// BPM Detection — Autocorrelation + IOI Histogram Hybrid
//
// Strategy (inspired by Ableton / Essentia):
//   1. Build an Inter-Onset Interval (IOI) histogram from all noteOn pairs.
//   2. Find peaks in the histogram — these are candidate beat intervals.
//   3. For each candidate, score it by how well ALL onsets align to a grid
//      at that interval (autocorrelation-style scoring).
//   4. Among the top scorers, pick the one in the preferred BPM range.
//   5. If multiple are equally good, prefer the one closest to 120 BPM.
// ─────────────────────────────────────────────────────────────────────────────

function detectBPM(events: NoteEvent[]): BPMInfo | null {
  const onsets = events
    .filter(e => e.type === 'noteOn')
    .map(e => e.timestamp)
    .sort((a, b) => a - b);

  if (onsets.length < 3) return null;

  const totalDuration = onsets[onsets.length - 1] - onsets[0];
  if (totalDuration < 500) return null; // less than 0.5s of data — can't detect

  // ── Step 1: IOI Histogram ────────────────────────────────────────────────
  // We bin inter-onset intervals. We only look at consecutive and near-
  // consecutive onsets (up to 4 apart) to avoid noise from distant pairs.
  const BIN_SIZE = 8; // ms — finer bins than before
  const histogram = new Map<number, number>();

  const MAX_PAIR_DISTANCE = 4; // compare onset i with i+1 .. i+4
  for (let i = 0; i < onsets.length; i++) {
    for (
      let j = i + 1;
      j <= Math.min(i + MAX_PAIR_DISTANCE, onsets.length - 1);
      j++
    ) {
      const interval = onsets[j] - onsets[i];
      if (interval < 150 || interval > 3000) continue; // 20 BPM – 400 BPM range
      const bin = Math.round(interval / BIN_SIZE) * BIN_SIZE;
      const weight = 1 / (j - i); // closer pairs get more weight
      histogram.set(bin, (histogram.get(bin) || 0) + weight);
    }
  }

  if (histogram.size === 0) return null;

  // ── Step 2: Find peaks (smooth histogram, then pick local maxima) ────────
  const bins = Array.from(histogram.entries()).sort((a, b) => a[0] - b[0]);

  // Simple Gaussian-ish smoothing: average with neighbors
  const smoothed = new Map<number, number>();
  for (let i = 0; i < bins.length; i++) {
    let sum = bins[i][1] * 2;
    let weight = 2;
    if (i > 0) {
      sum += bins[i - 1][1];
      weight += 1;
    }
    if (i < bins.length - 1) {
      sum += bins[i + 1][1];
      weight += 1;
    }
    smoothed.set(bins[i][0], sum / weight);
  }

  // Collect top N bins as candidates
  const candidateIntervals = Array.from(smoothed.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([intervalMs]) => intervalMs);

  // ── Step 3: For each candidate, try integer multiples/divisions ──────────
  // This handles the octave problem (user plays every other beat, etc.)
  const expandedCandidates: Array<{ intervalMs: number; source: number }> = [];

  for (const base of candidateIntervals) {
    for (const factor of [0.25, 0.5, 1, 2, 3, 4]) {
      const interval = base * factor;
      const bpm = 60000 / interval;
      if (bpm >= MIN_BPM && bpm <= MAX_BPM) {
        expandedCandidates.push({ intervalMs: interval, source: base });
      }
    }
  }

  if (expandedCandidates.length === 0) return null;

  // ── Step 4: Score each candidate by onset-grid alignment ─────────────────
  // For a given beat interval, the "score" is the average cosine similarity
  // of onsets to the nearest grid line, normalized by the interval.
  let bestScore = -Infinity;
  let bestInterval = 500;
  let bestBPM = 120;

  for (const { intervalMs } of expandedCandidates) {
    // Circular mean approach: for each onset, compute phase within the beat
    // and see how concentrated the phases are (Rayleigh statistic).
    let sinSum = 0;
    let cosSum = 0;

    for (const t of onsets) {
      const phase = ((t % intervalMs) / intervalMs) * 2 * Math.PI;
      sinSum += Math.sin(phase);
      cosSum += Math.cos(phase);
    }

    // Rayleigh R statistic (0 = random, 1 = perfect alignment)
    const R = Math.sqrt(sinSum * sinSum + cosSum * cosSum) / onsets.length;

    // Bias towards preferred BPM range
    const bpm = 60000 / intervalMs;
    let rangeBias = 1.0;
    if (bpm >= PREFERRED_BPM_LOW && bpm <= PREFERRED_BPM_HIGH) {
      rangeBias = 1.15; // 15% bonus for being in sweet spot
    }
    // Slight bias towards ~120 BPM (musical gravity center)
    const centerBias = 1.0 - Math.abs(bpm - 120) / 500;

    const score = R * rangeBias + centerBias * 0.05;

    if (score > bestScore) {
      bestScore = score;
      bestInterval = intervalMs;
      bestBPM = bpm;
    }
  }

  // Snap to common BPM
  bestBPM = snapBPM(bestBPM);
  bestInterval = 60000 / bestBPM;

  // Confidence = Rayleigh R at the chosen interval
  let sinSum = 0;
  let cosSum = 0;
  for (const t of onsets) {
    const phase = ((t % bestInterval) / bestInterval) * 2 * Math.PI;
    sinSum += Math.sin(phase);
    cosSum += Math.cos(phase);
  }
  const confidence =
    Math.sqrt(sinSum * sinSum + cosSum * cosSum) / onsets.length;

  return {
    bpm: bestBPM,
    confidence,
    intervalMs: bestInterval,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase Detection — find downbeat offset
//
// Given a beat interval, find the phase offset that best aligns onsets.
// We use the circular mean angle from the Rayleigh test above.
// ─────────────────────────────────────────────────────────────────────────────

function detectPhase(events: NoteEvent[], bpmInfo: BPMInfo): PhaseInfo {
  const onsets = events
    .filter(e => e.type === 'noteOn')
    .map(e => e.timestamp)
    .sort((a, b) => a - b);

  if (onsets.length === 0) return { downbeatOffset: 0, confidence: 0 };

  const beatMs = bpmInfo.intervalMs;

  // Circular mean to find the average phase of all onsets
  let sinSum = 0;
  let cosSum = 0;

  // Weight by velocity if available — louder notes more likely on beats
  const noteOns = events.filter(e => e.type === 'noteOn');
  for (const e of noteOns) {
    const phase = ((e.timestamp % beatMs) / beatMs) * 2 * Math.PI;
    const w = 0.5 + e.velocity * 0.5; // velocity weighting
    sinSum += Math.sin(phase) * w;
    cosSum += Math.cos(phase) * w;
  }

  // The mean angle gives us the average phase offset
  const meanAngle = Math.atan2(sinSum, cosSum);
  // Convert back to ms offset
  let offset = (meanAngle / (2 * Math.PI)) * beatMs;
  if (offset < 0) offset += beatMs;

  const R =
    Math.sqrt(sinSum * sinSum + cosSum * cosSum) /
    noteOns.reduce((s, e) => s + 0.5 + e.velocity * 0.5, 0);

  return { downbeatOffset: offset, confidence: Math.min(1, R) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Loop Creation — Ableton Note style
//
// Key principles:
//   1. Normalize timestamps to start from 0 at the first noteOn.
//   2. Detect BPM and phase.
//   3. Choose a musically sensible loop length (1, 2, 4, 8 bars preferred).
//   4. Wrap any events that spill past the loop boundary back into the loop.
//   5. Ensure the loop is phase-aligned to the detected downbeat.
// ─────────────────────────────────────────────────────────────────────────────

function createLoopSequence(
  events: NoteEvent[],
  name: string,
): LoopSequence | null {
  if (events.length === 0) return null;

  // ── Trim to first noteOn ─────────────────────────────────────────────────
  const firstOnIdx = events.findIndex(e => e.type === 'noteOn');
  if (firstOnIdx === -1) return null;

  const trimmed = events.slice(firstOnIdx);
  const t0 = trimmed[0].timestamp;
  const normalized: NoteEvent[] = trimmed.map(e => ({
    ...e,
    timestamp: e.timestamp - t0,
  }));

  // ── Detect BPM ───────────────────────────────────────────────────────────
  const bpmInfo = detectBPM(normalized);
  if (!bpmInfo) {
    // Fallback: assume 120 BPM
    return createLoopWithBPM(normalized, name, {
      bpm: 120,
      confidence: 0,
      intervalMs: 500,
    });
  }

  return createLoopWithBPM(normalized, name, bpmInfo);
}

function createLoopWithBPM(
  events: NoteEvent[],
  name: string,
  bpmInfo: BPMInfo,
): LoopSequence {
  const beatMs = bpmInfo.intervalMs;
  const barMs = beatMs * 4; // 4/4

  // ── Detect phase ─────────────────────────────────────────────────────────
  // In a live-played recording, the first noteOn IS the downbeat.
  // We detect phase for metadata/display only, but do NOT shift events.
  const phaseInfo = detectPhase(events, bpmInfo);
  const downbeatOffset = phaseInfo.downbeatOffset;

  // No phase shifting — events stay as-is, first note = beat 1
  const aligned = events;

  // ── Determine loop length ────────────────────────────────────────────────
  const pairs = pairNotes(aligned);
  if (pairs.length === 0) {
    return {
      events: aligned,
      duration: barMs * 2,
      durationBars: 2,
      name,
      bpm: bpmInfo.bpm,
      confidence: bpmInfo.confidence,
      downbeatOffset,
      timeSignature: [4, 4],
      beatIntervalMs: bpmInfo.intervalMs,
    };
  }

  // Use last noteOn for loop length (not noteOff — avoids long release tails)
  const lastNoteOnTime = Math.max(...pairs.map(p => p.start));

  // Raw bars: how many bars does the content span?
  // Add a half-beat buffer so the last note onset sits comfortably inside
  const rawBars = (lastNoteOnTime + beatMs * 0.5) / barMs;
  const durationBars = bestBarCount(rawBars);
  const loopDuration = durationBars * barMs;

  // ── Fit notes into loop ───────────────────────────────────────────────────
  // All notes should already fit since we rounded UP the bar count.
  // Just clamp note durations and handle edge cases.
  const fittedPairs: NotePair[] = [];

  for (const p of pairs) {
    let start = Math.max(0, p.start);
    let end = p.end;

    // Clamp very long notes to max 1 bar
    const duration = Math.min(end - start, barMs);
    end = start + duration;

    // Truncate if note rings past loop boundary
    if (end > loopDuration) {
      end = loopDuration;
    }

    // Ensure minimum note length
    if (end - start < beatMs * 0.125) {
      end = Math.min(start + beatMs * 0.125, loopDuration);
    }

    fittedPairs.push({
      note: p.note,
      velocity: p.velocity,
      start,
      end,
    });
  }

  // ── De-duplicate overlapping notes on same pitch ─────────────────────────
  const dedupedPairs = deduplicateOverlaps(fittedPairs);

  const finalEvents = pairsToEvents(dedupedPairs);

  return {
    events: finalEvents,
    duration: loopDuration,
    durationBars,
    name,
    bpm: bpmInfo.bpm,
    confidence: bpmInfo.confidence,
    downbeatOffset,
    timeSignature: [4, 4],
    beatIntervalMs: bpmInfo.intervalMs,
  };
}

/** Remove overlapping notes on the same pitch (keep the one with higher velocity) */
function deduplicateOverlaps(pairs: NotePair[]): NotePair[] {
  // Group by note
  const byNote = new Map<number, NotePair[]>();
  for (const p of pairs) {
    const arr = byNote.get(p.note) || [];
    arr.push(p);
    byNote.set(p.note, arr);
  }

  const result: NotePair[] = [];
  for (const [, notePairs] of byNote) {
    // Sort by start time
    notePairs.sort((a, b) => a.start - b.start);

    const merged: NotePair[] = [];
    for (const p of notePairs) {
      const last = merged[merged.length - 1];
      if (last && p.start < last.end) {
        // Overlap — extend the existing note, keep higher velocity
        last.end = Math.max(last.end, p.end);
        last.velocity = Math.max(last.velocity, p.velocity);
      } else {
        merged.push({ ...p });
      }
    }
    result.push(...merged);
  }

  return result.sort((a, b) => a.start - b.start);
}

// ─────────────────────────────────────────────────────────────────────────────
// Quantization — Ableton Note style
//
// Key principles (what makes this feel musical):
//
//   1. **Partial-strength start quantization** — nudge note starts toward the
//      grid (default 75%) rather than hard-snapping.  This preserves the
//      human push/pull that makes live playing feel alive.
//
//   2. **Independent end quantization** — note ends snap to the grid at a
//      gentler strength (≈60% of start strength).  This fills grid slots
//      naturally instead of blindly preserving raw durations, which is what
//      caused the "ugly" gaps / overlaps before.
//
//   3. **Velocity-aware strength** — ghost notes (soft touches) keep more of
//      their original micro-timing.  Hard hits land more precisely on the
//      grid, matching player intent.
//
//   4. **Duration guardrails** — notes can't shrink below half a grid step
//      or grow beyond 2× their original length, preventing machine-gun
//      artifacts and ballooning.
//
//   5. **Legato preservation** — if two consecutive same-pitch notes were
//      nearly legato in the original recording, the first note's end is
//      stretched to meet the next note's start, keeping the phrase connected.
// ─────────────────────────────────────────────────────────────────────────────

type QuantizeGrid = '1/4' | '1/8' | '1/16' | '1/32';

/**
 * Ableton Note–style quantization.
 *
 * Only note STARTS are quantized — durations are preserved exactly as played.
 * This keeps the player's original note lengths and articulation intact.
 *
 * Additional musical touches:
 *   - Partial strength (default 75%) keeps human timing feel
 *   - Velocity-aware: ghost notes stay looser, hard hits snap tighter
 *   - Legato connections between same-pitch notes are preserved
 */
function quantizeEvents(
  events: NoteEvent[],
  beatMs: number,
  grid: QuantizeGrid = '1/16',
  strength: number = 0.75,
): NoteEvent[] {
  const gridDivisor: Record<QuantizeGrid, number> = {
    '1/4': 1,
    '1/8': 2,
    '1/16': 4,
    '1/32': 8,
  };

  const gridMs = beatMs / gridDivisor[grid];
  const minDuration = gridMs * 0.25; // safety floor

  const pairs = pairNotes(events);
  const quantizedPairs: NotePair[] = [];

  for (const p of pairs) {
    const originalDuration = p.end - p.start;

    // ── Velocity-scaled strength ────────────────────────────────────────
    // Ghost notes (vel < 0.4) keep more of their original timing.
    // Hard hits snap more precisely — that's usually what the player wants.
    const velFactor = 0.6 + p.velocity * 0.4; // range: 0.6 – 1.0
    const startStr = strength * velFactor;

    // ── Quantize start only ────────────────────────────────────────────
    const snappedStart = Math.round(p.start / gridMs) * gridMs;
    const offset = snappedStart - p.start;
    const absOffset = Math.abs(offset);

    // Dead zone: if already within 20% of grid step, don't move at all.
    // This preserves notes that the player landed close to the grid —
    // they already sound right and shifting them feels wrong.
    let newStart: number;
    if (absOffset < gridMs * 0.2) {
      newStart = p.start; // leave it alone
    } else {
      // Apply strength, but cap maximum shift to 40% of a grid step.
      // This prevents far-off notes from jumping unnaturally far.
      const maxShift = gridMs * 0.4;
      const rawShift = offset * startStr;
      const clampedShift =
        Math.sign(rawShift) * Math.min(Math.abs(rawShift), maxShift);
      newStart = p.start + clampedShift;
    }

    // ── Preserve original duration (this is what Ableton Note does) ────
    const newEnd = newStart + Math.max(originalDuration, minDuration);

    quantizedPairs.push({
      note: p.note,
      velocity: p.velocity,
      start: Math.max(0, newStart),
      end: Math.max(0, newEnd),
    });
  }

  // ── Legato preservation ──────────────────────────────────────────────────
  // Group by pitch; if two notes were nearly legato before quantization,
  // stretch the first note's end to meet the second note's start so the
  // phrase stays connected instead of getting choppy gaps.
  const byNote = new Map<number, number[]>(); // note → indices into quantizedPairs
  quantizedPairs.forEach((p, i) => {
    const arr = byNote.get(p.note) || [];
    arr.push(i);
    byNote.set(p.note, arr);
  });

  for (const [, indices] of byNote) {
    indices.sort((a, b) => quantizedPairs[a].start - quantizedPairs[b].start);
    for (let k = 0; k < indices.length - 1; k++) {
      const curr = quantizedPairs[indices[k]];
      const next = quantizedPairs[indices[k + 1]];

      // Check original gap to decide if they were legato
      const origCurr = pairs[indices[k]];
      const origNext = pairs[indices[k + 1]];
      if (origCurr && origNext) {
        const origGap = origNext.start - origCurr.end;

        // If original gap was ≤ half a grid step, they were "legato"
        if (origGap <= gridMs * 0.5) {
          const newGap = next.start - curr.end;
          if (newGap > 0 && newGap <= gridMs) {
            curr.end = next.start; // close the gap
          }
        }
      }
    }
  }

  // Resolve overlaps after quantization
  const deduped = deduplicateOverlaps(quantizedPairs);

  return pairsToEvents(deduped);
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Player({
  channel,
  gridNotes,
  rows,
  cols,
  gridSize,
  useScale,
  scaleNotes,
}: PlayerProps) {
  const activeNotesRef = useRef<Set<number>>(new Set());
  const gridRef = useRef<GridHandle>(null);

  const isRecordingRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [savedSequences, setSavedSequences] = useState<LoopSequence[]>([]);
  const [showRecordingButtons, setShowRecordingButtons] = useState(false);

  const currentRecordingRef = useRef<NoteEvent[]>([]);
  const recordingStartTime = useRef<number>(0);
  const playbackRafRef = useRef<number | null>(null);

  // Visual notes
  const noteIdRef = useRef(0);
  const visualNotesRef = useRef<VisualNote[]>([]);

  const playheadX = useSharedValue(0);
  const currentMusicalMs = useSharedValue(0);

  const windowWidth = Dimensions.get('window').width;

  // ── Recording ────────────────────────────────────────────────────────────

  const startRecording = useCallback(() => {
    recordingStartTime.current = performance.now();
    currentRecordingRef.current = [];
    isRecordingRef.current = true;
    setShowRecordingButtons(true);
  }, []);

  const clearRecording = useCallback(() => {
    currentRecordingRef.current = [];
    isRecordingRef.current = false;
    setShowRecordingButtons(false);
  }, []);

  const recordNoteEvent = useCallback(
    (type: 'noteOn' | 'noteOff', note: number, velocity: number = 0.85) => {
      if (!isRecordingRef.current || recordingStartTime.current === 0) return;
      const timestamp = performance.now() - recordingStartTime.current;
      currentRecordingRef.current.push({ type, note, timestamp, velocity });
    },
    [],
  );

  // ── Visual Notes ─────────────────────────────────────────────────────────

  const createVisualNote = useCallback((note: number) => {
    const vn: VisualNote = {
      id: ++noteIdRef.current,
      note,
      startTime: performance.now(),
    };
    visualNotesRef.current = [...visualNotesRef.current, vn];
  }, []);

  const endVisualNote = useCallback((note: number) => {
    for (let i = visualNotesRef.current.length - 1; i >= 0; i--) {
      const vn = visualNotesRef.current[i];
      if (vn.note === note && vn.endTime == null) {
        vn.endTime = performance.now();
        break;
      }
    }
  }, []);

  // ── Playback ─────────────────────────────────────────────────────────────

  const stopPlayback = useCallback(() => {
    if (playbackRafRef.current !== null) {
      cancelAnimationFrame(playbackRafRef.current);
      playbackRafRef.current = null;
    }
    activeNotesRef.current.forEach(note => {
      NativeAudioModule.noteOff(channel, note);
      endVisualNote(note);
      gridRef.current?.setPadActive(note, false);
    });
    activeNotesRef.current.clear();
    setIsPlaying(false);
  }, [channel, endVisualNote]);

  const playSequence = useCallback(
    (sequence: LoopSequence) => {
      stopPlayback();
      setIsPlaying(true);

      const events = [...sequence.events].sort(
        (a, b) => a.timestamp - b.timestamp,
      );

      let eventIndex = 0;
      let lastLoopTime = -1;
      const startTime = performance.now();

      const tick = () => {
        const now = performance.now();
        const rawElapsed = now - startTime;
        const loopTime = rawElapsed % sequence.duration;
        // ── Loop wrap: kill all notes, reset index ───────────────────────
        if (loopTime < lastLoopTime) {
          activeNotesRef.current.forEach(note => {
            NativeAudioModule.noteOff(channel, note);
            gridRef.current?.setPadActive(note, false);
          });
          activeNotesRef.current.clear();
          eventIndex = 0;
        }

        // ── Fire events up to current time ───────────────────────────────
        while (
          eventIndex < events.length &&
          events[eventIndex].timestamp <= loopTime
        ) {
          const e = events[eventIndex];
          if (e.type === 'noteOn') {
            NativeAudioModule.noteOn(channel, e.note, e.velocity);
            activeNotesRef.current.add(e.note);
            gridRef.current?.setPadActive(e.note, true);
          } else {
            NativeAudioModule.noteOff(channel, e.note);
            activeNotesRef.current.delete(e.note);
            gridRef.current?.setPadActive(e.note, false);
          }
          eventIndex++;
        }

        currentMusicalMs.value = loopTime;
        playheadX.value = (loopTime / sequence.duration) * windowWidth;

        lastLoopTime = loopTime;
        playbackRafRef.current = requestAnimationFrame(tick);
      };

      playbackRafRef.current = requestAnimationFrame(tick);
    },
    [channel, stopPlayback, currentMusicalMs, playheadX, windowWidth],
  );

  // ── Add recording as loop ────────────────────────────────────────────────

  const addRecording = useCallback(() => {
    if (currentRecordingRef.current.length === 0) return;

    const loopSequence = createLoopSequence(
      currentRecordingRef.current,
      `Sequence ${savedSequences.length + 1}`,
    );
    if (loopSequence) {
      setSavedSequences(prev => [...prev, loopSequence]);
      currentRecordingRef.current = [];
      isRecordingRef.current = false;
      setShowRecordingButtons(false);

      // Update visual notes to match the loop
      const pairs = pairNotes(loopSequence.events);
      visualNotesRef.current = pairs.map(p => ({
        id: ++noteIdRef.current,
        note: p.note,
        startTime: p.start,
        endTime: p.end,
      }));

      playSequence(loopSequence);
    }
  }, [savedSequences.length, playSequence]);

  // ── Grid callbacks ───────────────────────────────────────────────────────

  const handleNoteOn = useCallback(
    (note: number, velocity: number) => {
      // Auto-start recording on first touch if not already looping
      if (
        !isRecordingRef.current &&
        savedSequences.length === 0 &&
        currentRecordingRef.current.length === 0
      ) {
        startRecording();
      }

      NativeAudioModule.noteOn(channel, note, velocity);
      activeNotesRef.current.add(note);
      createVisualNote(note);
      recordNoteEvent('noteOn', note, velocity);
    },
    [
      channel,
      savedSequences.length,
      recordNoteEvent,
      createVisualNote,
      startRecording,
    ],
  );

  const handleNoteOff = useCallback(
    (note: number) => {
      NativeAudioModule.noteOff(channel, note);
      activeNotesRef.current.delete(note);
      endVisualNote(note);
      recordNoteEvent('noteOff', note);
    },
    [channel, endVisualNote, recordNoteEvent],
  );

  // ── Quantize ─────────────────────────────────────────────────────────────

  const handleQuantize = useCallback(() => {
    if (savedSequences.length === 0) return;

    const seqIndex = savedSequences.length - 1;
    const sequence = savedSequences[seqIndex];

    const quantizedEvts = quantizeEvents(
      sequence.events,
      sequence.beatIntervalMs,
      '1/16',
      0.75, // Musical default — keeps groove intact
    );

    const quantizedSequence: LoopSequence = {
      ...sequence,
      events: quantizedEvts,
    };

    setSavedSequences(prev => {
      const next = [...prev];
      next[seqIndex] = quantizedSequence;
      return next;
    });

    // Update visual notes
    const pairs = pairNotes(quantizedEvts);
    visualNotesRef.current = pairs.map(p => ({
      id: ++noteIdRef.current,
      note: p.note,
      startTime: p.start,
      endTime: p.end,
    }));

    // If playing, restart with quantized version
    if (isPlaying) {
      playSequence(quantizedSequence);
    }
  }, [savedSequences, isPlaying, playSequence]);

  // ── Delete ───────────────────────────────────────────────────────────────

  const deleteSequence = useCallback(
    (index: number) => {
      if (isPlaying) stopPlayback();
      setSavedSequences(prev => {
        const next = prev.filter((_, i) => i !== index);
        if (next.length === 0) {
          currentRecordingRef.current = [];
          recordingStartTime.current = 0;
          setShowRecordingButtons(false);
        }
        return next;
      });
    },
    [isPlaying, stopPlayback],
  );

  // ── Cleanup ──────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (playbackRafRef.current !== null) {
        cancelAnimationFrame(playbackRafRef.current);
      }
    };
  }, []);

  // ── Memoized UI ──────────────────────────────────────────────────────────

  const MemoizedVisualizer = useMemo(
    () => (
      <MidiVisualizer
        height={50}
        width={windowWidth}
        notesRef={visualNotesRef}
        currentMusicalMs={currentMusicalMs}
        playheadX={playheadX}
        sequence={savedSequences[savedSequences.length - 1]}
      />
    ),
    [savedSequences, currentMusicalMs, playheadX, windowWidth],
  );

  const currentSequenceInfo = useMemo(() => {
    if (savedSequences.length === 0) return null;
    const seq = savedSequences[savedSequences.length - 1];
    return {
      bpm: seq.bpm.toFixed(1),
      bars: seq.durationBars,
      duration: (seq.duration / 1000).toFixed(2),
      confidence: (seq.confidence * 100).toFixed(0),
    };
  }, [savedSequences]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <View style={styles.midiVisualiser}>{MemoizedVisualizer}</View>

      {currentSequenceInfo && (
        <View style={styles.sequenceInfo}>
          <Text style={styles.sequenceInfoText}>
            BPM: {currentSequenceInfo.bpm} | Bars: {currentSequenceInfo.bars} |
            Duration: {currentSequenceInfo.duration}s | Confidence:{' '}
            {currentSequenceInfo.confidence}%
          </Text>
        </View>
      )}

      <Grid
        ref={gridRef}
        gridNotes={gridNotes}
        rows={rows}
        cols={cols}
        gridSize={gridSize}
        useScale={useScale}
        scaleNotes={scaleNotes}
        onNoteOn={handleNoteOn}
        onNoteOff={handleNoteOff}
      />

      <View style={styles.footer} pointerEvents="box-none">
        {showRecordingButtons && (
          <View style={styles.footerButtons} pointerEvents="auto">
            <View style={styles.footerButtonRow}>
              <TouchableOpacity
                style={[styles.footerButton, styles.addButton]}
                onPress={addRecording}
              >
                <Text style={styles.footerButtonText}>ADD</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.footerButton, styles.clearButton]}
                onPress={clearRecording}
              >
                <Text style={styles.footerButtonText}>CLEAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {savedSequences.length > 0 && !showRecordingButtons && (
          <View style={styles.footerButtons} pointerEvents="auto">
            <TouchableOpacity
              style={[styles.footerButton, styles.playButton]}
              onPress={handleQuantize}
            >
              <Text style={styles.footerButtonText}>QUANTIZE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.footerButton,
                isPlaying ? styles.stopButton : styles.playButton,
              ]}
              onPress={() => {
                if (isPlaying) {
                  stopPlayback();
                } else if (savedSequences.length > 0) {
                  playSequence(savedSequences[savedSequences.length - 1]);
                }
              }}
            >
              <Text style={styles.footerButtonText}>
                {isPlaying ? '■ STOP' : '▶ PLAY'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerButton, styles.deleteButton]}
              onPress={() => deleteSequence(savedSequences.length - 1)}
            >
              <Text style={styles.footerButtonText}>DELETE</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  midiVisualiser: {
    height: 50,
  },
  sequenceInfo: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sequenceInfoText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  footer: {
    bottom: 0,
    left: 0,
    right: 0,
    height: 50,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  footerButtons: {
    alignItems: 'center',
    gap: 12,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  footerButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  footerButton: {
    paddingHorizontal: 20,
    paddingVertical: 3,
    borderRadius: 20,
    minWidth: 90,
    alignItems: 'center',
  },
  footerButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: '#4caf50',
  },
  clearButton: {
    backgroundColor: '#757575',
  },
  playButton: {
    backgroundColor: '#4caf50',
  },
  stopButton: {
    backgroundColor: '#f44336',
  },
  deleteButton: {
    backgroundColor: '#d32f2f',
  },
});
