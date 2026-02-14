#pragma once
#include "JuceHeader.h"
#include "MultiSamplerVoice.h"
#include "MultiSamplerSound.h"

// Forward declarations for config structs
namespace MultiSamplerConfig
{
    struct SampleConfig
    {
        juce::String name;
        int rootNote = 60;  // Middle C
        int minNote = 0;
        int maxNote = 127;
    };
    
    struct Config
    {
        int polyphony = 32;  // Higher polyphony for sample playback
        juce::ADSR::Parameters adsrParams { 0.001f, 0.01f, 1.0f, 0.1f };
        float volume = 0.7f;
        float pan = 0.5f;
        juce::String name = "Untitled Sampler";
    };
}

/**
 * MultiSamplerInstrument - A sample-based instrument that can load and play
 * up to 16 audio samples, each mapped to different MIDI note ranges.
 */
class MultiSamplerInstrument
{
public:
    using SampleConfig = MultiSamplerConfig::SampleConfig;
    using Config = MultiSamplerConfig::Config;
    
    MultiSamplerInstrument(const Config& config = Config());
    ~MultiSamplerInstrument();
    
    // ──────────────────────────────────────────
    // Core functionality
    // ──────────────────────────────────────────
    void prepareToPlay(double sampleRate, int samplesPerBlock);
    void renderNextBlock(juce::AudioBuffer<float>& buffer,
                        const juce::MidiBuffer& midiMessages,
                        int startSample,
                        int numSamples);
    
    // ──────────────────────────────────────────
    // Sample loading (0-15 = 16 slots)
    // ──────────────────────────────────────────
    
    /**
     * Load a sample from file path
     * @param slotIndex Sample slot (0-15)
     * @param filePath Path to audio file (wav, aiff, mp3, etc.)
     * @param config Sample configuration (note mapping)
     * @return true if successful
     */
    bool loadSample(int slotIndex, const juce::String& filePath, const SampleConfig& config);
    
    /**
     * Load a sample from audio buffer
     * @param slotIndex Sample slot (0-15)
     * @param audioData Audio buffer containing the sample
     * @param sampleRate Sample rate of the audio data
     * @param config Sample configuration (note mapping)
     * @return true if successful
     */
    bool loadSampleFromBuffer(int slotIndex,
                             juce::AudioBuffer<float>& audioData,
                             double sampleRate,
                             const SampleConfig& config);
    
    /**
     * Remove a sample from a slot
     */
    void clearSample(int slotIndex);
    
    /**
     * Remove all samples
     */
    void clearAllSamples();
    
    /**
     * Check if a slot has a sample loaded
     */
    bool hasSample(int slotIndex) const;
    
    /**
     * Get info about a loaded sample
     */
    juce::String getSampleName(int slotIndex) const;
    int getSampleRootNote(int slotIndex) const;
    
    // ──────────────────────────────────────────
    // Note control
    // ──────────────────────────────────────────
    void noteOn(int midiNote, float velocity);
    void noteOff(int midiNote, bool allowTailOff = true);
    void allNotesOff();
    
    // ──────────────────────────────────────────
    // Parameter control
    // ──────────────────────────────────────────
    void setADSR(const juce::ADSR::Parameters& params);
    void setVolume(float volume);
    void setPan(float pan);
    
    // ──────────────────────────────────────────
    // Info
    // ──────────────────────────────────────────
    const juce::String& getName() const { return config.name; }
    void setName(const juce::String& newName) { config.name = newName; }
    int getPolyphony() const { return config.polyphony; }
    float getVolume() const { return config.volume; }
    float getPan() const { return config.pan; }
    bool isActive() const;
    int getLoadedSampleCount() const;

private:
    Config config;
    juce::Synthesiser synth;
    
    // Track which slots have samples loaded
    std::array<bool, 16> sampleSlots;
    
    double currentSampleRate = 44100.0;
    int currentBlockSize = 512;
    
    juce::AudioFormatManager formatManager;
    
    // ──────────────────────────────────────────
    // Helper methods
    // ──────────────────────────────────────────
    void updateVoiceParameters();
    void applyVolumeAndPan(juce::AudioBuffer<float>& buffer, int numSamples);
    bool isValidSlot(int slotIndex) const { return slotIndex >= 0 && slotIndex < 16; }
};
