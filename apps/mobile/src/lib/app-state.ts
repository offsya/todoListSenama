import { focusManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * React Native has no window focus events: tell React Query when the app returns to the
 * foreground, so stale todos are refetched like `refetchOnWindowFocus` does on the web.
 */
export function useRefetchOnAppFocus() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
    });
    return () => subscription.remove();
  }, []);
}
