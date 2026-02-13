#include "JuceConfig.h"

#if __has_feature(objc_arc)
#error "JUCE modules must be compiled without ARC."
#endif

namespace juce
{
//    const char* const juce_compilationDate = __DATE__;
//    const char* const juce_compilationTime = __TIME__;
    const char* juce_compilationDate = __DATE__;
    const char* juce_compilationTime = __TIME__;
}

#include <juce_core/juce_core.mm>
#include <juce_events/juce_events.mm>
#include <juce_audio_basics/juce_audio_basics.mm>
#include <juce_audio_devices/juce_audio_devices.mm>

#include <juce_dsp/juce_dsp.mm>
//#include <juce_audio_utils/juce_audio_utils.mm>
//#include <juce_gui_extra/juce_gui_extra.mm>
//#include <juce_gui_basics/juce_gui_basics.mm>
//#include <juce_data_structures/juce_data_structures.mm>
