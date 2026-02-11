#pragma once
#include "JuceConfig.h"
#include "JuceHeader.h"
#include "BaseOscillatorVoice.h"
#include <atomic>


class BaseOscillatorVoice;   // forward declaration (if in separate file)
class BasicSynthSound;       // forward declaration

class AudioEngine : public juce::AudioIODeviceCallback
{
public:
    AudioEngine();
    ~AudioEngine() override;

    bool initialize();
    void shutdown();

    // Main controls from React Native
    void noteOn(int midiNote, float velocity = 1.0f);
    void noteOff(int midiNote);

    // Future controls (you'll add these later)
    void setWaveform(BaseOscillatorVoice::Waveform type);
    void setADSR(float attackMs, float decayMs, float sustainLevel, float releaseMs);

private:
    // JUCE audio infrastructure
    juce::AudioDeviceManager deviceManager;
    
    // The actual polyphonic synthesizer
    juce::Synthesiser synth;

    // Required overrides
    void audioDeviceAboutToStart(juce::AudioIODevice* device) override;
    void audioDeviceIOCallbackWithContext(const float* const* inputChannelData,
                                         int numInputChannels,
                                         float* const* outputChannelData,
                                         int numOutputChannels,
                                         int numSamples,
                                         const juce::AudioIODeviceCallbackContext& context) override;
    void audioDeviceStopped() override;
};
