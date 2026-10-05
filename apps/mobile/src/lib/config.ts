import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 4000;

interface ApiUrlSources {
  /** EXPO_PUBLIC_API_URL, inlined at build time. */
  envUrl?: string;
  platform: typeof Platform.OS;
  /** Host and port of the Expo dev server as seen by the device, e.g. `192.168.1.10:8081`. */
  devServerHostUri?: string;
  /** Hostname the web build is served from. */
  webHostname?: string;
}

/**
 * Where the app finds the API, in order of preference:
 * 1. EXPO_PUBLIC_API_URL, for a deployed API or a custom setup;
 * 2. on the web, the host serving the page;
 * 3. in development, the computer running the Expo dev server — the phone or emulator already
 *    reaches it to download the JS bundle, so the API on the same machine is reachable too;
 * 4. localhost as the last resort.
 */
export function resolveApiUrl({
  envUrl,
  platform,
  devServerHostUri,
  webHostname,
}: ApiUrlSources): string {
  if (envUrl) return envUrl;
  if (platform === 'web' && webHostname) return `http://${webHostname}:${API_PORT}`;

  const devServerHost = devServerHostUri?.split(':')[0];
  if (devServerHost) return `http://${devServerHost}:${API_PORT}`;

  return `http://localhost:${API_PORT}`;
}

export const API_URL = resolveApiUrl({
  // Must be referenced literally for Expo to inline it.
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  platform: Platform.OS,
  devServerHostUri: Constants.expoConfig?.hostUri,
  webHostname: Platform.OS === 'web' ? window.location.hostname : undefined,
});
