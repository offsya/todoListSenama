import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { makeStyles } from '../theme';

/**
 * Unknown URLs and deep links. Without this route the production web build shows Expo Router's
 * developer screen with a sitemap.
 */
export default function NotFoundScreen() {
  const styles = useStyles();

  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={styles.container}>
        <Text style={styles.code}>404</Text>
        <Text style={styles.title} role="heading">
          Page not found
        </Text>
        {/* Signed-out users are sent on to the sign-in screen by the route guards. */}
        <Link href="/" replace style={styles.link}>
          Back to my todos
        </Link>
      </View>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    backgroundColor: colors.background,
  },
  code: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  link: {
    marginTop: 8,
    color: colors.primaryText,
    fontSize: 16,
    fontWeight: '600',
  },
}));
