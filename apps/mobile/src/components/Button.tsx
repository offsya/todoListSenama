import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';
import { makeStyles, radius, useColors } from '../theme';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  loading?: boolean;
}

export function Button({ title, loading = false, disabled, style, ...props }: ButtonProps) {
  const styles = useStyles();
  const colors = useColors();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      role="button"
      aria-disabled={isDisabled}
      aria-busy={loading}
      disabled={isDisabled}
      style={(state) => [
        styles.button,
        state.pressed && styles.pressed,
        isDisabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      {loading && <ActivityIndicator size="small" color={colors.onPrimary} />}
      <Text style={styles.title}>{title}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  button: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.6,
  },
  title: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
}));
