#import <Foundation/Foundation.h>
#import <AppSpecs/AppSpecs.h>
#import <ReactCommon/RCTTurboModule.h>
#import <AudioEngine.h>


@interface AudioModule : NSObject <NativeAudioModuleSpec>


@property (nonatomic, assign) AudioEngine* audioEngine;
@end

