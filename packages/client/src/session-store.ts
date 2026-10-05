import type { AuthResponse } from '@todo/shared';

/** What the client keeps after signing in: the access token and its user. */
export type Session = AuthResponse;

export type SessionState =
  { status: 'loading'; session: null } | { status: 'ready'; session: Session | null };

/**
 * Minimal key-value storage. `localStorage` fits as is; on mobile it is a thin adapter over
 * the secure keychain. Both sync and async implementations are supported.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

// Function properties rather than methods: they are closures, safe to pass around unbound
// (e.g. `getToken: sessionStore.getToken`).
export interface SessionStore {
  getState: () => SessionState;
  getToken: () => string | undefined;
  subscribe: (listener: () => void) => () => void;
  set: (session: Session | null) => void;
  /**
   * Signs out if the session still uses this token, which the API has rejected. A late 401 for
   * an older token (the user has signed in again since, maybe in another tab) changes nothing.
   */
  invalidate: (token: string) => void;
  /** Reads the persisted session again, e.g. after another browser tab changed it. */
  reload: () => Promise<void>;
}

// Letters, digits, '.', '-' and '_' only: the mobile keychain rejects other characters.
const DEFAULT_STORAGE_KEY = 'todo-app.session';

/**
 * Holds the current session outside React, so the API client can read the token and drop it
 * on a 401 without going through components. React subscribes via `useSession`.
 */
export function createSessionStore(
  storage: KeyValueStorage,
  key = DEFAULT_STORAGE_KEY,
): SessionStore {
  let state: SessionState = { status: 'loading', session: null };
  // Bumped on every explicit change, so a slow read never overwrites a newer session.
  let version = 0;
  let pendingWrite: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();

  const setState = (next: SessionState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const reload = async () => {
    const startedAt = version;
    // Let our own pending writes land first, or we would read the value they are replacing.
    await pendingWrite;
    let raw: string | null = null;
    try {
      raw = await storage.getItem(key);
    } catch {
      // Storage unavailable (private mode, keychain error): start signed out.
    }
    if (version === startedAt) setState({ status: 'ready', session: parseSession(raw) });
  };

  const store: SessionStore = {
    getState: () => state,
    getToken: () => state.session?.token,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (session) => {
      version += 1;
      setState({ status: 'ready', session });
      // Persistence is best effort; writes are chained so they land in order.
      pendingWrite = pendingWrite
        .then(() =>
          session ? storage.setItem(key, JSON.stringify(session)) : storage.removeItem(key),
        )
        .catch(() => undefined);
    },
    invalidate: (token) => {
      if (state.session?.token === token) store.set(null);
    },
    reload,
  };

  void reload();
  return store;
}

function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isSession(value) ? value : null;
  } catch {
    return null;
  }
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const { token, user } = value as Partial<Session>;
  return (
    typeof token === 'string' &&
    typeof user === 'object' &&
    user !== null &&
    typeof user.id === 'string' &&
    typeof user.email === 'string'
  );
}
