import { QueryClientProvider } from '@tanstack/react-query';
import { TodoClientProvider, useSessionState } from '@todo/client';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, type ReactNode } from 'react';
import { api } from '../lib/api';
import { useRefetchOnAppFocus } from '../lib/app-state';
import { queryClient } from '../lib/query-client';
import { sessionStore } from '../lib/session';
import { useColors, useIsDarkMode } from '../theme';

// Keep the splash screen up until the stored session has been read from the keychain.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useRefetchOnAppFocus();

  return (
    <QueryClientProvider client={queryClient}>
      <TodoClientProvider api={api} sessionStore={sessionStore}>
        <NavigationTheme>
          <RootNavigator />
        </NavigationTheme>
        <StatusBar style="auto" />
      </TodoClientProvider>
    </QueryClientProvider>
  );
}

/** Matches the navigator's own colors (backgrounds during transitions, headers) to the app theme. */
function NavigationTheme({ children }: { children: ReactNode }) {
  const isDark = useIsDarkMode();
  const colors = useColors();
  const theme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [isDark, colors]);

  return <ThemeProvider value={theme}>{children}</ThemeProvider>;
}

function RootNavigator() {
  const { status, session } = useSessionState();
  const isSignedIn = session !== null;

  useEffect(() => {
    if (status === 'ready') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null;

  // Protected screens are unreachable while their guard is false; when the session changes,
  // Expo Router moves the user to the first screen that is available.
  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="index" options={{ title: 'My todos' }} />
      </Stack.Protected>

      <Stack.Protected guard={!isSignedIn}>
        {/* The title is still used as the back button label on the sign-up screen. */}
        <Stack.Screen name="sign-in" options={{ title: 'Sign in', headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
      </Stack.Protected>
    </Stack>
  );
}
