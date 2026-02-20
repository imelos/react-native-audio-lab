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
    double sr = getSampleRate();
    double twoPi = juce::MathConstants<double>::twoPi;

    // Osc1
    double freq1 = freqHz * std::pow(2.0, voiceParams.detuneCents1 / 1200.0);
    phaseDelta1 = freq1 * twoPi / sr;

    // Osc2
    if (voiceParams.osc2Level > 0.0f)
    {
        double freq2 = freqHz * std::pow(2.0, (voiceParams.osc2Semi * 100.0 + voiceParams.detuneCents2) / 1200.0);
        phaseDelta2 = freq2 * twoPi / sr;
    }

    // Sub (one octave below osc1)
    if (voiceParams.subLevel > 0.0f)
    {
        phaseDeltaSub = (freq1 * 0.5) * twoPi / sr;
    }

    phase1 = 0.0;
    phase2 = 0.0;
    phaseSub = 0.0;
    noteVelocity = velocity;

    // Reset filter state
    filterZ1 = 0.0f;
    filterZ2 = 0.0f;

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
    // One-pole RC lowpass with envelope modulation and resonance feedback
    // Cutoff modulated by envelope: baseCutoff * (1 + envAmount * env)
    float modulatedCutoff = voiceParams.filterCutoff *
        (1.0f + voiceParams.filterEnvAmount * envValue);

    // Clamp to Nyquist
    float sr = static_cast<float>(getSampleRate());
    modulatedCutoff = juce::jlimit(20.0f, sr * 0.49f, modulatedCutoff);

    // RC coefficient: alpha = 1 - e^(-2*pi*fc/fs)
    float alpha = 1.0f - std::exp(-juce::MathConstants<float>::twoPi * modulatedCutoff / sr);

    // Apply resonance feedback (subtract filtered feedback)
    float feedback = voiceParams.filterResonance * 4.0f; // scale resonance 0-1 to usable range
    float inputWithFeedback = input - feedback * (filterZ1 - input);

    // Two cascaded one-pole filters for steeper roll-off
    filterZ1 += alpha * (inputWithFeedback - filterZ1);
    filterZ2 += alpha * (filterZ1 - filterZ2);

    return filterZ2;
}
