import React from 'react';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Navigation from '../navigation/Navigation';

export default function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView>
      <StatusBar
        barStyle={'dark-content'}
        hidden={false}
        translucent
        backgroundColor="transparent"
      />
      <SafeAreaProvider>
        <Navigation />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// const styles = StyleSheet.create({});
