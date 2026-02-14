#include "MultiSamplerSound.h"

MultiSamplerSound::MultiSamplerSound(const juce::String& name,
                                     juce::AudioBuffer<float>& audioData,
                                     int rootNote,
                                     int minNote,
                                     int maxNote)
    : name(name)
    , rootNote(juce::jlimit(0, 127, rootNote))
    , minNote(juce::jlimit(0, 127, minNote))
    , maxNote(juce::jlimit(0, 127, maxNote))
    , length(audioData.getNumSamples())
    , numChannels(audioData.getNumChannels())
    , sourceSampleRate(44100.0) // Default, can be set from loaded file
{
    // Copy audio data
    data.makeCopyOf(audioData);
}

MultiSamplerSound::~MultiSamplerSound() = default;

bool MultiSamplerSound::appliesToNote(int midiNoteNumber)
{
    return midiNoteNumber >= minNote && midiNoteNumber <= maxNote;
}

bool MultiSamplerSound::appliesToChannel(int /*midiChannel*/)
{
    return true; // Respond to all MIDI channels
}

const float* MultiSamplerSound::getAudioData(int channel) const
{
    if (channel >= 0 && channel < data.getNumChannels())
        return data.getReadPointer(channel);
    
    return nullptr;
}

void MultiSamplerSound::setNoteRange(int min, int max)
{
    minNote = juce::jlimit(0, 127, min);
    maxNote = juce::jlimit(0, 127, max);
    
    // Ensure minNote <= maxNote
    if (minNote > maxNote)
        std::swap(minNote, maxNote);
}
