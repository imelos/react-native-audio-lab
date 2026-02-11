#pragma once
#include "JuceHeader.h"
#include <juce_audio_basics/juce_audio_basics.h>

// Forward declaration (so we can use it in canPlaySound without including the full header)
class BasicSynthSound;

class BaseOscillatorVoice : public juce::SynthesiserVoice
{
public:
    BaseOscillatorVoice();

    // Required SynthesiserVoice overrides
    bool canPlaySound(juce::SynthesiserSound* sound) override;

    void startNote(int midiNoteNumber,
                   float velocity,
                   juce::SynthesiserSound* sound,
                   int currentPitchWheelPosition) override;

    void stopNote(float velocity, bool allowTailOff) override;

    void renderNextBlock(juce::AudioBuffer<float>& outputBuffer,
                         int startSample,
                         int numSamples) override;

    void pitchWheelMoved(int newPitchWheelValue) override;
    void controllerMoved(int controllerNumber, int newControllerValue) override;

    // Your public interface
    enum class Waveform { Sine, Saw, Square, Triangle };

    void setWaveform(Waveform newType);
    void setADSR(const juce::ADSR::Parameters& params);
    void setDetune(float cents);

private:
    Waveform waveform = Waveform::Sine;

    double currentPhase     = 0.0;
    double phaseDelta       = 0.0;
    double freqHz           = 440.0;

    float noteVelocity      = 1.0f;
    float detuneCents       = 0.0f;

    juce::ADSR adsr;

    float getOscValue(double phase) const;
};
