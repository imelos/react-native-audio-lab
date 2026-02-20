#pragma once
#include "JuceHeader.h"
#include "Instrument.h"
#include "MultiSamplerInstrument.h"
#include <map>
#include <memory>
#include <variant>

/**
 * Enhanced AudioEngine with multi-channel instrument support.
 * Each channel can have either an Oscillator-based Instrument or a MultiSamplerInstrument.
 */
class AudioEngine : public juce::AudioIODeviceCallback
{
public:
    enum class InstrumentType
    {
        Oscillator,
        MultiSampler
    };
    
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
     * Create an oscillator-based instrument on a specific channel.
     * @param channel Channel number (1-16)
     * @param config Instrument configuration
     * @return true if successful
     */
    bool createOscillatorInstrument(int channel, const Config& config);
    bool createOscillatorInstrument(int channel);
    
    /**
     * Create a multi-sampler instrument on a specific channel.
     * @param channel Channel number (1-16)
     * @param config MultiSampler configuration
     * @return true if successful
     */
    bool createMultiSamplerInstrument(int channel, const MultiSamplerConfig::Config& config);
    bool createMultiSamplerInstrument(int channel);
    
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
     * Get instrument type for a channel
     */
    InstrumentType getInstrumentType(int channel) const;
    
    /**
     * Get oscillator instrument by channel (returns nullptr if not oscillator type)
     */
    Instrument* getOscillatorInstrument(int channel);
    
    /**
     * Get multi-sampler instrument by channel (returns nullptr if not sampler type)
     */
    MultiSamplerInstrument* getMultiSamplerInstrument(int channel);

    // ──────────────────────────────────────────
    // Sample loading (for MultiSampler instruments)
    // ──────────────────────────────────────────
    bool loadSample(int channel, int slotIndex, const juce::String& filePath,
                   const MultiSamplerConfig::SampleConfig& config);
    bool loadSampleFromBase64(int channel, int slotIndex, const juce::String& base64Data,
                             double sampleRate, int numChannels,
                             const MultiSamplerConfig::SampleConfig& config);
    void clearSample(int channel, int slotIndex);
    void clearAllSamples(int channel);

    // ──────────────────────────────────────────
    // Note control (per channel)
    // ──────────────────────────────────────────
    void noteOn(int channel, int midiNote, float velocity);
    void noteOff(int channel, int midiNote);
    void allNotesOff(int channel);
    void allNotesOffAllChannels();

    // ──────────────────────────────────────────
    // Oscillator parameter control (only affects oscillator instruments)
    // ──────────────────────────────────────────
    void setWaveform(int channel, BaseOscillatorVoice::Waveform waveform);
    void setDetune(int channel, float cents);
    void setVoiceParams(int channel, const BaseOscillatorVoice::VoiceParams& params);

    // ──────────────────────────────────────────
    // Common parameter control (works for both instrument types)
    // ──────────────────────────────────────────
    void setADSR(int channel, float attack, float decay, float sustain, float release);
    void setVolume(int channel, float volume);
    void setPan(int channel, float pan);

    // ──────────────────────────────────────────
    // Effects management (only for oscillator instruments)
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
    // Instrument wrapper to hold either type
    // ──────────────────────────────────────────
    struct InstrumentWrapper
    {
        InstrumentType type;
        std::variant<std::unique_ptr<Instrument>,
                    std::unique_ptr<MultiSamplerInstrument>> instrument;
        
        InstrumentWrapper(std::unique_ptr<Instrument> osc)
            : type(InstrumentType::Oscillator)
            , instrument(std::move(osc))
        {}
        
        InstrumentWrapper(std::unique_ptr<MultiSamplerInstrument> sampler)
            : type(InstrumentType::MultiSampler)
            , instrument(std::move(sampler))
        {}
    };

    // ──────────────────────────────────────────
    // Members
    // ──────────────────────────────────────────
    juce::AudioDeviceManager deviceManager;
    
    // Map of channel number to InstrumentWrapper
    std::map<int, std::unique_ptr<InstrumentWrapper>> instruments;
    
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
    void prepareInstrumentWrapper(InstrumentWrapper* wrapper);
    InstrumentWrapper* getInstrumentWrapper(int channel);
};
