#include "JuceConfig.h"
#include "BaseOscillatorVoice.h"
#include "BasicSynthSound.h"

// If canPlaySound uses BasicSynthSound → include it here:
// #include "BasicSynthSound.h"

BaseOscillatorVoice::BaseOscillatorVoice()
{
    // Important: do NOT call adsr.setSampleRate(getSampleRate()) here
    // getSampleRate() usually returns 0 at construction time
    // We set it properly later when rendering begins
}

bool BaseOscillatorVoice::canPlaySound(juce::SynthesiserSound* sound)
{
    // Replace with your actual sound class name
    return dynamic_cast<BasicSynthSound*>(sound) != nullptr;
}

void BaseOscillatorVoice::startNote(int midiNoteNumber,
                                    float velocity,
                                    juce::SynthesiserSound* /*sound*/,
                                    int /*currentPitchWheelPosition*/)
{
    freqHz = juce::MidiMessage::getMidiNoteInHertz(midiNoteNumber);
    freqHz *= std::pow(2.0, detuneCents / 1200.0);

    phaseDelta = freqHz * juce::MathConstants<double>::twoPi / getSampleRate();

    currentPhase = 0.0;
    noteVelocity = velocity;

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

    // Update sample rate if it changed (very important!)
    if (getSampleRate() > 0.0)
        adsr.setSampleRate(getSampleRate());

    juce::ScopedNoDenormals noDenormals;

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

        float osc = getOscValue(currentPhase);

        float sample = osc * (noteVelocity * 0.4f) * env;

        left[i] += sample;
        if (right) right[i] += sample;

        currentPhase += phaseDelta;
        if (currentPhase >= juce::MathConstants<double>::twoPi)
            currentPhase -= juce::MathConstants<double>::twoPi;
    }
}

void BaseOscillatorVoice::pitchWheelMoved(int /*newPitchWheelValue*/)
{
    // Implement pitch bend if needed later
}

void BaseOscillatorVoice::controllerMoved(int /*controllerNumber*/, int /*newControllerValue*/)
{
    // Implement modulation / controllers if needed later
}

void BaseOscillatorVoice::setWaveform(Waveform newType)
{
    waveform = newType;
}

void BaseOscillatorVoice::setADSR(const juce::ADSR::Parameters& params)
{
    adsr.setParameters(params);
}

void BaseOscillatorVoice::setDetune(float cents)
{
    detuneCents = cents;
}

float BaseOscillatorVoice::getOscValue(double phase) const
{
    switch (waveform)
    {
        case Waveform::Sine:
            return std::sin(phase);

        case Waveform::Saw:
            return 2.0f * float(phase / juce::MathConstants<double>::twoPi) - 1.0f;

        case Waveform::Square:
            return (phase < juce::MathConstants<double>::pi) ? 1.0f : -1.0f;

        case Waveform::Triangle:
            {
                double norm = phase / juce::MathConstants<double>::twoPi;
                return 2.0f * std::abs(2.0f * norm - 1.0f) - 1.0f;
            }

        default:
            return 0.0f;
    }
}
