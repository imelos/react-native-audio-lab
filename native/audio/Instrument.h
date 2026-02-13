#pragma once
#include "JuceHeader.h"
#include "BaseOscillatorVoice.h"
#include "BasicSynthSound.h"

/**
 * Instrument - A complete synthesizer with its own voice configuration,
 * effects chain, and parameters. Each channel can have its own Instrument.
 */

struct Config
{
    int polyphony = 16;
    BaseOscillatorVoice::Waveform waveform = BaseOscillatorVoice::Waveform::Sine;
    juce::ADSR::Parameters adsrParams { 0.01f, 0.1f, 0.8f, 0.3f };
    float volume = 0.7f;
    float pan = 0.5f;  // 0.0 = left, 0.5 = center, 1.0 = right
    juce::String name = "Untitled Instrument";
};
class Instrument
{
public:
    

    Instrument(const Config& config = Config());
    ~Instrument();

    // ──────────────────────────────────────────
    // Core functionality
    // ──────────────────────────────────────────
    void prepareToPlay(double sampleRate, int samplesPerBlock);
    void renderNextBlock(juce::AudioBuffer<float>& buffer,
                        const juce::MidiBuffer& midiMessages,
                        int startSample,
                        int numSamples);

    // ──────────────────────────────────────────
    // Note control
    // ──────────────────────────────────────────
    void noteOn(int midiNote, float velocity);
    void noteOff(int midiNote, bool allowTailOff = true);
    void allNotesOff();

    // ──────────────────────────────────────────
    // Parameter control
    // ──────────────────────────────────────────
    void setWaveform(BaseOscillatorVoice::Waveform waveform);
    void setADSR(const juce::ADSR::Parameters& params);
    void setVolume(float volume);  // 0.0 to 1.0
    void setPan(float pan);        // 0.0 (left) to 1.0 (right)
    void setDetune(float cents);
    
    // ──────────────────────────────────────────
    // Effects chain management
    // ──────────────────────────────────────────
    enum class EffectType
    {
        Reverb,
        Delay,
        Chorus,
        Distortion,
        Filter,
        Compressor
    };

    // Add an effect to the chain (returns effect ID)
    int addEffect(EffectType type);
    
    // Remove an effect by ID
    void removeEffect(int effectId);
    
    // Remove all effects
    void clearEffects();
    
    // Enable/disable an effect
    void setEffectEnabled(int effectId, bool enabled);
    
    // Set effect parameters (specific to each effect type)
    void setEffectParameter(int effectId, const juce::String& paramName, float value);

    // ──────────────────────────────────────────
    // Info & state
    // ──────────────────────────────────────────
    const juce::String& getName() const { return config.name; }
    void setName(const juce::String& newName) { config.name = newName; }
    
    int getPolyphony() const { return config.polyphony; }
    float getVolume() const { return config.volume; }
    float getPan() const { return config.pan; }
    
    bool isActive() const;  // Returns true if any voices are active

    // ──────────────────────────────────────────
    // Effect base class (lightweight)
    // ──────────────────────────────────────────
    class EffectProcessor
    {
    public:
        virtual ~EffectProcessor() = default;
        virtual void prepareToPlay(double sampleRate, int samplesPerBlock) = 0;
        virtual void releaseResources() = 0;
        virtual void processBlock(juce::AudioBuffer<float>& buffer) = 0;
    };

private:
    // ──────────────────────────────────────────
    // Effect wrapper
    // ──────────────────────────────────────────
    struct Effect
    {
        int id;
        EffectType type;
        bool enabled = true;
        std::unique_ptr<EffectProcessor> processor;
        
        Effect(int id, EffectType type, std::unique_ptr<EffectProcessor> proc)
            : id(id), type(type), processor(std::move(proc)) {}
    };

    // ──────────────────────────────────────────
    // Members
    // ──────────────────────────────────────────
    Config config;
    juce::Synthesiser synth;
    std::vector<std::unique_ptr<Effect>> effectsChain;
    
    double currentSampleRate = 44100.0;
    int currentBlockSize = 512;
    
    int nextEffectId = 1;
    
    // Temporary buffers for effects processing
    juce::AudioBuffer<float> effectsBuffer;
    juce::MidiBuffer emptyMidiBuffer;  // For effects that need MIDI input

    // ──────────────────────────────────────────
    // Helper methods
    // ──────────────────────────────────────────
    void updateVoiceParameters();
    std::unique_ptr<EffectProcessor> createEffect(EffectType type);
    void processEffectsChain(juce::AudioBuffer<float>& buffer, int numSamples);
    void applyVolumeAndPan(juce::AudioBuffer<float>& buffer, int numSamples);
};
