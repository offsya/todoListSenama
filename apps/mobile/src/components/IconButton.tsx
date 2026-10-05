import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable } from 'react-native';
import { makeStyles, useColors } from '../theme';

interface IconButtonProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  /** Required: icon-only buttons need a name for screen readers. */
  label: string;
  onPress: () => void;
  color?: string;
}

export function IconButton({ icon, label, onPress, color }: IconButtonProps) {
  const styles = useStyles();
  const colors = useColors();

  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={20} color={color ?? colors.textMuted} />
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  button: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
}));
