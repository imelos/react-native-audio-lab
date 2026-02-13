#include "AudioEngine.h"

AudioEngine::AudioEngine() = default;

AudioEngine::~AudioEngine()
{
    shutdown();
}

bool AudioEngine::initialize()
{
    juce::String error = deviceManager.initialise(
        0,              // inputs
        2,              // outputs (stereo)
        nullptr,        // xml config (use default)
        true            // try default device on failure
    );

    if (error.isNotEmpty())
    {
        DBG("Audio init failed: " << error);
        return false;
    }

    deviceManager.addAudioCallback(this);
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

bool AudioEngine::createInstrument(int channel, const Config& config)
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
    
    instruments[channel] = std::move(instrument);
    return true;
}

bool AudioEngine::createInstrument(int channel)
{
    return createInstrument(channel, Config());
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

Instrument* AudioEngine::getInstrument(int channel)
{
    juce::ScopedLock lock(instrumentLock);
    auto it = instruments.find(channel);
    return (it != instruments.end()) ? it->second.get() : nullptr;
}

// ──────────────────────────────────────────
// Note control
// ──────────────────────────────────────────

void AudioEngine::noteOn(int channel, int midiNote, float velocity)
{
    if (auto* instrument = getInstrument(channel))
    {
        instrument->noteOn(midiNote, velocity);
    }
}

void AudioEngine::noteOff(int channel, int midiNote)
{
    if (auto* instrument = getInstrument(channel))
    {
        instrument->noteOff(midiNote);
    }
}

void AudioEngine::allNotesOff(int channel)
{
    if (auto* instrument = getInstrument(channel))
    {
        instrument->allNotesOff();
    }
}

void AudioEngine::allNotesOffAllChannels()
{
    juce::ScopedLock lock(instrumentLock);
    for (auto& pair : instruments)
    {
        pair.second->allNotesOff();
    }
}

// ──────────────────────────────────────────
// Parameter control
// ──────────────────────────────────────────

void AudioEngine::setWaveform(int channel, BaseOscillatorVoice::Waveform waveform)
{
    if (auto* instrument = getInstrument(channel))
    {
        instrument->setWaveform(waveform);
    }
}

void AudioEngine::setADSR(int channel, float attack, float decay, float sustain, float release)
{
    if (auto* instrument = getInstrument(channel))
    {
        juce::ADSR::Parameters params { attack, decay, sustain, release };
        instrument->setADSR(params);
    }
}

void AudioEngine::setVolume(int channel, float volume)
{
    if (auto* instrument = getInstrument(channel))
    {
        instrument->setVolume(volume);
    }
}

void AudioEngine::setPan(int channel, float pan)
{
    if (auto* instrument = getInstrument(channel))
    {
        instrument->setPan(pan);
    }
}

void AudioEngine::setDetune(int channel, float cents)
{
    if (auto* instrument = getInstrument(channel))
    {
        instrument->setDetune(cents);
    }
}

// ──────────────────────────────────────────
// Effects management
// ──────────────────────────────────────────

int AudioEngine::addEffect(int channel, Instrument::EffectType type)
{
    if (auto* instrument = getInstrument(channel))
    {
        return instrument->addEffect(type);
    }
    return -1;
}

void AudioEngine::removeEffect(int channel, int effectId)
{
    if (auto* instrument = getInstrument(channel))
    {
        instrument->removeEffect(effectId);
    }
}

void AudioEngine::clearEffects(int channel)
{
    if (auto* instrument = getInstrument(channel))
    {
        instrument->clearEffects();
    }
}

void AudioEngine::setEffectEnabled(int channel, int effectId, bool enabled)
{
    if (auto* instrument = getInstrument(channel))
    {
        instrument->setEffectEnabled(effectId, enabled);
    }
}

void AudioEngine::setEffectParameter(int channel, int effectId,
                                     const juce::String& paramName, float value)
{
    if (auto* instrument = getInstrument(channel))
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
        pair.second->prepareToPlay(currentSampleRate, currentBlockSize);
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
            Instrument* instrument = pair.second.get();
            
            // Clear mix buffer
            mixBuffer.clear();
            
            // Render this instrument
            instrument->renderNextBlock(mixBuffer, midiBuffer, 0, numSamples);
            
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

void AudioEngine::prepareInstrument(Instrument* instrument)
{
    if (instrument && currentSampleRate > 0.0)
    {
        instrument->prepareToPlay(currentSampleRate, currentBlockSize);
    }
}
