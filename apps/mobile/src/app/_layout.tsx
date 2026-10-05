import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient, TodoClientProvider, useSessionState } from '@todo/client';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { api } from '../lib/api';
import { useRefetchOnAppFocus } from '../lib/app-state';
import { sessionStore } from '../lib/session';
import { useColors } from '../theme';

// Keep the splash screen up until the stored session has been read from the keychain.
void SplashScreen.preventAutoHideAsync();

const queryClient = createQueryClient();

export default function RootLayout() {
  useRefetchOnAppFocus();

  return (
    <QueryClientProvider client={queryClient}>
      <TodoClientProvider api={api} sessionStore={sessionStore}>
        <RootNavigator />
        <StatusBar style="auto" />
      </TodoClientProvider>
    </QueryClientProvider>
  );
}

function RootNavigator() {
  const { status, session } = useSessionState();
  const colors = useColors();
  const isSignedIn = session !== null;

  useEffect(() => {
    if (status === 'ready') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null;

  // Protected screens are unreachable while their guard is false; when the session changes,
  // Expo Router moves the user to the first screen that is available.
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="index" options={{ title: 'My todos' }} />
      </Stack.Protected>

      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
      </Stack.Protected>
    </Stack>
  );
}
