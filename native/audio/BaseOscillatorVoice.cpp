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
    freqHz = juce::MidiMessage::getMidiNoteInHertz(midiNoteNumber);

    // Phase deltas are computed in renderNextBlock so param changes
    // (e.g. osc2Semi while a note is held) take effect immediately.
    phase1 = 0.0;
    phase2 = 0.0;
    phaseSub = 0.0;
    noteVelocity = velocity;

    // Reset filter state
    svfIc1eq = 0.0f;
    svfIc2eq = 0.0f;

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

    // Recompute phase deltas each block so parameter changes (osc2Semi,
    // detune, etc.) take effect immediately without retriggering the note.
    {
        double sr = getSampleRate();
        double twoPiOverSr = juce::MathConstants<double>::twoPi / sr;
        double freq1 = freqHz * std::pow(2.0, voiceParams.detuneCents1 / 1200.0);
        phaseDelta1 = freq1 * twoPiOverSr;
        if (voiceParams.osc2Level > 0.0f)
        {
            double freq2 = freqHz * std::pow(2.0, (voiceParams.osc2Semi * 100.0 + voiceParams.detuneCents2) / 1200.0);
            phaseDelta2 = freq2 * twoPiOverSr;
        }
        if (voiceParams.subLevel > 0.0f)
        {
            phaseDeltaSub = (freq1 * 0.5) * twoPiOverSr;
        }
    }

    auto* left  = outputBuffer.getWritePointer(0, startSample);
    auto* right = outputBuffer.getNumChannels() > 1 ?
                  outputBuffer.getWritePointer(1, startSample) : nullptr;

    const double twoPi = juce::MathConstants<double>::twoPi;
    const bool hasOsc2 = voiceParams.osc2Level > 0.0f;
    const bool hasSub = voiceParams.subLevel > 0.0f;
    const bool hasNoise = voiceParams.noiseLevel > 0.0f;
    const bool hasFilter = voiceParams.filterEnabled;

    for (int i = 0; i < numSamples; ++i)
    {
        float env = adsr.getNextSample();

        if (!adsr.isActive())
        {
            clearCurrentNote();
            break;
        }

        // Osc1 (always active)
        float osc = getOscValue(voiceParams.waveform1, phase1);

        // Osc2
        if (hasOsc2)
        {
            osc += getOscValue(voiceParams.waveform2, phase2) * voiceParams.osc2Level;
        }

        // Sub-oscillator
        if (hasSub)
        {
            osc += getOscValue(Waveform::Sine, phaseSub) * voiceParams.subLevel;
        }

        // Noise
        if (hasNoise)
        {
            osc += (noiseRng.nextFloat() * 2.0f - 1.0f) * voiceParams.noiseLevel;
        }

        // Per-voice filter
        if (hasFilter)
        {
            osc = applyFilter(osc, env);
        }

        float sample = osc * (noteVelocity * 0.4f) * env;

        left[i] += sample;
        if (right) right[i] += sample;

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

float BaseOscillatorVoice::getOscValue(Waveform wf, double phase)
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

        default:
            return 0.0f;
    }
}

float BaseOscillatorVoice::applyFilter(float input, float envValue)
{
    // Topology-preserving transform (TPT) State Variable Filter
    // Based on Vadim Zavalishin / Andy Cytomic design — unconditionally stable
    // at all cutoff and resonance values.

    float modulatedCutoff = voiceParams.filterCutoff *
        (1.0f + voiceParams.filterEnvAmount * envValue);

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
