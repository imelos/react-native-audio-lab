#pragma once

#include <juce_audio_basics/juce_audio_basics.h>

/**
    Very simple SynthesiserSound that accepts every MIDI note and every MIDI channel.
    This is usually all you need when you're building a simple subtractive synth
    with one or more oscillator voices.
*/
class BasicSynthSound : public juce::SynthesiserSound
{
public:
    BasicSynthSound() = default;

    /** Returns true for every note — this sound can be used for any MIDI note */
    bool appliesToNote(int /*midiNoteNumber*/) override
    {
        return true;
    }

    /** Returns true for every MIDI channel — no channel restriction */
    bool appliesToChannel(int /*midiChannel*/) override
    {
        return true;
    }

    // You can leave the rest of the virtual methods with their default (empty) implementation
    // unless you want to add special behavior (e.g. per-note or per-velocity logic)
};
