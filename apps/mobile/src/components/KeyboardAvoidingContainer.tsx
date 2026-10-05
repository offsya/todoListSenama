import { HeaderHeightContext } from 'expo-router/react-navigation';
import { use, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

/**
 * Keeps the focused input above the keyboard on Android. Since SDK 57 the app draws edge to
 * edge, and Android no longer shrinks the window when the keyboard opens, so the content has
 * to make room itself. iOS needs nothing here: the scroll views inset their content
 * (`automaticallyAdjustKeyboardInsets`), which also accounts for a native header.
 */
export function KeyboardAvoidingContainer({ children }: { children: ReactNode }) {
  // The view measures its frame below the native header, while keyboard coordinates are
  // relative to the screen.
  const headerHeight = use(HeaderHeightContext) ?? 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'android' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
