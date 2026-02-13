#pragma once
#include "JuceHeader.h"

// ══════════════════════════════════════════════════════════════════════
// Simple Reverb Effect (lightweight, no AudioProcessor)
// ══════════════════════════════════════════════════════════════════════
class SimpleReverbProcessor
{
public:
    SimpleReverbProcessor()
    {
        reverbParams.roomSize = 0.5f;
        reverbParams.damping = 0.5f;
        reverbParams.wetLevel = 0.33f;
        reverbParams.dryLevel = 0.4f;
        reverbParams.width = 1.0f;
    }

    void prepareToPlay(double sampleRate, int samplesPerBlock)
    {
        juce::ignoreUnused(samplesPerBlock);
        reverb.setSampleRate(sampleRate);
        reverb.setParameters(reverbParams);
    }
    
    void releaseResources()
    {
        reverb.reset();
    }
    
    void processBlock(juce::AudioBuffer<float>& buffer)
    {
        if (buffer.getNumChannels() == 2)
        {
            reverb.processStereo(buffer.getWritePointer(0),
                                buffer.getWritePointer(1),
                                buffer.getNumSamples());
        }
        else if (buffer.getNumChannels() == 1)
        {
            reverb.processMono(buffer.getWritePointer(0), buffer.getNumSamples());
        }
    }

    // Parameter control
    void setRoomSize(float size)
    {
        reverbParams.roomSize = juce::jlimit(0.0f, 1.0f, size);
        reverb.setParameters(reverbParams);
    }
    
    void setDamping(float damp)
    {
        reverbParams.damping = juce::jlimit(0.0f, 1.0f, damp);
        reverb.setParameters(reverbParams);
    }
    
    void setWetLevel(float wet)
    {
        reverbParams.wetLevel = juce::jlimit(0.0f, 1.0f, wet);
        reverb.setParameters(reverbParams);
    }
    
    void setDryLevel(float dry)
    {
        reverbParams.dryLevel = juce::jlimit(0.0f, 1.0f, dry);
        reverb.setParameters(reverbParams);
    }
    
    void setWidth(float width)
    {
        reverbParams.width = juce::jlimit(0.0f, 1.0f, width);
        reverb.setParameters(reverbParams);
    }

private:
    juce::Reverb reverb;
    juce::Reverb::Parameters reverbParams;
};

// ══════════════════════════════════════════════════════════════════════
// Simple Delay Effect (lightweight, no AudioProcessor)
// ══════════════════════════════════════════════════════════════════════
class SimpleDelayProcessor
{
public:
    SimpleDelayProcessor()
        : delayTimeMs(500.0f)
        , feedback(0.4f)
        , wetLevel(0.5f)
        , sampleRate(44100.0)
        , writePosition(0)
    {
    }

    void prepareToPlay(double sampleRate, int samplesPerBlock)
    {
        juce::ignoreUnused(samplesPerBlock);
        this->sampleRate = sampleRate;
        
        // Allocate delay buffers (max 2 seconds)
        int maxDelaySamples = static_cast<int>(sampleRate * 2.0);
        delayBufferL.resize(maxDelaySamples, 0.0f);
        delayBufferR.resize(maxDelaySamples, 0.0f);
        
        writePosition = 0;
    }
    
    void releaseResources()
    {
        delayBufferL.clear();
        delayBufferR.clear();
    }
    
    void processBlock(juce::AudioBuffer<float>& buffer)
    {
        const int numChannels = buffer.getNumChannels();
        if (numChannels < 1)
            return;

        const int numSamples = buffer.getNumSamples();
        const int bufferSize = static_cast<int>(delayBufferL.size());
        
        if (bufferSize == 0)
            return;
        
        auto* leftChannel = buffer.getWritePointer(0);
        auto* rightChannel = numChannels > 1 ? buffer.getWritePointer(1) : nullptr;
        
        int delaySamples = static_cast<int>((delayTimeMs / 1000.0f) * sampleRate);
        delaySamples = juce::jlimit(1, bufferSize - 1, delaySamples);
        
        for (int i = 0; i < numSamples; ++i)
        {
            // Calculate read position
            int readPos = writePosition - delaySamples;
            if (readPos < 0)
                readPos += bufferSize;
            
            // Read delayed samples
            float delayedL = delayBufferL[readPos];
            float delayedR = rightChannel ? delayBufferR[readPos] : delayedL;
            
            // Mix dry and wet
            float outputL = leftChannel[i] * (1.0f - wetLevel) + delayedL * wetLevel;
            float outputR = rightChannel ? (rightChannel[i] * (1.0f - wetLevel) + delayedR * wetLevel) : outputL;
            
            // Write to delay buffer with feedback
            delayBufferL[writePosition] = leftChannel[i] + delayedL * feedback;
            if (rightChannel)
                delayBufferR[writePosition] = rightChannel[i] + delayedR * feedback;
            else
                delayBufferR[writePosition] = delayBufferL[writePosition];
            
            // Update output
            leftChannel[i] = outputL;
            if (rightChannel)
                rightChannel[i] = outputR;
            
            // Move write position
            writePosition = (writePosition + 1) % bufferSize;
        }
    }

    void setDelayTime(float ms)
    {
        delayTimeMs = juce::jlimit(1.0f, 2000.0f, ms);
    }
    
    void setFeedback(float fb)
    {
        feedback = juce::jlimit(0.0f, 0.95f, fb);
    }
    
    void setWetLevel(float wet)
    {
        wetLevel = juce::jlimit(0.0f, 1.0f, wet);
    }

private:
    std::vector<float> delayBufferL;
    std::vector<float> delayBufferR;
    int writePosition;
    float delayTimeMs;
    float feedback;
    float wetLevel;
    double sampleRate;
};

// ══════════════════════════════════════════════════════════════════════
// Simple Filter Effect (lightweight, no AudioProcessor)
// ══════════════════════════════════════════════════════════════════════
class SimpleFilterProcessor
{
public:
    enum class FilterType
    {
        LowPass,
        HighPass,
        BandPass
    };

    SimpleFilterProcessor()
        : cutoffFreq(1000.0f)
        , resonance(0.7f)
        , filterType(FilterType::LowPass)
        , sampleRate(44100.0)
    {
    }

    void prepareToPlay(double sampleRate, int samplesPerBlock)
    {
        juce::ignoreUnused(samplesPerBlock);
        this->sampleRate = sampleRate;
        
        juce::dsp::ProcessSpec spec;
        spec.sampleRate = sampleRate;
        spec.maximumBlockSize = static_cast<juce::uint32>(samplesPerBlock);
        spec.numChannels = 1; // Each filter processes one channel
        
        filterL.prepare(spec);
        filterR.prepare(spec);
        
        filterL.reset();
        filterR.reset();
        
        updateFilterCoefficients();
    }
    
    void releaseResources()
    {
        filterL.reset();
        filterR.reset();
    }
    
    void processBlock(juce::AudioBuffer<float>& buffer)
    {
        const int numChannels = buffer.getNumChannels();
        if (numChannels < 1)
            return;

        updateFilterCoefficients();
        
        // Use JUCE DSP AudioBlock for processing
        juce::dsp::AudioBlock<float> block(buffer);
        
        // Process left channel
        auto leftBlock = block.getSingleChannelBlock(0);
        juce::dsp::ProcessContextReplacing<float> contextL(leftBlock);
        filterL.process(contextL);
        
        // Process right channel
        if (numChannels >= 2)
        {
            auto rightBlock = block.getSingleChannelBlock(1);
            juce::dsp::ProcessContextReplacing<float> contextR(rightBlock);
            filterR.process(contextR);
        }
    }

    void setCutoffFrequency(float freq)
    {
        cutoffFreq = juce::jlimit(20.0f, 20000.0f, freq);
    }
    
    void setResonance(float res)
    {
        resonance = juce::jlimit(0.1f, 10.0f, res);
    }
    
    void setFilterType(FilterType type)
    {
        filterType = type;
    }

private:
    void updateFilterCoefficients()
    {
        auto coefficients = juce::dsp::IIR::Coefficients<float>::makeLowPass(
            sampleRate, cutoffFreq, resonance);
        
        switch (filterType)
        {
            case FilterType::LowPass:
                coefficients = juce::dsp::IIR::Coefficients<float>::makeLowPass(
                    sampleRate, cutoffFreq, resonance);
                break;
                
            case FilterType::HighPass:
                coefficients = juce::dsp::IIR::Coefficients<float>::makeHighPass(
                    sampleRate, cutoffFreq, resonance);
                break;
                
            case FilterType::BandPass:
                coefficients = juce::dsp::IIR::Coefficients<float>::makeBandPass(
                    sampleRate, cutoffFreq, resonance);
                break;
        }
        
        *filterL.state = *coefficients;
        *filterR.state = *coefficients;
    }

    juce::dsp::ProcessorDuplicator<juce::dsp::IIR::Filter<float>, juce::dsp::IIR::Coefficients<float>> filterL;
    juce::dsp::ProcessorDuplicator<juce::dsp::IIR::Filter<float>, juce::dsp::IIR::Coefficients<float>> filterR;
    float cutoffFreq;
    float resonance;
    FilterType filterType;
    double sampleRate;
};
