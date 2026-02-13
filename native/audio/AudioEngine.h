#pragma once
#include "JuceHeader.h"
#include "Instrument.h"
#include <map>
#include <memory>

/**
 * Enhanced AudioEngine with multi-channel instrument support.
 * Each channel can have its own Instrument with independent configuration and effects.
 */
class AudioEngine : public juce::AudioIODeviceCallback
{
public:
    AudioEngine();
    ~AudioEngine();

    // ──────────────────────────────────────────
    // Initialization
    // ──────────────────────────────────────────
    bool initialize();
    void shutdown();

    // ──────────────────────────────────────────
    // Instrument management
    // ──────────────────────────────────────────
    
    /**
     * Create a new instrument on a specific channel.
     * If an instrument already exists on this channel, it will be replaced.
     * @param channel Channel number (1-16)
     * @param config Instrument configuration
     * @return true if successful
     */
  bool createInstrument(int channel, const Config& config);
    
    /**
     * Create an instrument with default configuration
     */
    bool createInstrument(int channel);
    
    /**
     * Remove an instrument from a channel
     */
    void removeInstrument(int channel);
    
    /**
     * Remove all instruments
     */
    void clearAllInstruments();
    
    /**
     * Check if a channel has an instrument
     */
    bool hasInstrument(int channel) const;
    
    /**
     * Get an instrument by channel (returns nullptr if not found)
     */
    Instrument* getInstrument(int channel);

    // ──────────────────────────────────────────
    // Note control (per channel)
    // ──────────────────────────────────────────
    void noteOn(int channel, int midiNote, float velocity);
    void noteOff(int channel, int midiNote);
    void allNotesOff(int channel);
    void allNotesOffAllChannels();

    // ──────────────────────────────────────────
    // Instrument parameter control
    // ──────────────────────────────────────────
    void setWaveform(int channel, BaseOscillatorVoice::Waveform waveform);
    void setADSR(int channel, float attack, float decay, float sustain, float release);
    void setVolume(int channel, float volume);
    void setPan(int channel, float pan);
    void setDetune(int channel, float cents);

    // ──────────────────────────────────────────
    // Effects management
    // ──────────────────────────────────────────
    int addEffect(int channel, Instrument::EffectType type);
    void removeEffect(int channel, int effectId);
    void clearEffects(int channel);
    void setEffectEnabled(int channel, int effectId, bool enabled);
    void setEffectParameter(int channel, int effectId,
                          const juce::String& paramName, float value);

    // ──────────────────────────────────────────
    // Global controls
    // ──────────────────────────────────────────
    void setMasterVolume(float volume);
    float getMasterVolume() const { return masterVolume; }

    // ──────────────────────────────────────────
    // Info
    // ──────────────────────────────────────────
    int getActiveChannelCount() const;
    std::vector<int> getActiveChannels() const;

    // ──────────────────────────────────────────
    // JUCE AudioIODeviceCallback
    // ──────────────────────────────────────────
    void audioDeviceAboutToStart(juce::AudioIODevice* device) override;
    void audioDeviceIOCallbackWithContext(
        const float* const* inputChannelData,
        int numInputChannels,
        float* const* outputChannelData,
        int numOutputChannels,
        int numSamples,
        const juce::AudioIODeviceCallbackContext& context) override;
    void audioDeviceStopped() override;

private:
    // ──────────────────────────────────────────
    // Members
    // ──────────────────────────────────────────
    juce::AudioDeviceManager deviceManager;
    
    // Map of channel number to Instrument
    std::map<int, std::unique_ptr<Instrument>> instruments;
    
    // Thread safety
    juce::CriticalSection instrumentLock;
    
    // Master controls
    float masterVolume = 1.0f;
    
    // Audio state
    double currentSampleRate = 44100.0;
    int currentBlockSize = 512;
    
    // MIDI buffer for passing to instruments
    juce::MidiBuffer midiBuffer;
    
    // Mix buffer for combining all instruments
    juce::AudioBuffer<float> mixBuffer;

    // ──────────────────────────────────────────
    // Helper methods
    // ──────────────────────────────────────────
    void prepareInstrument(Instrument* instrument);
};
