#include "MultiSamplerVoice.h"
#include "MultiSamplerSound.h"

MultiSamplerVoice::MultiSamplerVoice() = default;

bool MultiSamplerVoice::canPlaySound(juce::SynthesiserSound* sound)
{
    return dynamic_cast<MultiSamplerSound*>(sound) != nullptr;
}

void MultiSamplerVoice::startNote(int midiNoteNumber,
                                   float velocity,
                                   juce::SynthesiserSound* sound,
                                   int /*currentPitchWheelPosition*/)
{
    auto* samplerSound = dynamic_cast<MultiSamplerSound*>(sound);
    if (samplerSound == nullptr)
        return;
    
    // Cache sound data for efficient rendering
    leftChannelData = samplerSound->getAudioData(0);
    rightChannelData = samplerSound->getNumChannels() > 1 ?
                       samplerSound->getAudioData(1) : nullptr;
    soundLength = samplerSound->getAudioDataLength();
    soundSampleRate = samplerSound->getSampleRate();
    soundRootNote = samplerSound->getRootNote();
    
    noteVelocity = velocity;
    sourceSamplePosition = 0.0;
    
    // Calculate pitch ratio based on MIDI note difference
    int noteDifference = midiNoteNumber - soundRootNote;
    double semitonePitchRatio = std::pow(2.0, noteDifference / 12.0);
    double pitchBendRatio = std::pow(2.0, pitchBendSemitones / 12.0);
    
    // Adjust for sample rate difference
    double sampleRateRatio = soundSampleRate / getSampleRate();
    
    pitchRatio = semitonePitchRatio * pitchBendRatio * sampleRateRatio;
    
    adsr.noteOn();
}

void MultiSamplerVoice::stopNote(float /*velocity*/, bool allowTailOff)
{
    if (allowTailOff)
    {
        adsr.noteOff();
    }
    else
    {
        clearCurrentNote();
        adsr.reset();
    }
}

void MultiSamplerVoice::renderNextBlock(juce::AudioBuffer<float>& outputBuffer,
                                         int startSample,
                                         int numSamples)
{
    if (!isVoiceActive() || leftChannelData == nullptr)
        return;
    
    // Update ADSR sample rate if needed
    if (getSampleRate() > 0.0)
        adsr.setSampleRate(getSampleRate());
    
    auto* outL = outputBuffer.getWritePointer(0, startSample);
    auto* outR = outputBuffer.getNumChannels() > 1 ?
                 outputBuffer.getWritePointer(1, startSample) : nullptr;
    
    for (int i = 0; i < numSamples; ++i)
    {
        // Get envelope value
        float env = adsr.getNextSample();
        
        // Check if note should stop
        if (!adsr.isActive())
        {
            clearCurrentNote();
            break;
        }
        
        // Get current sample position
        int pos = static_cast<int>(sourceSamplePosition);
        
        // Check if we've reached the end of the sample
        if (pos >= soundLength - 1)
        {
            clearCurrentNote();
            break;
        }
        
        // Linear interpolation for smoother playback
        float fraction = static_cast<float>(sourceSamplePosition - pos);
        float leftSample = leftChannelData[pos] * (1.0f - fraction) +
                          leftChannelData[pos + 1] * fraction;
        
        float rightSample;
        if (rightChannelData != nullptr)
        {
            rightSample = rightChannelData[pos] * (1.0f - fraction) +
                         rightChannelData[pos + 1] * fraction;
        }
        else
        {
            rightSample = leftSample;
        }
        
        // Apply velocity and envelope
        float gain = noteVelocity * env;
        outL[i] += leftSample * gain;
        if (outR != nullptr)
            outR[i] += rightSample * gain;
        
        // Advance playback position
        sourceSamplePosition += pitchRatio;
    }
}

void MultiSamplerVoice::pitchWheelMoved(int /*newPitchWheelValue*/)
{
    // Can be implemented for pitch wheel support
}

void MultiSamplerVoice::controllerMoved(int /*controllerNumber*/, int /*newControllerValue*/)
{
    // Can be implemented for CC support
}

void MultiSamplerVoice::setADSR(const juce::ADSR::Parameters& params)
{
    adsr.setParameters(params);
}

void MultiSamplerVoice::setPitchBend(float semitones)
{
    pitchBendSemitones = semitones;
}
