// AudioModule.mm
#import "AudioModule.h"
#import "AudioEngine.h"
#import "BaseOscillatorVoice.h"
#import <Foundation/Foundation.h>

@implementation AudioModule

- (instancetype)init {
    if (self = [super init]) {
        _audioEngine = new AudioEngine();
        bool success = _audioEngine->initialize();
        if (!success) {
            NSLog(@"[AudioModule] AudioEngine initialization failed");
        }
    }
    return self;
}

- (void)dealloc {
    if (_audioEngine) {
        _audioEngine->shutdown();
        delete _audioEngine;
        _audioEngine = nullptr;
    }
}

// ────────────────────────────────────────────────
// TurboModule required methods
// ────────────────────────────────────────────────

+ (NSString *)moduleName {
    return @"AudioModule";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeAudioModuleSpecJSI>(params);
}

// ────────────────────────────────────────────────
// Instrument Management
// Method names MUST match exactly what is in NativeAudioModuleSpec
// ────────────────────────────────────────────────

- (void)createInstrument:(double)channel
                    name:(NSString *)name
               polyphony:(double)polyphony
                waveform:(NSString *)waveform {
    if (!_audioEngine) return;
    
    Config config;
    config.polyphony = static_cast<int>(polyphony);
    config.name = juce::String([name UTF8String]);
    
    NSString *lowerWaveform = [waveform lowercaseString];
    if ([lowerWaveform isEqualToString:@"sine"]) {
        config.waveform = BaseOscillatorVoice::Waveform::Sine;
    } else if ([lowerWaveform isEqualToString:@"saw"]) {
        config.waveform = BaseOscillatorVoice::Waveform::Saw;
    } else if ([lowerWaveform isEqualToString:@"square"]) {
        config.waveform = BaseOscillatorVoice::Waveform::Square;
    } else if ([lowerWaveform isEqualToString:@"triangle"]) {
        config.waveform = BaseOscillatorVoice::Waveform::Triangle;
    }
    
    _audioEngine->createInstrument(static_cast<int>(channel), config);
}

- (void)removeInstrument:(double)channel {
    if (_audioEngine) {
        _audioEngine->removeInstrument(static_cast<int>(channel));
    }
}

- (void)clearAllInstruments {
    if (_audioEngine) {
        _audioEngine->clearAllInstruments();
    }
}

// ────────────────────────────────────────────────
// Note Control
// ────────────────────────────────────────────────

- (void)noteOn:(double)channel
      midiNote:(double)midiNote
      velocity:(double)velocity {
    if (_audioEngine) {
        _audioEngine->noteOn(static_cast<int>(channel),
                            static_cast<int>(midiNote),
                            static_cast<float>(velocity));
    }
}

- (void)noteOff:(double)channel
       midiNote:(double)midiNote {
    if (_audioEngine) {
        _audioEngine->noteOff(static_cast<int>(channel),
                             static_cast<int>(midiNote));
    }
}

- (void)allNotesOff:(double)channel {
    if (_audioEngine) {
        _audioEngine->allNotesOff(static_cast<int>(channel));
    }
}

- (void)allNotesOffAllChannels {
    if (_audioEngine) {
        _audioEngine->allNotesOffAllChannels();
    }
}

// ────────────────────────────────────────────────
// Instrument Parameters
// ────────────────────────────────────────────────

- (void)setWaveform:(double)channel
               type:(NSString *)type {
    if (!_audioEngine) return;
    
    NSString *lowerType = [type lowercaseString];
    
    if ([lowerType isEqualToString:@"sine"]) {
        _audioEngine->setWaveform(static_cast<int>(channel),
                                 BaseOscillatorVoice::Waveform::Sine);
    } else if ([lowerType isEqualToString:@"saw"]) {
        _audioEngine->setWaveform(static_cast<int>(channel),
                                 BaseOscillatorVoice::Waveform::Saw);
    } else if ([lowerType isEqualToString:@"square"]) {
        _audioEngine->setWaveform(static_cast<int>(channel),
                                 BaseOscillatorVoice::Waveform::Square);
    } else if ([lowerType isEqualToString:@"triangle"]) {
        _audioEngine->setWaveform(static_cast<int>(channel),
                                 BaseOscillatorVoice::Waveform::Triangle);
    } else {
        NSLog(@"[AudioModule] Unknown waveform type: %@", type);
    }
}

- (void)setADSR:(double)channel
         attack:(double)attack
          decay:(double)decay
        sustain:(double)sustain
        release:(double)release {
    if (_audioEngine) {
        _audioEngine->setADSR(static_cast<int>(channel),
                             static_cast<float>(attack),
                             static_cast<float>(decay),
                             static_cast<float>(sustain),
                             static_cast<float>(release));
    }
}

- (void)setVolume:(double)channel
           volume:(double)volume {
    if (_audioEngine) {
        _audioEngine->setVolume(static_cast<int>(channel),
                               static_cast<float>(volume));
    }
}

- (void)setPan:(double)channel
           pan:(double)pan {
    if (_audioEngine) {
        _audioEngine->setPan(static_cast<int>(channel),
                            static_cast<float>(pan));
    }
}

- (void)setDetune:(double)channel
            cents:(double)cents {
    if (_audioEngine) {
        _audioEngine->setDetune(static_cast<int>(channel),
                               static_cast<float>(cents));
    }
}

// ────────────────────────────────────────────────
// Effects Management
// ────────────────────────────────────────────────

- (void)addEffect:(double)channel
             type:(NSString *)type {
    if (!_audioEngine) return;
    
    NSString *lowerType = [type lowercaseString];
    Instrument::EffectType effectType;
    
    if ([lowerType isEqualToString:@"reverb"]) {
        effectType = Instrument::EffectType::Reverb;
    } else if ([lowerType isEqualToString:@"delay"]) {
        effectType = Instrument::EffectType::Delay;
    } else if ([lowerType isEqualToString:@"chorus"]) {
        effectType = Instrument::EffectType::Chorus;
    } else if ([lowerType isEqualToString:@"distortion"]) {
        effectType = Instrument::EffectType::Distortion;
    } else if ([lowerType isEqualToString:@"filter"]) {
        effectType = Instrument::EffectType::Filter;
    } else if ([lowerType isEqualToString:@"compressor"]) {
        effectType = Instrument::EffectType::Compressor;
    } else {
        NSLog(@"[AudioModule] Unknown effect type: %@", type);
        return;
    }
    
    int effectId = _audioEngine->addEffect(static_cast<int>(channel), effectType);
    NSLog(@"[AudioModule] Added effect '%@' to channel %d with ID %d", type, (int)channel, effectId);
}

- (void)removeEffect:(double)channel
            effectId:(double)effectId {
    if (_audioEngine) {
        _audioEngine->removeEffect(static_cast<int>(channel),
                                  static_cast<int>(effectId));
    }
}

- (void)clearEffects:(double)channel {
    if (_audioEngine) {
        _audioEngine->clearEffects(static_cast<int>(channel));
    }
}

- (void)setEffectEnabled:(double)channel
                effectId:(double)effectId
                 enabled:(BOOL)enabled {
    if (_audioEngine) {
        _audioEngine->setEffectEnabled(static_cast<int>(channel),
                                      static_cast<int>(effectId),
                                      enabled);
    }
}

- (void)setEffectParameter:(double)channel
                  effectId:(double)effectId
                 paramName:(NSString *)paramName
                     value:(double)value {
    if (_audioEngine) {
        _audioEngine->setEffectParameter(static_cast<int>(channel),
                                        static_cast<int>(effectId),
                                        juce::String([paramName UTF8String]),
                                        static_cast<float>(value));
    }
}

// ────────────────────────────────────────────────
// Global Controls
// ────────────────────────────────────────────────

- (void)setMasterVolume:(double)volume {
    if (_audioEngine) {
        _audioEngine->setMasterVolume(static_cast<float>(volume));
    }
}

@end
