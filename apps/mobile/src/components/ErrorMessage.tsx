import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { makeStyles, radius } from '../theme';

interface ErrorMessageProps {
  children: ReactNode;
  action?: ReactNode;
}

/** Inline error box, announced by screen readers when it appears. */
export function ErrorMessage({ children, action }: ErrorMessageProps) {
  const styles = useStyles();

  return (
    <View style={styles.box} role="alert" aria-live="polite">
      <Text style={styles.text}>{children}</Text>
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
