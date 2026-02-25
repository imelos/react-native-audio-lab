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

class ChorusEffectWrapper : public Instrument::EffectProcessor
{
public:
    void prepareToPlay(double sampleRate, int samplesPerBlock) override
    {
        chorus.prepareToPlay(sampleRate, samplesPerBlock);
    }
    void releaseResources() override { chorus.releaseResources(); }
    void processBlock(juce::AudioBuffer<float>& buffer) override
    {
        chorus.processBlock(buffer);
    }
    SimpleChorusProcessor* getProcessor() { return &chorus; }
private:
    SimpleChorusProcessor chorus;
};

class DistortionEffectWrapper : public Instrument::EffectProcessor
{
public:
    void prepareToPlay(double sampleRate, int samplesPerBlock) override
    {
        distortion.prepareToPlay(sampleRate, samplesPerBlock);
    }
    void releaseResources() override { distortion.releaseResources(); }
    void processBlock(juce::AudioBuffer<float>& buffer) override
    {
        distortion.processBlock(buffer);
    }
    SimpleDistortionProcessor* getProcessor() { return &distortion; }
private:
    SimpleDistortionProcessor distortion;
};

class CompressorEffectWrapper : public Instrument::EffectProcessor
{
public:
    void prepareToPlay(double sampleRate, int samplesPerBlock) override
    {
        compressor.prepareToPlay(sampleRate, samplesPerBlock);
    }
    void releaseResources() override { compressor.releaseResources(); }
    void processBlock(juce::AudioBuffer<float>& buffer) override
    {
        compressor.processBlock(buffer);
    }
    SimpleCompressorProcessor* getProcessor() { return &compressor; }
private:
    SimpleCompressorProcessor compressor;
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
    {
        const juce::SpinLock::ScopedLockType lock(effectsLock);
        for (auto& effect : effectsChain)
        {
            if (effect->processor)
            {
                effect->processor->prepareToPlay(sampleRate, samplesPerBlock);
            }
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
    
    // Process effects chain (always call — avoids ARM memory ordering issue
    // where an unlocked effectsChain.empty() read returns a stale value after
    // clearEffects() + addEffect() from the JS thread)
    processEffectsChain(bufferView, numSamples);
    
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

// Macro to reduce boilerplate for per-voice forwarding
#define INSTRUMENT_FORWARD_TO_VOICES(method, ...) \
    for (int i = 0; i < synth.getNumVoices(); ++i) { \
        if (auto* voice = dynamic_cast<BaseOscillatorVoice*>(synth.getVoice(i))) \
            voice->method(__VA_ARGS__); \
    }

void Instrument::setOsc2Waveform(BaseOscillatorVoice::Waveform wf)
{
    config.voiceParams.waveform2 = wf;
    INSTRUMENT_FORWARD_TO_VOICES(setOsc2Waveform, wf)
}

void Instrument::setOsc2Level(float level)
{
    config.voiceParams.osc2Level = level;
    INSTRUMENT_FORWARD_TO_VOICES(setOsc2Level, level)
}

void Instrument::setOsc2Semi(int semi)
{
    config.voiceParams.osc2Semi = semi;
    INSTRUMENT_FORWARD_TO_VOICES(setOsc2Semi, semi)
}

void Instrument::setOsc2Detune(float cents)
{
    config.voiceParams.detuneCents2 = cents;
    INSTRUMENT_FORWARD_TO_VOICES(setOsc2Detune, cents)
}

void Instrument::setSubLevel(float level)
{
    config.voiceParams.subLevel = level;
    INSTRUMENT_FORWARD_TO_VOICES(setSubLevel, level)
}

void Instrument::setNoiseLevel(float level)
{
    config.voiceParams.noiseLevel = level;
    INSTRUMENT_FORWARD_TO_VOICES(setNoiseLevel, level)
}

void Instrument::setVoiceFilterEnabled(bool enabled)
{
    config.voiceParams.filterEnabled = enabled;
    INSTRUMENT_FORWARD_TO_VOICES(setVoiceFilterEnabled, enabled)
}

void Instrument::setVoiceFilterCutoff(float hz)
{
    config.voiceParams.filterCutoff = hz;
    INSTRUMENT_FORWARD_TO_VOICES(setVoiceFilterCutoff, hz)
}

void Instrument::setVoiceFilterResonance(float res)
{
    config.voiceParams.filterResonance = res;
    INSTRUMENT_FORWARD_TO_VOICES(setVoiceFilterResonance, res)
}

void Instrument::setVoiceFilterEnvAmount(float amt)
{
    config.voiceParams.filterEnvAmount = amt;
    INSTRUMENT_FORWARD_TO_VOICES(setVoiceFilterEnvAmount, amt)
}

void Instrument::setPulseWidth(float pw)
{
    config.voiceParams.pulseWidth = pw;
    INSTRUMENT_FORWARD_TO_VOICES(setPulseWidth, pw)
}

void Instrument::setUnisonCount(int count)
{
    config.voiceParams.unisonCount = count;
    INSTRUMENT_FORWARD_TO_VOICES(setUnisonCount, count)
}

void Instrument::setUnisonSpread(float spread)
{
    config.voiceParams.unisonSpread = spread;
    INSTRUMENT_FORWARD_TO_VOICES(setUnisonSpread, spread)
}

void Instrument::setGlideTime(float seconds)
{
    config.voiceParams.glideTime = seconds;
    INSTRUMENT_FORWARD_TO_VOICES(setGlideTime, seconds)
}

void Instrument::setLfoRate(float rate)
{
    config.voiceParams.lfoRate = rate;
    INSTRUMENT_FORWARD_TO_VOICES(setLfoRate, rate)
}

void Instrument::setLfoDepth(float depth)
{
    config.voiceParams.lfoDepth = depth;
    INSTRUMENT_FORWARD_TO_VOICES(setLfoDepth, depth)
}

void Instrument::setLfoDestination(int dest)
{
    config.voiceParams.lfoDestination = dest;
    INSTRUMENT_FORWARD_TO_VOICES(setLfoDestination, dest)
}

void Instrument::setLfoWaveform(BaseOscillatorVoice::Waveform wf)
{
    config.voiceParams.lfoWaveform = wf;
    INSTRUMENT_FORWARD_TO_VOICES(setLfoWaveform, wf)
}

#undef INSTRUMENT_FORWARD_TO_VOICES

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

    {
        const juce::SpinLock::ScopedLockType lock(effectsLock);
        effectsChain.push_back(
            std::make_unique<Effect>(effectId, type, std::move(processor))
        );
    }

    return effectId;
}

void Instrument::removeEffect(int effectId)
{
    const juce::SpinLock::ScopedLockType lock(effectsLock);
    effectsChain.erase(
        std::remove_if(effectsChain.begin(), effectsChain.end(),
            [effectId](const auto& effect) { return effect->id == effectId; }),
        effectsChain.end()
    );
}

void Instrument::clearEffects()
{
    const juce::SpinLock::ScopedLockType lock(effectsLock);
    effectsChain.clear();
}

void Instrument::setEffectEnabled(int effectId, bool enabled)
{
    const juce::SpinLock::ScopedLockType lock(effectsLock);
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
    const juce::SpinLock::ScopedLockType lock(effectsLock);
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
            else if (effect->type == EffectType::Chorus)
            {
                auto* wrapper = dynamic_cast<ChorusEffectWrapper*>(effect->processor.get());
                if (wrapper)
                {
                    auto* proc = wrapper->getProcessor();
                    if (paramName.equalsIgnoreCase("rate"))
                        proc->setRate(value);
                    else if (paramName.equalsIgnoreCase("depth"))
                        proc->setDepth(value);
                    else if (paramName.equalsIgnoreCase("mix"))
                        proc->setMix(value);
                    else if (paramName.equalsIgnoreCase("feedback"))
                        proc->setFeedback(value);
                }
            }
            else if (effect->type == EffectType::Distortion)
            {
                auto* wrapper = dynamic_cast<DistortionEffectWrapper*>(effect->processor.get());
                if (wrapper)
                {
                    auto* proc = wrapper->getProcessor();
                    if (paramName.equalsIgnoreCase("drive"))
                        proc->setDrive(value);
                    else if (paramName.equalsIgnoreCase("mix"))
                        proc->setMix(value);
                    else if (paramName.equalsIgnoreCase("tone"))
                        proc->setTone(value);
                }
            }
            else if (effect->type == EffectType::Compressor)
            {
                auto* wrapper = dynamic_cast<CompressorEffectWrapper*>(effect->processor.get());
                if (wrapper)
                {
                    auto* proc = wrapper->getProcessor();
                    if (paramName.equalsIgnoreCase("threshold"))
                        proc->setThreshold(value);
                    else if (paramName.equalsIgnoreCase("ratio"))
                        proc->setRatio(value);
                    else if (paramName.equalsIgnoreCase("attack"))
                        proc->setAttack(value);
                    else if (paramName.equalsIgnoreCase("release"))
                        proc->setRelease(value);
                    else if (paramName.equalsIgnoreCase("makeupGain"))
                        proc->setMakeupGain(value);
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
            return std::make_unique<ChorusEffectWrapper>();

        case EffectType::Distortion:
            return std::make_unique<DistortionEffectWrapper>();

        case EffectType::Compressor:
            return std::make_unique<CompressorEffectWrapper>();
            
        default:
            return nullptr;
    }
}

void Instrument::processEffectsChain(juce::AudioBuffer<float>& buffer, int numSamples)
{
    juce::ignoreUnused(numSamples);

    const juce::SpinLock::ScopedLockType lock(effectsLock);
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
