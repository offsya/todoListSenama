import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 4000;

interface ApiUrlSources {
  /** EXPO_PUBLIC_API_URL, inlined at build time. */
  envUrl?: string;
  platform: typeof Platform.OS;
  /** `__DEV__`: the app runs from the Expo dev server. */
  isDev: boolean;
  /** Host and port of the Expo dev server as seen by the device, e.g. `192.168.1.10:8081`. */
  devServerHostUri?: string;
  /** Hostname the web build is served from. */
  webHostname?: string;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Where the app finds the API, in order of preference:
 * 1. EXPO_PUBLIC_API_URL — required for release builds, a tunnel, or a deployed API;
 * 2. on the web, the host serving the page;
 * 3. in development on a LAN, the computer running the Expo dev server: the phone or emulator
 *    already reaches it for the JS bundle, so the API on port 4000 of that machine is reachable
 *    too (unless a firewall blocks it). A tunnel host does not forward the API port;
 * 4. localhost (simulators, `adb reverse`).
 */
export function resolveApiUrl({
  envUrl,
  platform,
  isDev,
  devServerHostUri,
  webHostname,
}: ApiUrlSources): string {
  if (envUrl) return envUrl;

  if (!isDev) {
    // A release build has no dev server to guess from; quietly using localhost would make every
    // request fail on real devices.
    throw new Error(
      'EXPO_PUBLIC_API_URL is not set. It is required for builds that do not run from the Expo dev server.',
    );
  }

  if (platform === 'web' && webHostname) return `http://${webHostname}:${API_PORT}`;

  const devServerHost = devServerHostUri?.split(':')[0];
  if (devServerHost && (IPV4.test(devServerHost) || devServerHost === 'localhost')) {
    return `http://${devServerHost}:${API_PORT}`;
  }

  return `http://localhost:${API_PORT}`;
}

export const API_URL = resolveApiUrl({
  // Must be referenced literally for Expo to inline it.
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  platform: Platform.OS,
  isDev: __DEV__,
  devServerHostUri: Constants.expoConfig?.hostUri,
  webHostname: Platform.OS === 'web' ? window.location.hostname : undefined,
});
