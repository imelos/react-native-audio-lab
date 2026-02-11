#import "AudioModule.h"
#import "AudioEngine.h"

@interface AudioModule()
@property (nonatomic, assign) AudioEngine* audioEngine;
@end

@implementation AudioModule

RCT_EXPORT_MODULE()

- (instancetype)init {
    if (self = [super init]) {
        _audioEngine = new AudioEngine();
        _audioEngine->initialize();
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

- (void)startNote:(double)midiNote {
    if (_audioEngine) {
        _audioEngine->startNote((int)midiNote);
    }
}

- (void)stopNote {
    if (_audioEngine) {
        _audioEngine->stopNote();
    }
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
    return std::make_shared<facebook::react::NativeAudioModuleSpecJSI>(params);
}

@end
