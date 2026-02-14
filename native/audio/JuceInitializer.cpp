#include "JuceInitializer.h"

bool JuceInitializer::initialized = false;

void JuceInitializer::initializeJuce()
{
    if (initialized)
        return;
    
    // Initialize JUCE MessageManager (required for async operations)
    // This must be called on the main thread
    if (!juce::MessageManager::getInstanceWithoutCreating())
    {
        juce::MessageManager::getInstance();
    }
    
    // Set this thread as the message thread
    // This is crucial for MIDI and other async JUCE operations
    if (!juce::MessageManager::getInstance()->isThisTheMessageThread())
    {
        juce::MessageManager::getInstance()->setCurrentThreadAsMessageThread();
    }
    
    // Start the message thread dispatching
    // This ensures MIDI callbacks and other async operations work correctly
    juce::MessageManager::getInstance()->setCurrentThreadAsMessageThread();
    
    initialized = true;
    
    DBG("JUCE initialized successfully on message thread");
}

void JuceInitializer::shutdownJuce()
{
    if (!initialized)
        return;
    
    // Note: We don't delete MessageManager here as it's a singleton
    // and other parts of JUCE might still need it
    
    initialized = false;
}

bool JuceInitializer::isInitialized()
{
    return initialized;
}
