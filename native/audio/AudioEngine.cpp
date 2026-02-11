//#include "JuceConfig.h"
#include "AudioEngine.h"
#include <cmath>

AudioEngine::AudioEngine() {
}

AudioEngine::~AudioEngine() {
    shutdown();
}

bool AudioEngine::initialize() {
    // Initialize the audio device
    juce::String error = deviceManager.initialise(
        0,     // number of input channels
        2,     // number of output channels
        nullptr,
        true   // select default device on failure
    );
    
    if (error.isNotEmpty()) {
        // Handle error
        return false;
    }
    
    deviceManager.addAudioCallback(this);
    return true;
}

void AudioEngine::shutdown() {
    deviceManager.removeAudioCallback(this);
    deviceManager.closeAudioDevice();
}

void AudioEngine::startNote(int midiNote) {
    currentNote = midiNote;
    phase = 0.0;  // Reset phase to avoid clicks
    isPlaying = true;
}

void AudioEngine::stopNote() {
    isPlaying = false;
}

void AudioEngine::audioDeviceIOCallbackWithContext(const float* const* inputChannelData,
                                        int numInputChannels,
                                        float* const* outputChannelData,
                                        int numOutputChannels,
                                        int numSamples,
                                        const juce::AudioIODeviceCallbackContext& context) {
    if (isPlaying) {
        // Simple sine wave synthesis
        for (int i = 0; i < numSamples; ++i) {
            // Convert MIDI note to frequency
            float frequency = 440.0f * std::pow(2.0f, (currentNote - 69) / 12.0f);
            
            // Generate sine wave sample
            float sample = std::sin(phase) * 0.25f;  // 0.25 = volume
            
            // Write to all output channels
            for (int channel = 0; channel < numOutputChannels; ++channel) {
                outputChannelData[channel][i] = sample;
            }
            
            // Update phase
            phase += 2.0 * M_PI * frequency / sampleRate;
            if (phase > 2.0 * M_PI) {
                phase -= 2.0 * M_PI;
            }
        }
    } else {
        // Silence - clear all output buffers
        for (int channel = 0; channel < numOutputChannels; ++channel) {
            juce::FloatVectorOperations::clear(outputChannelData[channel], numSamples);
        }
    }
}

void AudioEngine::audioDeviceAboutToStart(juce::AudioIODevice* device) {
    sampleRate = device->getCurrentSampleRate();
    phase = 0.0;
}

void AudioEngine::audioDeviceStopped() {
    // Clean up if needed
}
