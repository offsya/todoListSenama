import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { makeStyles, radius, useColors } from '../theme';

interface AuthScreenProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  /** The screen shows a native header, which already covers the top safe area. */
  hasHeader?: boolean;
}

/** Shared layout of the sign-in and sign-up screens. */
export function AuthScreen({ title, subtitle, children, footer, hasHeader }: AuthScreenProps) {
  const styles = useStyles();
  const colors = useColors();

  return (
    <SafeAreaView style={styles.safeArea} edges={hasHeader ? ['bottom'] : ['top', 'bottom']}>
      {/* iOS: the scroll view insets its content above the keyboard, which also accounts for a
          native header (KeyboardAvoidingView does not). Android resizes the window itself. */}
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Ionicons name="checkmark" size={18} color={colors.onPrimary} />
          </View>
          <Text style={styles.brandName}>Todo</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title} role="heading">
            {title}
          </Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <View style={styles.form}>{children}</View>
        </View>

        <View style={styles.footer}>{footer}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    gap: 24,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  logo: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  brandName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  card: {
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 15,
  },
  form: {
    marginTop: 24,
    gap: 16,
  },
  footer: {
    alignItems: 'center',
  },
}));
