#pragma once
#include "JuceHeader.h"

/**
 * JuceInitializer - Ensures JUCE is properly initialized for iOS/React Native
 * Call initializeJuce() once at app startup before creating any JUCE objects
 */
class JuceInitializer
{
public:
    static void initializeJuce();
    static void shutdownJuce();
    static bool isInitialized();
    
private:
    static bool initialized;
    
    // Prevent instantiation
    JuceInitializer() = delete;
};
