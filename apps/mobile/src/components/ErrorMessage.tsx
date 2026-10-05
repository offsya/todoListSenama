import { useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, Text, View } from 'react-native';
import { makeStyles, radius } from '../theme';

interface ErrorMessageProps {
  message: string;
  action?: ReactNode;
}

/** Inline error box, announced by screen readers when it appears or changes. */
export function ErrorMessage({ message, action }: ErrorMessageProps) {
  const styles = useStyles();

  // Live regions work on Android and the web; VoiceOver needs an explicit announcement.
  useEffect(() => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    <View style={styles.box} role="alert" aria-live="polite">
      <Text style={styles.text}>{message}</Text>
      {action}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },
  text: {
    flexShrink: 1,
    color: colors.danger,
    fontSize: 14,
    fontWeight: '500',
  },
}));
