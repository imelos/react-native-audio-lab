#pragma once
#include "JuceHeader.h"
#include <juce_audio_basics/juce_audio_basics.h>

class BasicSynthSound : public juce::SynthesiserSound
{
public:
    bool appliesToNote (int /*midiNoteNumber*/) override { return true; }
    bool appliesToChannel (int /*midiChannel*/) override { return true; }
};
