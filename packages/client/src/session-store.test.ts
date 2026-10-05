import { describe, expect, it, vi } from 'vitest';
import { createSessionStore, type KeyValueStorage, type Session } from './session-store.js';

const KEY = 'todo-app.session';

const session: Session = {
  token: 'jwt-token',
  user: { id: 'u1', email: 'alice@example.com', createdAt: '2026-01-01T00:00:00.000Z' },
};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
    removeItem: vi.fn((key: string) => void data.delete(key)),
  } satisfies KeyValueStorage & { data: Map<string, string> };
}

/** Async storage whose reads resolve only when the test says so (like the mobile keychain). */
function deferredStorage(value: string | null) {
  let resolveRead: (value: string | null) => void = () => undefined;
  const read = new Promise<string | null>((resolve) => (resolveRead = resolve));
  const storage: KeyValueStorage = {
    getItem: () => read,
    setItem: () => Promise.resolve(),
    removeItem: () => Promise.resolve(),
  };
  return { storage, finishRead: () => resolveRead(value) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createSessionStore', () => {
  it('restores a persisted session', async () => {
    const store = createSessionStore(memoryStorage({ [KEY]: JSON.stringify(session) }));

    await flush();

    expect(store.getState()).toEqual({ status: 'ready', session });
    expect(store.getToken()).toBe('jwt-token');
  });

  it('stays in the loading state until async storage answers', async () => {
    const { storage, finishRead } = deferredStorage(JSON.stringify(session));
    const store = createSessionStore(storage);

    expect(store.getState()).toEqual({ status: 'loading', session: null });

    finishRead();
    await flush();
    expect(store.getState()).toEqual({ status: 'ready', session });
  });

  it.each([
    ['nothing stored', undefined],
    ['corrupted JSON', '{"token":'],
    ['an unexpected shape', JSON.stringify({ token: 42 })],
  ])('starts signed out with %s', async (_, stored) => {
    const store = createSessionStore(memoryStorage(stored ? { [KEY]: stored } : {}));

    await flush();

    expect(store.getState()).toEqual({ status: 'ready', session: null });
  });

  it('starts signed out when the storage throws', async () => {
    const store = createSessionStore({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    await flush();

    expect(store.getState()).toEqual({ status: 'ready', session: null });
  });

  it('persists changes and notifies subscribers', async () => {
    const storage = memoryStorage();
    const store = createSessionStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(session);
    await flush();
    expect(listener).toHaveBeenCalled();
    expect(storage.data.get(KEY)).toBe(JSON.stringify(session));

    store.set(null);
    await flush();
    expect(store.getState()).toEqual({ status: 'ready', session: null });
    expect(storage.data.has(KEY)).toBe(false);
  });

  it('does not let a slow initial read overwrite a newer session', async () => {
    const { storage, finishRead } = deferredStorage(null);
    const store = createSessionStore(storage);

    store.set(session);
    finishRead();
    await flush();

    expect(store.getState().session).toEqual(session);
  });

  it('reloads what was last written, even while the write is still in flight', async () => {
    const data = new Map([[KEY, JSON.stringify(session)]]);
    let finishRemove: () => void = () => undefined;
    const store = createSessionStore({
      getItem: (key) => Promise.resolve(data.get(key) ?? null),
      setItem: (key, value) => void data.set(key, value),
      // Like the keychain: the removal takes a while to land.
      removeItem: (key) =>
        new Promise<void>((resolve) => {
          finishRemove = () => {
            data.delete(key);
            resolve();
          };
        }),
    });
    await flush();

    store.set(null); // sign out
    const reloading = store.reload(); // e.g. a storage event from another tab
    await flush();
    finishRemove();
    await reloading;

    expect(store.getState()).toEqual({ status: 'ready', session: null });
  });

  it('stops notifying after unsubscribe', () => {
    const store = createSessionStore(memoryStorage());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.set(session);

    expect(listener).not.toHaveBeenCalled();
  });
});
