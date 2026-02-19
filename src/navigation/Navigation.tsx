import React, { JSX } from 'react';

import { RouteProp } from '@react-navigation/core';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
// import {
//   StackNavigationProp,
//   createStackNavigator,
// } from '@react-navigation/stack';

import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import SessionScreen from '../screens/SessionScreen';
import SynthScreen from '../screens/SynthScreen';

export type RootStackParamList = {
  session: undefined;
  synth: {
    channelId: number;
  };
};

const RootStack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#121212',
  },
};

export type ScreenNavigationProp<T extends keyof RootStackParamList> =
  NativeStackNavigationProp<RootStackParamList, T>;

export type ScreenRouteProp<T extends keyof RootStackParamList> = RouteProp<
  RootStackParamList,
  T
>;
export type Props<T extends keyof RootStackParamList> = {
  route: ScreenRouteProp<T>;
  navigation: ScreenNavigationProp<T>;
};

const headerWithoutTitleOptions = {
  title: '',
  headerShown: true,
  headerTintColor: '#fff',
  headerBackTitleVisible: false,
  headerTransparent: true,
  headerStyle: {backgroundColor: 'transparent'},
};

export default function Navigation(): JSX.Element {
  return (
    <NavigationContainer theme={navTheme}>
      <RootStack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        <RootStack.Group>
          <RootStack.Screen name="session" component={SessionScreen} />
          <RootStack.Screen
            name="synth"
            component={SynthScreen}
            // options={headerWithoutTitleOptions}
          />
        </RootStack.Group>
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
