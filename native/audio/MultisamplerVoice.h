#pragma once
#include "JuceHeader.h"

/**
 * MultiSamplerVoice - A voice that plays back pre-recorded audio samples.
 * Each voice can play one sample at a time, with pitch shifting based on MIDI note.
 */
class MultiSamplerVoice : public juce::SynthesiserVoice
{
public:
    MultiSamplerVoice();
    
    // ──────────────────────────────────────────
    // SynthesiserVoice interface
    // ──────────────────────────────────────────
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
    
    // ──────────────────────────────────────────
    // Sample playback control
    // ──────────────────────────────────────────
    void setADSR(const juce::ADSR::Parameters& params);
    void setPitchBend(float semitones);

private:
    juce::ADSR adsr;
    
    double sourceSamplePosition = 0.0;
    double pitchRatio = 1.0;
    float noteVelocity = 1.0f;
    float pitchBendSemitones = 0.0f;
    
    // Cache the current sound's data for efficient rendering
    const float* leftChannelData = nullptr;
    const float* rightChannelData = nullptr;
    int soundLength = 0;
    double soundSampleRate = 44100.0;
    int soundRootNote = 60; // Middle C by default
};
