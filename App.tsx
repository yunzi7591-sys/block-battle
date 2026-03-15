import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { initSounds } from './src/utils/sounds';
import { useUserStore } from './src/store/userStore';
import { TitleScreen } from './src/screens/TitleScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { GameScreen } from './src/screens/GameScreen';
import { LobbyScreen } from './src/screens/LobbyScreen';
import { PvPGameScreen } from './src/screens/PvPGameScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { Toast } from './src/components/Toast';

const Stack = createStackNavigator();

export default function App() {
  const _hasHydrated = useUserStore(state => state._hasHydrated);
  const initializeAuth = useUserStore(state => state.initializeAuth);

  useEffect(() => {
    initSounds();
  }, []);

  // Sync Auth with Hydration Safety
  useEffect(() => {
    if (_hasHydrated) {
      console.log('[App] userStore hydrated. Initializing auth...');
      initializeAuth();
    }
  }, [_hasHydrated, initializeAuth]);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <StatusBar style="light" />
        <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Title"
          screenOptions={{
            headerShown: false,
            cardStyleInterpolator: CardStyleInterpolators.forFadeFromBottomAndroid,
          }}
        >
          <Stack.Screen name="Title" component={TitleScreen} />
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Game" component={GameScreen} />
          <Stack.Screen name="Lobby" component={LobbyScreen} />
          <Stack.Screen name="PvPGame" component={PvPGameScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
        </Stack.Navigator>
      </NavigationContainer>
        <Toast />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
