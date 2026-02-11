#pragma once
#include "JuceConfig.h"
#include "JuceHeader.h"
#include <atomic>

class AudioEngine : public juce::AudioIODeviceCallback {
public:
    AudioEngine();
    ~AudioEngine();
    
    bool initialize();
    void shutdown();
    
    void startNote(int midiNote);
    void stopNote();
    
    // JUCE AudioIODeviceCallback methods
    void audioDeviceIOCallbackWithContext(const float* const* inputChannelData,
                                           int numInputChannels,
                                           float* const* outputChannelData,
                                           int numOutputChannels,
                                           int numSamples,
                                           const juce::AudioIODeviceCallbackContext& context) override;
    
    void audioDeviceAboutToStart(juce::AudioIODevice* device) override;
    void audioDeviceStopped() override;

private:
    juce::AudioDeviceManager deviceManager;
    
    std::atomic<bool> isPlaying{false};
    std::atomic<bool> noteTriggered{false};
    std::atomic<int> currentNote{60};  // Middle C
    double phase = 0.0;
    double sampleRate = 44100.0;
    float envelope = 0.0f;
    float envelopeTarget = 0.0f;
    const float attackTime = 0.01f;   // 10ms attack
    const float releaseTime = 0.05f;  // 50ms release
};
