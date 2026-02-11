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
    phase = 0.0;
    envelopeTarget = 1.0f;
    noteTriggered = true;
    isPlaying = true;
}

void AudioEngine::stopNote() {
    envelopeTarget = 0.0f;
    noteTriggered = false;
}

void AudioEngine::audioDeviceIOCallbackWithContext(const float* const* inputChannelData,
                                        int numInputChannels,
                                        float* const* outputChannelData,
                                        int numOutputChannels,
                                        int numSamples,
                                        const juce::AudioIODeviceCallbackContext& context) {
  // Calculate envelope increment per sample
      float attackIncrement = 1.0f / (attackTime * sampleRate);
      float releaseIncrement = 1.0f / (releaseTime * sampleRate);
      
      for (int i = 0; i < numSamples; ++i) {
          // Update envelope
          if (envelope < envelopeTarget) {
              envelope += attackIncrement;
              if (envelope > envelopeTarget) envelope = envelopeTarget;
          } else if (envelope > envelopeTarget) {
              envelope -= releaseIncrement;
              if (envelope < envelopeTarget) envelope = envelopeTarget;
              if (envelope <= 0.0f) isPlaying = false;  // Stop only when envelope reaches 0
          }
          
          if (isPlaying || envelope > 0.0f) {
              float frequency = 440.0f * std::pow(2.0f, (currentNote - 69) / 12.0f);
              float sample = std::sin(phase) * 0.25f * envelope;  // Apply envelope
              
              for (int channel = 0; channel < numOutputChannels; ++channel) {
                  outputChannelData[channel][i] = sample;
              }
              
              phase += 2.0 * M_PI * frequency / sampleRate;
              if (phase > 2.0 * M_PI) {
                  phase -= 2.0 * M_PI;
              }
          } else {
              for (int channel = 0; channel < numOutputChannels; ++channel) {
                  outputChannelData[channel][i] = 0.0f;
              }
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
