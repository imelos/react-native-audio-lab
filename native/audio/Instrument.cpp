#include "Instrument.h"
#include "SimpleEffects.h"

// ──────────────────────────────────────────
// Wrapper classes to adapt lightweight effects to EffectProcessor interface
// ──────────────────────────────────────────
class ReverbEffectWrapper : public Instrument::EffectProcessor
{
public:
    void prepareToPlay(double sampleRate, int samplesPerBlock) override
    {
        reverb.prepareToPlay(sampleRate, samplesPerBlock);
    }
    void releaseResources() override { reverb.releaseResources(); }
    void processBlock(juce::AudioBuffer<float>& buffer) override
    {
        reverb.processBlock(buffer);
    }
    SimpleReverbProcessor* getProcessor() { return &reverb; }
private:
    SimpleReverbProcessor reverb;
};

class DelayEffectWrapper : public Instrument::EffectProcessor
{
public:
    void prepareToPlay(double sampleRate, int samplesPerBlock) override
    {
        delay.prepareToPlay(sampleRate, samplesPerBlock);
    }
    void releaseResources() override { delay.releaseResources(); }
    void processBlock(juce::AudioBuffer<float>& buffer) override
    {
        delay.processBlock(buffer);
    }
    SimpleDelayProcessor* getProcessor() { return &delay; }
private:
    SimpleDelayProcessor delay;
};

class FilterEffectWrapper : public Instrument::EffectProcessor
{
public:
    void prepareToPlay(double sampleRate, int samplesPerBlock) override
    {
        filter.prepareToPlay(sampleRate, samplesPerBlock);
    }
    void releaseResources() override { filter.releaseResources(); }
    void processBlock(juce::AudioBuffer<float>& buffer) override
    {
        filter.processBlock(buffer);
    }
    SimpleFilterProcessor* getProcessor() { return &filter; }
private:
    SimpleFilterProcessor filter;
};

// ──────────────────────────────────────────
// Instrument Implementation
// ──────────────────────────────────────────

Instrument::Instrument(const Config& cfg)
    : config(cfg)
{
    // Initialize synthesizer
    synth.clearVoices();
    synth.clearSounds();
    
    // Add sound
    synth.addSound(new BasicSynthSound());
    
    // Sync voiceParams.waveform1 with legacy waveform field
    config.voiceParams.waveform1 = config.waveform;

    // Add voices based on polyphony
    for (int i = 0; i < config.polyphony; ++i)
    {
        auto* voice = new BaseOscillatorVoice();
        voice->setVoiceParams(config.voiceParams);
        voice->setADSR(config.adsrParams);
        synth.addVoice(voice);
    }
}

Instrument::~Instrument()
{
    synth.clearVoices();
    synth.clearSounds();
    effectsChain.clear();
}

void Instrument::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    currentSampleRate = sampleRate;
    currentBlockSize = samplesPerBlock;
    
    synth.setCurrentPlaybackSampleRate(sampleRate);
    
    // Prepare effects buffer
    effectsBuffer.setSize(2, samplesPerBlock);
    
    // Prepare all effects
    for (auto& effect : effectsChain)
    {
        if (effect->processor)
        {
            effect->processor->prepareToPlay(sampleRate, samplesPerBlock);
        }
    }
}

void Instrument::renderNextBlock(juce::AudioBuffer<float>& buffer,
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
    
    // Process effects chain
    if (!effectsChain.empty())
    {
        processEffectsChain(bufferView, numSamples);
    }
    
    // Apply volume and pan
    applyVolumeAndPan(bufferView, numSamples);
}

// ──────────────────────────────────────────
// Note control
// ──────────────────────────────────────────

void Instrument::noteOn(int midiNote, float velocity)
{
    synth.noteOn(1, midiNote, velocity);
}

void Instrument::noteOff(int midiNote, bool allowTailOff)
{
    synth.noteOff(1, midiNote, 1.0f, allowTailOff);
}

void Instrument::allNotesOff()
{
    synth.allNotesOff(1, true);
}

// ──────────────────────────────────────────
// Parameter control
// ──────────────────────────────────────────

void Instrument::setWaveform(BaseOscillatorVoice::Waveform waveform)
{
    config.waveform = waveform;
    config.voiceParams.waveform1 = waveform;

    for (int i = 0; i < synth.getNumVoices(); ++i)
    {
        if (auto* voice = dynamic_cast<BaseOscillatorVoice*>(synth.getVoice(i)))
        {
            voice->setWaveform(waveform);
        }
    }
}

void Instrument::setADSR(const juce::ADSR::Parameters& params)
{
    config.adsrParams = params;
    
    for (int i = 0; i < synth.getNumVoices(); ++i)
    {
        if (auto* voice = dynamic_cast<BaseOscillatorVoice*>(synth.getVoice(i)))
        {
            voice->setADSR(params);
        }
    }
}

void Instrument::setVolume(float volume)
{
    config.volume = juce::jlimit(0.0f, 1.0f, volume);
}

void Instrument::setPan(float pan)
{
    config.pan = juce::jlimit(0.0f, 1.0f, pan);
}

void Instrument::setDetune(float cents)
{
    for (int i = 0; i < synth.getNumVoices(); ++i)
    {
        if (auto* voice = dynamic_cast<BaseOscillatorVoice*>(synth.getVoice(i)))
        {
            voice->setDetune(cents);
        }
    }
}

void Instrument::setVoiceParams(const BaseOscillatorVoice::VoiceParams& params)
{
    config.voiceParams = params;
    config.waveform = params.waveform1;

    for (int i = 0; i < synth.getNumVoices(); ++i)
    {
        if (auto* voice = dynamic_cast<BaseOscillatorVoice*>(synth.getVoice(i)))
        {
            voice->setVoiceParams(params);
        }
    }
}

// ──────────────────────────────────────────
// Effects chain management
// ──────────────────────────────────────────

int Instrument::addEffect(EffectType type)
{
    auto processor = createEffect(type);
    if (!processor)
        return -1;
    
    int effectId = nextEffectId++;
    
    // Prepare the effect if we're already playing
    if (currentSampleRate > 0.0)
    {
        processor->prepareToPlay(currentSampleRate, currentBlockSize);
    }
    
    effectsChain.push_back(
        std::make_unique<Effect>(effectId, type, std::move(processor))
    );
    
    return effectId;
}

void Instrument::removeEffect(int effectId)
{
    effectsChain.erase(
        std::remove_if(effectsChain.begin(), effectsChain.end(),
            [effectId](const auto& effect) { return effect->id == effectId; }),
        effectsChain.end()
    );
}

void Instrument::clearEffects()
{
    effectsChain.clear();
}

void Instrument::setEffectEnabled(int effectId, bool enabled)
{
    for (auto& effect : effectsChain)
    {
        if (effect->id == effectId)
        {
            effect->enabled = enabled;
            break;
        }
    }
}

void Instrument::setEffectParameter(int effectId, const juce::String& paramName, float value)
{
    for (auto& effect : effectsChain)
    {
        if (effect->id == effectId && effect->processor)
        {
            // Cast to specific effect type and set parameters
            if (effect->type == EffectType::Reverb)
            {
                auto* wrapper = dynamic_cast<ReverbEffectWrapper*>(effect->processor.get());
                if (wrapper)
                {
                    auto* reverb = wrapper->getProcessor();
                    if (paramName.equalsIgnoreCase("roomSize"))
                        reverb->setRoomSize(value);
                    else if (paramName.equalsIgnoreCase("damping"))
                        reverb->setDamping(value);
                    else if (paramName.equalsIgnoreCase("wetLevel"))
                        reverb->setWetLevel(value);
                    else if (paramName.equalsIgnoreCase("dryLevel"))
                        reverb->setDryLevel(value);
                    else if (paramName.equalsIgnoreCase("width"))
                        reverb->setWidth(value);
                }
            }
            else if (effect->type == EffectType::Delay)
            {
                auto* wrapper = dynamic_cast<DelayEffectWrapper*>(effect->processor.get());
                if (wrapper)
                {
                    auto* delay = wrapper->getProcessor();
                    if (paramName.equalsIgnoreCase("delayTime"))
                        delay->setDelayTime(value);
                    else if (paramName.equalsIgnoreCase("feedback"))
                        delay->setFeedback(value);
                    else if (paramName.equalsIgnoreCase("wetLevel"))
                        delay->setWetLevel(value);
                }
            }
            else if (effect->type == EffectType::Filter)
            {
                auto* wrapper = dynamic_cast<FilterEffectWrapper*>(effect->processor.get());
                if (wrapper)
                {
                    auto* filter = wrapper->getProcessor();
                    if (paramName.equalsIgnoreCase("cutoff") || paramName.equalsIgnoreCase("frequency"))
                        filter->setCutoffFrequency(value);
                    else if (paramName.equalsIgnoreCase("resonance") || paramName.equalsIgnoreCase("q"))
                        filter->setResonance(value);
                    else if (paramName.equalsIgnoreCase("type"))
                    {
                        // value: 0 = LowPass, 1 = HighPass, 2 = BandPass
                        int typeInt = static_cast<int>(value);
                        if (typeInt == 0)
                            filter->setFilterType(SimpleFilterProcessor::FilterType::LowPass);
                        else if (typeInt == 1)
                            filter->setFilterType(SimpleFilterProcessor::FilterType::HighPass);
                        else if (typeInt == 2)
                            filter->setFilterType(SimpleFilterProcessor::FilterType::BandPass);
                    }
                }
            }
            break;
        }
    }
}

bool Instrument::isActive() const
{
    for (int i = 0; i < synth.getNumVoices(); ++i)
    {
        if (synth.getVoice(i)->isVoiceActive())
            return true;
    }
    return false;
}

// ──────────────────────────────────────────
// Private helper methods
// ──────────────────────────────────────────

void Instrument::updateVoiceParameters()
{
    for (int i = 0; i < synth.getNumVoices(); ++i)
    {
        if (auto* voice = dynamic_cast<BaseOscillatorVoice*>(synth.getVoice(i)))
        {
            voice->setVoiceParams(config.voiceParams);
            voice->setADSR(config.adsrParams);
        }
    }
}

std::unique_ptr<Instrument::EffectProcessor> Instrument::createEffect(EffectType type)
{
    switch (type)
    {
        case EffectType::Reverb:
            return std::make_unique<ReverbEffectWrapper>();
        
        case EffectType::Delay:
            return std::make_unique<DelayEffectWrapper>();
            
        case EffectType::Filter:
            return std::make_unique<FilterEffectWrapper>();
            
        case EffectType::Chorus:
        case EffectType::Distortion:
        case EffectType::Compressor:
            // TODO: Implement these effects
            return nullptr;
            
        default:
            return nullptr;
    }
}

void Instrument::processEffectsChain(juce::AudioBuffer<float>& buffer, int numSamples)
{
    juce::ignoreUnused(numSamples);
    
    for (auto& effect : effectsChain)
    {
        if (effect->enabled && effect->processor)
        {
            effect->processor->processBlock(buffer);
        }
    }
}

void Instrument::applyVolumeAndPan(juce::AudioBuffer<float>& buffer, int numSamples)
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
