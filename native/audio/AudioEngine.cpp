#include "AudioEngine.h"
#include "BaseOscillatorVoice.h"     // your voice class
#include "BasicSynthSound.h"         // your sound class

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
        // You can log error here or return it to React Native
        DBG("Audio init failed: " << error);
        return false;
    }

    // === Prepare the synthesizer ===

    synth.clearVoices();
    synth.clearSounds();

    // Add one sound type (very simple — accepts all notes & channels)
    synth.addSound(new BasicSynthSound());

    // Add multiple voices = polyphony
    const int polyphony = 16;   // change this to 8, 12, 24, 32... depending on device
    for (int i = 0; i < polyphony; ++i)
    {
        synth.addVoice(new BaseOscillatorVoice());
    }

    // Optional: set initial global parameters
    // (you will later expose setters for this)

    deviceManager.addAudioCallback(this);
    return true;
}

void AudioEngine::shutdown()
{
    deviceManager.removeAudioCallback(this);
    deviceManager.closeAudioDevice();
    synth.clearVoices();
    synth.clearSounds();
}

// ────────────────────────────────────────────────
// Main note control from React Native
// ────────────────────────────────────────────────

void AudioEngine::noteOn(int midiNote, float velocity)
{
    synth.noteOn(1, midiNote, velocity);   // channel 1
}

void AudioEngine::noteOff(int midiNote)
{
    synth.noteOff(1, midiNote, 1.0f, true);   // true = allow release tail
}

// ────────────────────────────────────────────────
// JUCE audio callbacks
// ────────────────────────────────────────────────

void AudioEngine::audioDeviceAboutToStart(juce::AudioIODevice* device)
{
    synth.setCurrentPlaybackSampleRate(device->getCurrentSampleRate());
}

void AudioEngine::audioDeviceIOCallbackWithContext(
    const float* const* /*inputChannelData*/,
    int /*numInputChannels*/,
    float* const* outputChannelData,
    int numOutputChannels,
    int numSamples,
    const juce::AudioIODeviceCallbackContext& /*context*/)
{
    juce::AudioBuffer<float> buffer(outputChannelData, numOutputChannels, numSamples);
    
    // Clear buffer first (very important!)
    buffer.clear();

    juce::MidiBuffer dummyMidi;   // we trigger notes manually, no real MIDI
    synth.renderNextBlock(buffer, dummyMidi, 0, numSamples);
}

void AudioEngine::audioDeviceStopped()
{
    // usually nothing needed here
}


void AudioEngine::setWaveform(BaseOscillatorVoice::Waveform waveform)
{
    for (int i = 0; i < synth.getNumVoices(); ++i)
    {
        if (auto* voice = synth.getVoice(i))
        {
            if (auto* oscVoice = dynamic_cast<BaseOscillatorVoice*>(voice))
            {
                oscVoice->setWaveform(waveform);
            }
        }
    }
}

void AudioEngine::setADSR(float attack, float decay, float sustain, float release)
{
    juce::ADSR::Parameters params { attack, decay, sustain, release };

    for (int i = 0; i < synth.getNumVoices(); ++i)
    {
        if (auto* voice = synth.getVoice(i))
        {
            if (auto* oscVoice = dynamic_cast<BaseOscillatorVoice*>(voice))
            {
                oscVoice->setADSR(params);
            }
        }
    }
}
