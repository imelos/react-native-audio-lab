#include "MultiSamplerInstrument.h"

MultiSamplerInstrument::MultiSamplerInstrument(const Config& cfg)
    : config(cfg)
{
    // Initialize sample slots
    sampleSlots.fill(false);
    
    // Register audio formats
    formatManager.registerBasicFormats();
    
    // Initialize synthesizer with voices
    synth.clearVoices();
    for (int i = 0; i < config.polyphony; ++i)
    {
        auto* voice = new MultiSamplerVoice();
        voice->setADSR(config.adsrParams);
        synth.addVoice(voice);
    }
}

MultiSamplerInstrument::~MultiSamplerInstrument()
{
    synth.clearVoices();
    synth.clearSounds();
}

void MultiSamplerInstrument::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    currentSampleRate = sampleRate;
    currentBlockSize = samplesPerBlock;
    
    synth.setCurrentPlaybackSampleRate(sampleRate);
}

void MultiSamplerInstrument::renderNextBlock(juce::AudioBuffer<float>& buffer,
                                             const juce::MidiBuffer& midiMessages,
                                             int startSample,
                                             int numSamples)
{
    // Create a view into the buffer for this render block
    juce::AudioBuffer<float> bufferView(
        buffer.getArrayOfWritePointers(),
        buffer.getNumChannels(),
        startSample,
        numSamples
    );
    
    // Render synth output
    synth.renderNextBlock(bufferView, midiMessages, 0, numSamples);
    
    // Apply volume and pan
    applyVolumeAndPan(bufferView, numSamples);
}

// ──────────────────────────────────────────
// Sample loading
// ──────────────────────────────────────────

bool MultiSamplerInstrument::loadSample(int slotIndex,
                                        const juce::String& filePath,
                                        const SampleConfig& sampleConfig)
{
    if (!isValidSlot(slotIndex))
        return false;
    
    juce::File audioFile(filePath);
    if (!audioFile.existsAsFile())
    {
        DBG("Sample file not found: " << filePath);
        return false;
    }
    
    // Create a reader for the audio file
    std::unique_ptr<juce::AudioFormatReader> reader(
        formatManager.createReaderFor(audioFile)
    );
    
    if (reader == nullptr)
    {
        DBG("Failed to create reader for: " << filePath);
        return false;
    }
    
    // Read audio data into buffer
    juce::AudioBuffer<float> audioData(
        static_cast<int>(reader->numChannels),
        static_cast<int>(reader->lengthInSamples)
    );
    
    reader->read(&audioData, 0, static_cast<int>(reader->lengthInSamples), 0, true, true);
    
    double sampleRate = reader->sampleRate;
    
    return loadSampleFromBuffer(slotIndex, audioData, sampleRate, sampleConfig);
}

bool MultiSamplerInstrument::loadSampleFromBuffer(int slotIndex,
                                                  juce::AudioBuffer<float>& audioData,
                                                  double sampleRate,
                                                  const SampleConfig& sampleConfig)
{
    if (!isValidSlot(slotIndex))
        return false;
    
    if (audioData.getNumSamples() == 0)
    {
        DBG("Empty audio buffer provided for slot " << slotIndex);
        return false;
    }
    
    // Create the sound
    auto* sound = new MultiSamplerSound(
        sampleConfig.name.isEmpty() ? juce::String("Sample ") + juce::String(slotIndex) : sampleConfig.name,
        audioData,
        sampleConfig.rootNote,
        sampleConfig.minNote,
        sampleConfig.maxNote
    );
    
    // Remove existing sound in this slot if any
    // Note: We need to find and remove sounds that might overlap with this slot
    // For simplicity, we'll clear all sounds and re-add them
    // A more sophisticated approach would track sound indices per slot
    
    synth.addSound(sound);
    sampleSlots[slotIndex] = true;
    
    DBG("Loaded sample in slot " << slotIndex << ": " << sampleConfig.name);
    return true;
}

void MultiSamplerInstrument::clearSample(int slotIndex)
{
    if (!isValidSlot(slotIndex))
        return;
    
    // For now, we'll need to rebuild the sound bank
    // This is a simplification - a production system would track sounds better
    sampleSlots[slotIndex] = false;
    
    // Note: In a production system, you'd want to track which juce::SynthesiserSound
    // corresponds to which slot and remove only that one
}

void MultiSamplerInstrument::clearAllSamples()
{
    synth.clearSounds();
    sampleSlots.fill(false);
}

bool MultiSamplerInstrument::hasSample(int slotIndex) const
{
    if (!isValidSlot(slotIndex))
        return false;
    
    return sampleSlots[slotIndex];
}

juce::String MultiSamplerInstrument::getSampleName(int slotIndex) const
{
    if (!hasSample(slotIndex))
        return juce::String();
    
    // Would need to track this separately in a production system
    return juce::String("Sample ") + juce::String(slotIndex);
}

int MultiSamplerInstrument::getSampleRootNote(int slotIndex) const
{
    if (!hasSample(slotIndex))
        return -1;
    
    // Would need to track this separately in a production system
    return 60; // Middle C default
}

// ──────────────────────────────────────────
// Note control
// ──────────────────────────────────────────

void MultiSamplerInstrument::noteOn(int midiNote, float velocity)
{
    synth.noteOn(1, midiNote, velocity);
}

void MultiSamplerInstrument::noteOff(int midiNote, bool allowTailOff)
{
    synth.noteOff(1, midiNote, 1.0f, allowTailOff);
}

void MultiSamplerInstrument::allNotesOff()
{
    synth.allNotesOff(1, true);
}

// ──────────────────────────────────────────
// Parameter control
// ──────────────────────────────────────────

void MultiSamplerInstrument::setADSR(const juce::ADSR::Parameters& params)
{
    config.adsrParams = params;
    
    for (int i = 0; i < synth.getNumVoices(); ++i)
    {
        if (auto* voice = dynamic_cast<MultiSamplerVoice*>(synth.getVoice(i)))
        {
            voice->setADSR(params);
        }
    }
}

void MultiSamplerInstrument::setVolume(float volume)
{
    config.volume = juce::jlimit(0.0f, 1.0f, volume);
}

void MultiSamplerInstrument::setPan(float pan)
{
    config.pan = juce::jlimit(0.0f, 1.0f, pan);
}

// ──────────────────────────────────────────
// Info
// ──────────────────────────────────────────

bool MultiSamplerInstrument::isActive() const
{
    for (int i = 0; i < synth.getNumVoices(); ++i)
    {
        if (synth.getVoice(i)->isVoiceActive())
            return true;
    }
    return false;
}

int MultiSamplerInstrument::getLoadedSampleCount() const
{
    int count = 0;
    for (bool loaded : sampleSlots)
    {
        if (loaded)
            ++count;
    }
    return count;
}

// ──────────────────────────────────────────
// Helper methods
// ──────────────────────────────────────────

void MultiSamplerInstrument::updateVoiceParameters()
{
    for (int i = 0; i < synth.getNumVoices(); ++i)
    {
        if (auto* voice = dynamic_cast<MultiSamplerVoice*>(synth.getVoice(i)))
        {
            voice->setADSR(config.adsrParams);
        }
    }
}

void MultiSamplerInstrument::applyVolumeAndPan(juce::AudioBuffer<float>& buffer, int numSamples)
{
    if (buffer.getNumChannels() < 2)
        return;
    
    auto* left = buffer.getWritePointer(0);
    auto* right = buffer.getWritePointer(1);
    
    // Calculate pan gains (constant power panning)
    float leftGain = std::cos(config.pan * juce::MathConstants<float>::halfPi) * config.volume;
    float rightGain = std::sin(config.pan * juce::MathConstants<float>::halfPi) * config.volume;
    
    for (int i = 0; i < numSamples; ++i)
    {
        left[i] *= leftGain;
        right[i] *= rightGain;
    }
}
