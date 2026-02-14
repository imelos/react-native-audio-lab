#pragma once
#include "JuceHeader.h"

/**
 * MultiSamplerSound - Holds a single audio sample and its mapping to MIDI notes.
 * Each sound contains the audio data and metadata about which notes it responds to.
 */
class MultiSamplerSound : public juce::SynthesiserSound
{
public:
    /**
     * Create a sampler sound from audio data
     * @param name Display name for this sample
     * @param audioData Audio buffer containing the sample
     * @param rootNote The MIDI note that plays this sample at original pitch (0-127)
     * @param minNote Minimum MIDI note that triggers this sample (0-127)
     * @param maxNote Maximum MIDI note that triggers this sample (0-127)
     */
    MultiSamplerSound(const juce::String& name,
                      juce::AudioBuffer<float>& audioData,
                      int rootNote,
                      int minNote,
                      int maxNote);
    
    ~MultiSamplerSound() override;
    
    // ──────────────────────────────────────────
    // SynthesiserSound interface
    // ──────────────────────────────────────────
    bool appliesToNote(int midiNoteNumber) override;
    bool appliesToChannel(int midiChannel) override;
    
    // ──────────────────────────────────────────
    // Sample data access
    // ──────────────────────────────────────────
    const float* getAudioData(int channel) const;
    int getAudioDataLength() const { return length; }
    int getNumChannels() const { return numChannels; }
    double getSampleRate() const { return sourceSampleRate; }
    
    // ──────────────────────────────────────────
    // Sample properties
    // ──────────────────────────────────────────
    int getRootNote() const { return rootNote; }
    int getMinNote() const { return minNote; }
    int getMaxNote() const { return maxNote; }
    const juce::String& getName() const { return name; }
    
    void setRootNote(int note) { rootNote = juce::jlimit(0, 127, note); }
    void setNoteRange(int min, int max);

private:
    juce::String name;
    juce::AudioBuffer<float> data;
    
    int rootNote;
    int minNote;
    int maxNote;
    
    int length;
    int numChannels;
    double sourceSampleRate;
    
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MultiSamplerSound)
};
