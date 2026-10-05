import { createSessionStore, type KeyValueStorage } from '@todo/client';

// Touch localStorage lazily: merely reading `window.localStorage` throws when storage is blocked,
// and the store handles failures of these calls.
const browserStorage: KeyValueStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};

/**
 * The access token is kept in localStorage: simple and survives reloads, at the cost of being
 * readable by injected scripts (see README for the trade-off vs. httpOnly cookies).
 */
export const sessionStore = createSessionStore(browserStorage);

// Keep tabs in sync: signing out in one tab signs out the others.
window.addEventListener('storage', () => void sessionStore.reload());
