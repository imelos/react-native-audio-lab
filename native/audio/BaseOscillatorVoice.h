#pragma once
#include "JuceHeader.h"

// Forward declaration (so we can use it in canPlaySound without including the full header)
class BasicSynthSound;

class BaseOscillatorVoice : public juce::SynthesiserVoice
{
public:
    BaseOscillatorVoice();

    // Required SynthesiserVoice overrides
    bool canPlaySound(juce::SynthesiserSound* sound) override;

    void startNote(int midiNoteNumber,
                   float velocity,
                   juce::SynthesiserSound* sound,
                   int currentPitchWheelPosition) override;

    void stopNote(float velocity, bool allowTailOff) override;

    void renderNextBlock(juce::AudioBuffer<float>& outputBuffer,
                         int startSample,
                         int numSamples) override;

    void pitchWheelMoved(int newPitchWheelValue) override;
    void controllerMoved(int controllerNumber, int newControllerValue) override;

    // Your public interface
    enum class Waveform { Sine, Saw, Square, Triangle };

    struct VoiceParams
    {
        // Oscillator 1
        Waveform waveform1 = Waveform::Sine;
        float detuneCents1 = 0.0f;

        // Oscillator 2
        Waveform waveform2 = Waveform::Sine;
        float detuneCents2 = 0.0f;
        float osc2Level = 0.0f;       // 0 = off
        int osc2Semi = 0;             // -24 to +24 semitones

        // Sub-oscillator (sine, one octave below osc1)
        float subLevel = 0.0f;        // 0 = off

        // Noise generator (white noise)
        float noiseLevel = 0.0f;      // 0 = off

        // Per-voice filter (one-pole RC lowpass)
        bool filterEnabled = false;
        float filterCutoff = 8000.0f;  // Hz
        float filterResonance = 0.0f;  // 0-1 (simple feedback amount)
        float filterEnvAmount = 0.0f;  // 0-1 (how much ADSR modulates cutoff)
    };

    void setWaveform(Waveform newType);
    void setADSR(const juce::ADSR::Parameters& params);
    void setDetune(float cents);
    void setVoiceParams(const VoiceParams& params);

    // Individual per-voice parameter setters
    void setOsc2Waveform(Waveform wf) { voiceParams.waveform2 = wf; }
    void setOsc2Level(float level) { voiceParams.osc2Level = juce::jlimit(0.0f, 1.0f, level); }
    void setOsc2Semi(int semi) { voiceParams.osc2Semi = juce::jlimit(-24, 24, semi); }
    void setOsc2Detune(float cents) { voiceParams.detuneCents2 = juce::jlimit(-100.0f, 100.0f, cents); }
    void setSubLevel(float level) { voiceParams.subLevel = juce::jlimit(0.0f, 1.0f, level); }
    void setNoiseLevel(float level) { voiceParams.noiseLevel = juce::jlimit(0.0f, 1.0f, level); }
    void setVoiceFilterEnabled(bool enabled) { voiceParams.filterEnabled = enabled; }
    void setVoiceFilterCutoff(float hz) { voiceParams.filterCutoff = juce::jlimit(20.0f, 20000.0f, hz); }
    void setVoiceFilterResonance(float res) { voiceParams.filterResonance = juce::jlimit(0.0f, 1.0f, res); }
    void setVoiceFilterEnvAmount(float amt) { voiceParams.filterEnvAmount = juce::jlimit(0.0f, 1.0f, amt); }

private:
    VoiceParams voiceParams;

    // Osc1 state
    double phase1       = 0.0;
    double phaseDelta1   = 0.0;

    // Osc2 state
    double phase2       = 0.0;
    double phaseDelta2   = 0.0;

    // Sub-oscillator state
    double phaseSub     = 0.0;
    double phaseDeltaSub = 0.0;

    double freqHz           = 440.0;
    float noteVelocity      = 1.0f;

    juce::ADSR adsr;

    // Noise RNG
    juce::Random noiseRng;

    // Per-voice filter state (SVF — state variable filter)
    float svfIc1eq = 0.0f;    // integrator 1 state
    float svfIc2eq = 0.0f;    // integrator 2 state

    static float getOscValue(Waveform wf, double phase);
    float applyFilter(float input, float envValue);
};
