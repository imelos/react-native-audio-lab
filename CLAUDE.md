# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

React Native audio workstation app (Ableton Note clone) with a native JUCE-based audio engine. iOS-focused, using React Native New Architecture (TurboModules/Codegen).

## Build & Development Commands

```bash
npm run ios           # Build and run on iOS simulator
npm run android       # Build and run on Android
npm start             # Start Metro bundler
npm run lint          # ESLint
npm test              # Jest tests
cd ios && pod install # Install CocoaPods after dependency changes
```

## Architecture

### Native Audio Layer

- **`ios/AudioModule.mm`** — TurboModule bridging Obj-C++ to the JUCE audio engine
- **`src/specs/NativeAudioModule.ts`** — Codegen spec defining the JS↔Native interface (channels, noteOn/Off, ADSR, effects, samples)

All audio is channel-based (1-16). Each channel has one instrument (oscillator or multi-sampler) with an effects chain (filter, reverb, delay).

### Sequencer System (the core loop engine)

The sequencer is the most architecturally important subsystem. Data flows:

```
GlobalSequencer (singleton, owns all state)
  ├── per-channel: ChannelState { sequence, delegate, activeNotes, recording state }
  ├── single RAF loop drives ALL channels (note dispatch + delegate callbacks)
  ├── masterDuration = max(all sequence durations)
  └── listeners: onTransport(), onChannelSequence()

useSequencer (React hook, per-Player instance)
  ├── registers a ChannelDelegate for UI callbacks (pad highlighting, playhead)
  ├── bridges GlobalSequencer → React state (sequence, transportState, masterDuration)
  ├── on unmount: detachDelegate() (NOT unregister — keeps playback alive)
  └── exposes: startRecording, commitRecording, pushNoteOn/Off, quantize, etc.

Player (component)
  ├── owns Grid + MidiVisualizer + transport buttons
  ├── auto-starts recording on first pad touch if no sequence exists
  └── commits recording via createLoopSequence() from loopUtils
```

**Key design decisions:**

- `GlobalSequencer` is framework-agnostic — no React imports, communicates via delegates and listeners
- `detachDelegate()` replaces the delegate with a no-op on unmount, keeping the channel's sequence and playback alive while the UI is unmounted
- Overdub recording captures `recordingLoopOffset` (current loop position at recording start) and offsets events on stop, so new recordings are loop-aligned
- Second+ recordings inherit `globalBPM` and enforce `minDurationMs` from the master loop

### Loop Creation Pipeline (`loopUtils.ts`)

```
Raw recorded events (wall-clock timestamps)
  → stopRecording() applies recordingLoopOffset
  → createLoopSequence(events, name, referenceBPM?, minDurationMs?)
    → trim to first noteOn, normalize timestamps
    → detectBPM() if no reference (autocorrelation + IOI histogram)
    → detectPhase() for downbeat alignment
    → bestBarCount() rounds to power-of-two bars
    → fit notes, deduplicate overlaps
  → quantizeEvents() (partial-strength, velocity-aware, legato-preserving)
```

### MidiVisualizer Rendering Modes

MidiVisualizer has three render paths depending on props:

1. **Static** (sequence + no currentMusicalMs) — computes rects once, no RAF loop. Used for session clip previews.
2. **Playback** (sequence + currentMusicalMs) — RAF loop with pre-computed `pairNotes` cache. Shows active note highlighting.
3. **Live/Overdub** (no sequence + loopDuration) — RAF loop, positions notes against master loop using `currentMusicalMs`.

### Screen Flow

`SessionScreen` (grid of channels × clip slots) → navigates to → `SynthScreen` (instrument config tabs + Player)

SessionScreen subscribes to `GlobalSequencer.onChannelSequence()` to show MidiVisualizer previews for channels with recorded sequences.

## Conventions

- Types `LoopSequence`, `NoteEvent`, `NotePair` are defined in `loopUtils.ts` and re-exported/imported from there (not duplicated)
- `GlobalSequencer` types (`ChannelDelegate`, `TransportState`, etc.) are exported from `GlobalSequencer.ts`
- Grid uses `forwardRef` + `useImperativeHandle` for the `setPadActive` API (called by sequencer delegate during playback)
- Skia `PictureRecorder` instances must be per-component (not shared at module level) when multiple MidiVisualizer instances coexist
