#include "JuceConfig.h"
#include "BaseOscillatorVoice.h"
#include "BasicSynthSound.h"

BaseOscillatorVoice::BaseOscillatorVoice()
{
    // getSampleRate() usually returns 0 at construction time
    // We set it properly later when rendering begins
}

bool BaseOscillatorVoice::canPlaySound(juce::SynthesiserSound* sound)
{
    return dynamic_cast<BasicSynthSound*>(sound) != nullptr;
}

void BaseOscillatorVoice::startNote(int midiNoteNumber,
                                    float velocity,
                                    juce::SynthesiserSound* /*sound*/,
                                    int /*currentPitchWheelPosition*/)
{
    double newFreq = juce::MidiMessage::getMidiNoteInHertz(midiNoteNumber);

    // Glide: if glideTime > 0 and a previous note was sounding, glide from old freq
    if (voiceParams.glideTime > 0.0f && isVoiceActive() && freqHz > 0.0)
    {
        targetFreqHz = newFreq;
        isGliding = true;
        double sr = getSampleRate();
        if (sr > 0.0)
            glideCoeff = std::exp(-1.0 / (voiceParams.glideTime * sr));
        else
            glideCoeff = 0.99;
        // freqHz stays at current value — we glide from it
    }
    else
    {
        freqHz = newFreq;
        targetFreqHz = newFreq;
        isGliding = false;
    }

    // Phase deltas are computed in renderNextBlock so param changes
    // (e.g. osc2Semi while a note is held) take effect immediately.
    phase1 = 0.0;
    phase2 = 0.0;
    phaseSub = 0.0;
    noteVelocity = velocity;

    // Reset unison phases
    for (int i = 0; i < 8; ++i)
        unisonPhases[i] = 0.0;

    // Reset filter state
    svfIc1eq = 0.0f;
    svfIc2eq = 0.0f;

    // Reset LFO phase
    lfoPhase = 0.0;

    adsr.noteOn();
}

void BaseOscillatorVoice::stopNote(float /*velocity*/, bool allowTailOff)
{
    adsr.noteOff();

    if (!allowTailOff || !adsr.isActive())
    {
        clearCurrentNote();
    }
}

void BaseOscillatorVoice::renderNextBlock(juce::AudioBuffer<float>& outputBuffer,
                                          int startSample,
                                          int numSamples)
{
    if (!isVoiceActive())
        return;

    if (getSampleRate() > 0.0)
        adsr.setSampleRate(getSampleRate());

    juce::ScopedNoDenormals noDenormals;

    double sr = getSampleRate();
    double twoPiOverSr = juce::MathConstants<double>::twoPi / sr;
    const double twoPi = juce::MathConstants<double>::twoPi;

    const bool hasOsc2 = voiceParams.osc2Level > 0.0f;
    const bool hasSub = voiceParams.subLevel > 0.0f;
    const bool hasNoise = voiceParams.noiseLevel > 0.0f;
    const bool hasFilter = voiceParams.filterEnabled;
    const bool hasLfo = voiceParams.lfoDepth > 0.0f;
    const int unisonCount = voiceParams.unisonCount;
    const bool hasUnison = unisonCount > 1;
    const float unisonGain = hasUnison ? (1.0f / std::sqrt(static_cast<float>(unisonCount))) : 1.0f;

    auto* left  = outputBuffer.getWritePointer(0, startSample);
    auto* right = outputBuffer.getNumChannels() > 1 ?
                  outputBuffer.getWritePointer(1, startSample) : nullptr;

    for (int i = 0; i < numSamples; ++i)
    {
        float env = adsr.getNextSample();

        if (!adsr.isActive())
        {
            clearCurrentNote();
            break;
        }

        // ── Glide: per-sample frequency smoothing ──
        if (isGliding)
        {
            freqHz += (targetFreqHz - freqHz) * (1.0 - glideCoeff);
            if (std::abs(freqHz - targetFreqHz) < 0.01)
            {
                freqHz = targetFreqHz;
                isGliding = false;
            }
        }

        // ── LFO ──
        float lfoValue = 0.0f;
        float lfoFilterMod = 0.0f;
        float lfoVolMod = 1.0f;
        double lfoFreqMul = 1.0;
        if (hasLfo)
        {
            lfoValue = getOscValue(voiceParams.lfoWaveform, lfoPhase, 0.5f) * voiceParams.lfoDepth;
            lfoPhase += voiceParams.lfoRate * twoPiOverSr;
            if (lfoPhase >= twoPi) lfoPhase -= twoPi;

            switch (voiceParams.lfoDestination)
            {
                case 0: // Pitch: ±200 cents max
                    lfoFreqMul = std::pow(2.0, static_cast<double>(lfoValue) * 200.0 / 1200.0);
                    break;
                case 1: // Filter: passed to applyFilter
                    lfoFilterMod = lfoValue;
                    break;
                case 2: // Volume: tremolo
                    lfoVolMod = 1.0f + lfoValue;
                    break;
            }
        }

        // ── Compute phase deltas with LFO pitch mod ──
        double effectiveFreq = freqHz * lfoFreqMul;
        double freq1 = effectiveFreq * std::pow(2.0, voiceParams.detuneCents1 / 1200.0);
        phaseDelta1 = freq1 * twoPiOverSr;

        if (hasOsc2)
        {
            double freq2 = effectiveFreq * std::pow(2.0, (voiceParams.osc2Semi * 100.0 + voiceParams.detuneCents2) / 1200.0);
            phaseDelta2 = freq2 * twoPiOverSr;
        }
        if (hasSub)
        {
            phaseDeltaSub = (freq1 * 0.5) * twoPiOverSr;
        }

        // ── Osc1 (with optional unison) ──
        float osc = 0.0f;
        float oscLeft = 0.0f;
        float oscRight = 0.0f;

        if (hasUnison)
        {
            // Render multiple detuned copies of osc1 with stereo spread
            float halfSpread = voiceParams.unisonSpread * 0.5f;
            for (int u = 0; u < unisonCount; ++u)
            {
                // Detune: spread evenly from -halfSpread to +halfSpread
                float detuneOffset = (unisonCount == 1) ? 0.0f :
                    -halfSpread + (static_cast<float>(u) / static_cast<float>(unisonCount - 1)) * voiceParams.unisonSpread;
                double uniFreq = freq1 * std::pow(2.0, static_cast<double>(detuneOffset) / 1200.0);
                double uniDelta = uniFreq * twoPiOverSr;

                float sample = getOscValue(voiceParams.waveform1, unisonPhases[u], voiceParams.pulseWidth) * unisonGain;

                // Stereo pan: distribute voices across stereo field
                float pan = (unisonCount == 1) ? 0.5f :
                    static_cast<float>(u) / static_cast<float>(unisonCount - 1); // 0..1
                oscLeft += sample * (1.0f - pan);
                oscRight += sample * pan;

                unisonPhases[u] += uniDelta;
                if (unisonPhases[u] >= twoPi) unisonPhases[u] -= twoPi;
            }
        }
        else
        {
            // Single osc1
            osc = getOscValue(voiceParams.waveform1, phase1, voiceParams.pulseWidth);
        }

        // Osc2
        float osc2Sample = 0.0f;
        if (hasOsc2)
        {
            osc2Sample = getOscValue(voiceParams.waveform2, phase2, voiceParams.pulseWidth) * voiceParams.osc2Level;
        }

        // Sub-oscillator
        float subSample = 0.0f;
        if (hasSub)
        {
            subSample = getOscValue(Waveform::Sine, phaseSub) * voiceParams.subLevel;
        }

        // Noise
        float noiseSample = 0.0f;
        if (hasNoise)
        {
            noiseSample = (noiseRng.nextFloat() * 2.0f - 1.0f) * voiceParams.noiseLevel;
        }

        // ── Mix and output ──
        float sampleLeft, sampleRight;
        if (hasUnison)
        {
            float mono = osc2Sample + subSample + noiseSample;
            sampleLeft = oscLeft + mono;
            sampleRight = oscRight + mono;
        }
        else
        {
            float mono = osc + osc2Sample + subSample + noiseSample;
            sampleLeft = mono;
            sampleRight = mono;
        }

        // Per-voice filter (apply to both channels equally)
        if (hasFilter)
        {
            // Filter uses left channel for state (mono filter applied identically)
            sampleLeft = applyFilter(sampleLeft, env, lfoFilterMod);
            // For right channel in unison mode, we approximate by using same filter output ratio
            if (hasUnison && std::abs(sampleLeft) > 0.0001f)
            {
                // Simple approach: filter left, scale right by same ratio
                // This avoids needing a second filter state
                float unfilteredLeft = (hasUnison ? oscLeft : osc) + osc2Sample + subSample + noiseSample;
                if (std::abs(unfilteredLeft) > 0.0001f)
                {
                    float filterRatio = sampleLeft / unfilteredLeft;
                    sampleRight *= filterRatio;
                }
            }
            else
            {
                sampleRight = sampleLeft; // mono path
            }
        }

        float gain = noteVelocity * 0.4f * env * lfoVolMod;
        sampleLeft *= gain;
        sampleRight *= gain;

        left[i] += sampleLeft;
        if (right) right[i] += sampleRight;

        // Advance phases
        phase1 += phaseDelta1;
        if (phase1 >= twoPi) phase1 -= twoPi;

        if (hasOsc2)
        {
            phase2 += phaseDelta2;
            if (phase2 >= twoPi) phase2 -= twoPi;
        }

        if (hasSub)
        {
            phaseSub += phaseDeltaSub;
            if (phaseSub >= twoPi) phaseSub -= twoPi;
        }
    }
}

void BaseOscillatorVoice::pitchWheelMoved(int /*newPitchWheelValue*/)
{
}

void BaseOscillatorVoice::controllerMoved(int /*controllerNumber*/, int /*newControllerValue*/)
{
}

void BaseOscillatorVoice::setWaveform(Waveform newType)
{
    voiceParams.waveform1 = newType;
}

void BaseOscillatorVoice::setADSR(const juce::ADSR::Parameters& params)
{
    adsr.setParameters(params);
}

void BaseOscillatorVoice::setDetune(float cents)
{
    voiceParams.detuneCents1 = cents;
}

void BaseOscillatorVoice::setVoiceParams(const VoiceParams& params)
{
    voiceParams = params;
}

float BaseOscillatorVoice::getOscValue(Waveform wf, double phase, float pulseWidth)
{
    switch (wf)
    {
        case Waveform::Sine:
            return static_cast<float>(std::sin(phase));

        case Waveform::Saw:
            return 2.0f * static_cast<float>(phase / juce::MathConstants<double>::twoPi) - 1.0f;

        case Waveform::Square:
            return (phase < juce::MathConstants<double>::pi) ? 1.0f : -1.0f;

        case Waveform::Triangle:
            {
                double norm = phase / juce::MathConstants<double>::twoPi;
                return 2.0f * std::abs(2.0f * static_cast<float>(norm) - 1.0f) - 1.0f;
            }

        case Waveform::Pulse:
            return (phase < static_cast<double>(pulseWidth) * juce::MathConstants<double>::twoPi) ? 1.0f : -1.0f;

        default:
            return 0.0f;
    }
}

float BaseOscillatorVoice::applyFilter(float input, float envValue, float lfoFilterMod)
{
    // Topology-preserving transform (TPT) State Variable Filter
    // Based on Vadim Zavalishin / Andy Cytomic design — unconditionally stable
    // at all cutoff and resonance values.

    float modulatedCutoff = voiceParams.filterCutoff *
        (1.0f + voiceParams.filterEnvAmount * envValue);

    // Apply LFO filter modulation (±3 octaves)
    if (lfoFilterMod != 0.0f)
    {
        modulatedCutoff *= std::pow(2.0f, lfoFilterMod * 3.0f);
    }

    float sr = static_cast<float>(getSampleRate());
    modulatedCutoff = juce::jlimit(20.0f, sr * 0.49f, modulatedCutoff);

    // g = tan(pi * fc / fs) — pre-warped cutoff coefficient
    float g = std::tan(juce::MathConstants<float>::pi * modulatedCutoff / sr);

    // k = damping factor: k = 2 - 2*resonance gives range [2..0]
    // k=2 is no resonance, k→0 is self-oscillation. We clamp at 0.1 for safety.
    float k = juce::jlimit(0.1f, 2.0f, 2.0f * (1.0f - voiceParams.filterResonance));

    // Coefficients
    float a1 = 1.0f / (1.0f + g * (g + k));
    float a2 = g * a1;
    float a3 = g * a2;

    // Tick the SVF
    float v3 = input - svfIc2eq;
    float v1 = a1 * svfIc1eq + a2 * v3;
    float v2 = svfIc2eq + a2 * svfIc1eq + a3 * v3;

    svfIc1eq = 2.0f * v1 - svfIc1eq;
    svfIc2eq = 2.0f * v2 - svfIc2eq;

    // v2 = lowpass output
    return v2;
}
