// AudioModule.mm

#import "AudioModule.h"
#import "AudioEngine.h"
#import "BaseOscillatorVoice.h"

// Make sure these are included if you use NSString/NSLog etc.
#import <Foundation/Foundation.h>

@implementation AudioModule

//RCT_EXPORT_MODULE()

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
// TurboModule required method
// ────────────────────────────────────────────────
+ (NSString *)moduleName { return @"AudioModule"; }

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeAudioModuleSpecJSI>(params);
}

// ────────────────────────────────────────────────
// Methods that match the TurboModule spec
// These names MUST match exactly what is in your NativeAudioModuleSpec
// ────────────────────────────────────────────────

- (void)noteOn:(double)midiNote velocity:(double)velocity {
    if (_audioEngine) {
        _audioEngine->noteOn(static_cast<int>(midiNote),
                             static_cast<float>(velocity));
    }
}

- (void)noteOff:(double)midiNote {
    if (_audioEngine) {
        _audioEngine->noteOff(static_cast<int>(midiNote));
    }
}

- (void)setWaveform:(NSString *)type {
    if (!_audioEngine) {
        return;
    }

    NSString *lowerType = [type lowercaseString];

    if ([lowerType isEqualToString:@"sine"]) {
        _audioEngine->setWaveform(BaseOscillatorVoice::Waveform::Sine);
    } else if ([lowerType isEqualToString:@"saw"]) {
        _audioEngine->setWaveform(BaseOscillatorVoice::Waveform::Saw);
    } else if ([lowerType isEqualToString:@"square"]) {
        _audioEngine->setWaveform(BaseOscillatorVoice::Waveform::Square);
    } else if ([lowerType isEqualToString:@"triangle"]) {
        _audioEngine->setWaveform(BaseOscillatorVoice::Waveform::Triangle);
    } else {
        NSLog(@"[AudioModule] Unknown waveform type: %@", type);
    }
}

- (void)setADSR:(double)attack
                    decay:(double)decay
                  sustain:(double)sustain
                  release:(double)release {
    if (_audioEngine) {
        _audioEngine->setADSR(static_cast<float>(attack),
                              static_cast<float>(decay),
                              static_cast<float>(sustain),
                              static_cast<float>(release));
    }
}

// Optional: add more methods as needed
// - (void)setVolume:(double)volume { ... }
// - (void)setDetune:(double)cents { ... }

@end
