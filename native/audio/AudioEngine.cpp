#include "AudioEngine.h"

AudioEngine::AudioEngine() = default;

AudioEngine::~AudioEngine()
{
    shutdown();
}

bool AudioEngine::initialize()
{
    // Ensure we're on the message thread
    if (!juce::MessageManager::getInstance()->isThisTheMessageThread())
    {
        DBG("Warning: AudioEngine::initialize() called on non-message thread");
    }
    
    // Disable MIDI input devices to prevent CoreMIDI assertions
    // We control notes programmatically, don't need MIDI input
    deviceManager.setMidiInputDeviceEnabled("", false);
    
    // Initialize audio device with no MIDI inputs
    juce::String error = deviceManager.initialise(
        0,              // audio inputs
        2,              // audio outputs (stereo)
        nullptr,        // xml config (use default)
        true,           // try default device on failure
        juce::String(), // preferred default output device
        nullptr         // preferred setup options
    );

    if (error.isNotEmpty())
    {
        DBG("Audio init failed: " << error);
        return false;
    }

    deviceManager.addAudioCallback(this);
    
    DBG("AudioEngine initialized successfully");
    return true;
}

void AudioEngine::shutdown()
{
    deviceManager.removeAudioCallback(this);
    deviceManager.closeAudioDevice();
    
    juce::ScopedLock lock(instrumentLock);
    instruments.clear();
}

// ──────────────────────────────────────────
// Instrument management
// ──────────────────────────────────────────

bool AudioEngine::createOscillatorInstrument(int channel, const Config& config)
{
    if (channel < 1 || channel > 16)
        return false;
    
    juce::ScopedLock lock(instrumentLock);
    
    auto instrument = std::make_unique<Instrument>(config);
    
    // Prepare if we're already playing
    if (currentSampleRate > 0.0)
    {
        instrument->prepareToPlay(currentSampleRate, currentBlockSize);
    }
    
    instruments[channel] = std::make_unique<InstrumentWrapper>(std::move(instrument));
    return true;
}

bool AudioEngine::createOscillatorInstrument(int channel)
{
    return createOscillatorInstrument(channel, Config());
}

bool AudioEngine::createMultiSamplerInstrument(int channel, const MultiSamplerConfig::Config& config)
{
    if (channel < 1 || channel > 16)
        return false;
    
    juce::ScopedLock lock(instrumentLock);
    
    auto instrument = std::make_unique<MultiSamplerInstrument>(config);
    
    // Prepare if we're already playing
    if (currentSampleRate > 0.0)
    {
        instrument->prepareToPlay(currentSampleRate, currentBlockSize);
    }
    
    instruments[channel] = std::make_unique<InstrumentWrapper>(std::move(instrument));
    return true;
}

bool AudioEngine::createMultiSamplerInstrument(int channel)
{
    return createMultiSamplerInstrument(channel, MultiSamplerConfig::Config());
}

void AudioEngine::removeInstrument(int channel)
{
    juce::ScopedLock lock(instrumentLock);
    instruments.erase(channel);
}

void AudioEngine::clearAllInstruments()
{
    juce::ScopedLock lock(instrumentLock);
    instruments.clear();
}

bool AudioEngine::hasInstrument(int channel) const
{
    juce::ScopedLock lock(instrumentLock);
    return instruments.find(channel) != instruments.end();
}

AudioEngine::InstrumentType AudioEngine::getInstrumentType(int channel) const
{
    juce::ScopedLock lock(instrumentLock);
    auto it = instruments.find(channel);
    if (it != instruments.end())
        return it->second->type;
    return InstrumentType::Oscillator; // Default
}

AudioEngine::InstrumentWrapper* AudioEngine::getInstrumentWrapper(int channel)
{
    juce::ScopedLock lock(instrumentLock);
    auto it = instruments.find(channel);
    return (it != instruments.end()) ? it->second.get() : nullptr;
}

Instrument* AudioEngine::getOscillatorInstrument(int channel)
{
    auto* wrapper = getInstrumentWrapper(channel);
    if (wrapper && wrapper->type == InstrumentType::Oscillator)
    {
        return std::get<std::unique_ptr<Instrument>>(wrapper->instrument).get();
    }
    return nullptr;
}

MultiSamplerInstrument* AudioEngine::getMultiSamplerInstrument(int channel)
{
    auto* wrapper = getInstrumentWrapper(channel);
    if (wrapper && wrapper->type == InstrumentType::MultiSampler)
    {
        return std::get<std::unique_ptr<MultiSamplerInstrument>>(wrapper->instrument).get();
    }
    return nullptr;
}

// ──────────────────────────────────────────
// Sample loading
// ──────────────────────────────────────────

bool AudioEngine::loadSample(int channel, int slotIndex, const juce::String& filePath,
                            const MultiSamplerConfig::SampleConfig& config)
{
    auto* sampler = getMultiSamplerInstrument(channel);
    if (!sampler)
        return false;
    
    return sampler->loadSample(slotIndex, filePath, config);
}

bool AudioEngine::loadSampleFromBase64(int channel, int slotIndex, const juce::String& base64Data,
                                      double sampleRate, int numChannels,
                                      const MultiSamplerConfig::SampleConfig& config)
{
    auto* sampler = getMultiSamplerInstrument(channel);
    if (!sampler)
        return false;
    
    // Decode base64 to memory block
    juce::MemoryOutputStream outputStream;
    if (!juce::Base64::convertFromBase64(outputStream, base64Data))
    {
        DBG("Failed to decode base64 data");
        return false;
    }
    
    juce::MemoryBlock memoryBlock = outputStream.getMemoryBlock();
    
    // Try to load as an audio file format (WAV, AIFF, etc.)
    auto memoryInputStream = std::make_unique<juce::MemoryInputStream>(memoryBlock, false);
    
    juce::AudioFormatManager formatManager;
    formatManager.registerBasicFormats();
    
    std::unique_ptr<juce::AudioFormatReader> reader(
        formatManager.createReaderFor(std::move(memoryInputStream))
    );
    
    if (reader != nullptr)
    {
        // Successfully loaded as an audio file
        juce::AudioBuffer<float> audioData(
            static_cast<int>(reader->numChannels),
            static_cast<int>(reader->lengthInSamples)
        );
        
        reader->read(&audioData, 0, static_cast<int>(reader->lengthInSamples), 0, true, true);
        
        return sampler->loadSampleFromBuffer(slotIndex, audioData, reader->sampleRate, config);
    }
    else
    {
        // Assume raw float data (fallback for raw PCM)
        if (numChannels <= 0 || sampleRate <= 0.0)
        {
            DBG("Invalid sample rate or channel count for raw PCM data");
            return false;
        }
        
        const int numSamples = static_cast<int>(memoryBlock.getSize() / sizeof(float) / numChannels);
        
        if (numSamples <= 0)
        {
            DBG("Invalid sample count calculated from data size");
            return false;
        }
        
        juce::AudioBuffer<float> audioData(numChannels, numSamples);
        
        const float* sourceData = static_cast<const float*>(memoryBlock.getData());
        
        // Interleaved to planar conversion
        for (int ch = 0; ch < numChannels; ++ch)
        {
            for (int i = 0; i < numSamples; ++i)
            {
                audioData.setSample(ch, i, sourceData[i * numChannels + ch]);
            }
        }
        
        return sampler->loadSampleFromBuffer(slotIndex, audioData, sampleRate, config);
    }
}

void AudioEngine::clearSample(int channel, int slotIndex)
{
    if (auto* sampler = getMultiSamplerInstrument(channel))
    {
        sampler->clearSample(slotIndex);
    }
}

void AudioEngine::clearAllSamples(int channel)
{
    if (auto* sampler = getMultiSamplerInstrument(channel))
    {
        sampler->clearAllSamples();
    }
}

// ──────────────────────────────────────────
// Note control
// ──────────────────────────────────────────

void AudioEngine::noteOn(int channel, int midiNote, float velocity)
{
    auto* wrapper = getInstrumentWrapper(channel);
    if (!wrapper)
        return;
    
    if (wrapper->type == InstrumentType::Oscillator)
    {
        auto* osc = std::get<std::unique_ptr<Instrument>>(wrapper->instrument).get();
        osc->noteOn(midiNote, velocity);
    }
    else if (wrapper->type == InstrumentType::MultiSampler)
    {
        auto* sampler = std::get<std::unique_ptr<MultiSamplerInstrument>>(wrapper->instrument).get();
        sampler->noteOn(midiNote, velocity);
    }
}

void AudioEngine::noteOff(int channel, int midiNote)
{
    auto* wrapper = getInstrumentWrapper(channel);
    if (!wrapper)
        return;
    
    if (wrapper->type == InstrumentType::Oscillator)
    {
        auto* osc = std::get<std::unique_ptr<Instrument>>(wrapper->instrument).get();
        osc->noteOff(midiNote);
    }
    else if (wrapper->type == InstrumentType::MultiSampler)
    {
        auto* sampler = std::get<std::unique_ptr<MultiSamplerInstrument>>(wrapper->instrument).get();
        sampler->noteOff(midiNote);
    }
}

void AudioEngine::allNotesOff(int channel)
{
    auto* wrapper = getInstrumentWrapper(channel);
    if (!wrapper)
        return;
    
    if (wrapper->type == InstrumentType::Oscillator)
    {
        auto* osc = std::get<std::unique_ptr<Instrument>>(wrapper->instrument).get();
        osc->allNotesOff();
    }
    else if (wrapper->type == InstrumentType::MultiSampler)
    {
        auto* sampler = std::get<std::unique_ptr<MultiSamplerInstrument>>(wrapper->instrument).get();
        sampler->allNotesOff();
    }
}

void AudioEngine::allNotesOffAllChannels()
{
    juce::ScopedLock lock(instrumentLock);
    for (auto& pair : instruments)
    {
        auto* wrapper = pair.second.get();
        if (wrapper->type == InstrumentType::Oscillator)
        {
            auto* osc = std::get<std::unique_ptr<Instrument>>(wrapper->instrument).get();
            osc->allNotesOff();
        }
        else if (wrapper->type == InstrumentType::MultiSampler)
        {
            auto* sampler = std::get<std::unique_ptr<MultiSamplerInstrument>>(wrapper->instrument).get();
            sampler->allNotesOff();
        }
    }
}

// ──────────────────────────────────────────
// Oscillator parameter control
// ──────────────────────────────────────────

void AudioEngine::setWaveform(int channel, BaseOscillatorVoice::Waveform waveform)
{
    if (auto* instrument = getOscillatorInstrument(channel))
    {
        instrument->setWaveform(waveform);
    }
}

void AudioEngine::setDetune(int channel, float cents)
{
    if (auto* instrument = getOscillatorInstrument(channel))
    {
        instrument->setDetune(cents);
    }
}

// ──────────────────────────────────────────
// Common parameter control
// ──────────────────────────────────────────

void AudioEngine::setADSR(int channel, float attack, float decay, float sustain, float release)
{
    auto* wrapper = getInstrumentWrapper(channel);
    if (!wrapper)
        return;
    
    juce::ADSR::Parameters params { attack, decay, sustain, release };
    
    if (wrapper->type == InstrumentType::Oscillator)
    {
        auto* osc = std::get<std::unique_ptr<Instrument>>(wrapper->instrument).get();
        osc->setADSR(params);
    }
    else if (wrapper->type == InstrumentType::MultiSampler)
    {
        auto* sampler = std::get<std::unique_ptr<MultiSamplerInstrument>>(wrapper->instrument).get();
        sampler->setADSR(params);
    }
}

void AudioEngine::setVolume(int channel, float volume)
{
    auto* wrapper = getInstrumentWrapper(channel);
    if (!wrapper)
        return;
    
    if (wrapper->type == InstrumentType::Oscillator)
    {
        auto* osc = std::get<std::unique_ptr<Instrument>>(wrapper->instrument).get();
        osc->setVolume(volume);
    }
    else if (wrapper->type == InstrumentType::MultiSampler)
    {
        auto* sampler = std::get<std::unique_ptr<MultiSamplerInstrument>>(wrapper->instrument).get();
        sampler->setVolume(volume);
    }
}

void AudioEngine::setPan(int channel, float pan)
{
    auto* wrapper = getInstrumentWrapper(channel);
    if (!wrapper)
        return;
    
    if (wrapper->type == InstrumentType::Oscillator)
    {
        auto* osc = std::get<std::unique_ptr<Instrument>>(wrapper->instrument).get();
        osc->setPan(pan);
    }
    else if (wrapper->type == InstrumentType::MultiSampler)
    {
        auto* sampler = std::get<std::unique_ptr<MultiSamplerInstrument>>(wrapper->instrument).get();
        sampler->setPan(pan);
    }
}

// ──────────────────────────────────────────
// Effects management (oscillator only)
// ──────────────────────────────────────────

int AudioEngine::addEffect(int channel, Instrument::EffectType type)
{
    if (auto* instrument = getOscillatorInstrument(channel))
    {
        return instrument->addEffect(type);
    }
    return -1;
}

void AudioEngine::removeEffect(int channel, int effectId)
{
    if (auto* instrument = getOscillatorInstrument(channel))
    {
        instrument->removeEffect(effectId);
    }
}

void AudioEngine::clearEffects(int channel)
{
    if (auto* instrument = getOscillatorInstrument(channel))
    {
        instrument->clearEffects();
    }
}

void AudioEngine::setEffectEnabled(int channel, int effectId, bool enabled)
{
    if (auto* instrument = getOscillatorInstrument(channel))
    {
        instrument->setEffectEnabled(effectId, enabled);
    }
}

void AudioEngine::setEffectParameter(int channel, int effectId,
                                     const juce::String& paramName, float value)
{
    if (auto* instrument = getOscillatorInstrument(channel))
    {
        instrument->setEffectParameter(effectId, paramName, value);
    }
}

// ──────────────────────────────────────────
// Global controls
// ──────────────────────────────────────────

void AudioEngine::setMasterVolume(float volume)
{
    masterVolume = juce::jlimit(0.0f, 2.0f, volume);
}

// ──────────────────────────────────────────
// Info
// ──────────────────────────────────────────

int AudioEngine::getActiveChannelCount() const
{
    juce::ScopedLock lock(instrumentLock);
    return static_cast<int>(instruments.size());
}

std::vector<int> AudioEngine::getActiveChannels() const
{
    juce::ScopedLock lock(instrumentLock);
    std::vector<int> channels;
    for (const auto& pair : instruments)
    {
        channels.push_back(pair.first);
    }
    return channels;
}

// ──────────────────────────────────────────
// JUCE callbacks
// ──────────────────────────────────────────

void AudioEngine::audioDeviceAboutToStart(juce::AudioIODevice* device)
{
    currentSampleRate = device->getCurrentSampleRate();
    currentBlockSize = device->getCurrentBufferSizeSamples();
    
    // Prepare mix buffer
    mixBuffer.setSize(2, currentBlockSize);
    
    // Prepare all instruments
    juce::ScopedLock lock(instrumentLock);
    for (auto& pair : instruments)
    {
        prepareInstrumentWrapper(pair.second.get());
    }
}

void AudioEngine::audioDeviceIOCallbackWithContext(
    const float* const* /*inputChannelData*/,
    int /*numInputChannels*/,
    float* const* outputChannelData,
    int numOutputChannels,
    int numSamples,
    const juce::AudioIODeviceCallbackContext& /*context*/)
{
    juce::AudioBuffer<float> outputBuffer(outputChannelData, numOutputChannels, numSamples);
    
    // Clear output buffer
    outputBuffer.clear();
    
    // Clear MIDI buffer (we control notes programmatically)
    midiBuffer.clear();
    
    // Render and mix all instruments
    {
        juce::ScopedLock lock(instrumentLock);
        
        for (auto& pair : instruments)
        {
            auto* wrapper = pair.second.get();
            
            // Clear mix buffer
            mixBuffer.clear();
            
            // Render based on instrument type
            if (wrapper->type == InstrumentType::Oscillator)
            {
                auto* osc = std::get<std::unique_ptr<Instrument>>(wrapper->instrument).get();
                osc->renderNextBlock(mixBuffer, midiBuffer, 0, numSamples);
            }
            else if (wrapper->type == InstrumentType::MultiSampler)
            {
                auto* sampler = std::get<std::unique_ptr<MultiSamplerInstrument>>(wrapper->instrument).get();
                sampler->renderNextBlock(mixBuffer, midiBuffer, 0, numSamples);
            }
            
            // Add to output (mix)
            for (int ch = 0; ch < juce::jmin(numOutputChannels, mixBuffer.getNumChannels()); ++ch)
            {
                outputBuffer.addFrom(ch, 0, mixBuffer, ch, 0, numSamples);
            }
        }
    }
    
    // Apply master volume
    if (masterVolume != 1.0f)
    {
        outputBuffer.applyGain(masterVolume);
    }
}

void AudioEngine::audioDeviceStopped()
{
    // Clean up if needed
}

void AudioEngine::prepareInstrumentWrapper(InstrumentWrapper* wrapper)
{
    if (!wrapper || currentSampleRate <= 0.0)
        return;
    
    if (wrapper->type == InstrumentType::Oscillator)
    {
        auto* osc = std::get<std::unique_ptr<Instrument>>(wrapper->instrument).get();
        osc->prepareToPlay(currentSampleRate, currentBlockSize);
    }
    else if (wrapper->type == InstrumentType::MultiSampler)
    {
        auto* sampler = std::get<std::unique_ptr<MultiSamplerInstrument>>(wrapper->instrument).get();
        sampler->prepareToPlay(currentSampleRate, currentBlockSize);
    }
}
