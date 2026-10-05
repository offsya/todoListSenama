import { createSessionStore, type KeyValueStorage } from '@todo/client';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// On devices the token goes to the iOS Keychain / Android Keystore-backed storage.
const secureStorage: KeyValueStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

// SecureStore is not available in the browser (Expo web).
const webStorage: KeyValueStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};

export const sessionStore = createSessionStore(Platform.OS === 'web' ? webStorage : secureStorage);
