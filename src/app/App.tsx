import React from 'react';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import SynthScreen from '../screens/SynthScreen';

export default function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SynthScreen />
    </GestureHandlerRootView>
  );
}

// const styles = StyleSheet.create({});
