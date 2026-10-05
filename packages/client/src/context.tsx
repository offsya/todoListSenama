import { useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '@todo/shared';
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { Session, SessionState, SessionStore } from './session-store.js';

export interface TodoClient {
  api: ApiClient;
  sessionStore: SessionStore;
}

const TodoClientContext = createContext<TodoClient | null>(null);

interface TodoClientProviderProps extends TodoClient {
  children: ReactNode;
}

/**
 * Makes the platform-specific API client and session store available to the shared hooks.
 * Must be rendered inside a QueryClientProvider.
 */
export function TodoClientProvider({ api, sessionStore, children }: TodoClientProviderProps) {
  const client = useMemo(() => ({ api, sessionStore }), [api, sessionStore]);
  useClearCacheOnUserChange(sessionStore);
  return <TodoClientContext value={client}>{children}</TodoClientContext>;
}

/**
 * Drops all cached server data whenever the signed-in user changes: on sign-out, when the API
 * rejects the token, or when another browser tab signs out or in as someone else.
 */
function useClearCacheOnUserChange(sessionStore: SessionStore) {
  const queryClient = useQueryClient();

  useEffect(() => {
    let userId = sessionStore.getState().session?.user.id;
    return sessionStore.subscribe(() => {
      const nextUserId = sessionStore.getState().session?.user.id;
      if (nextUserId === userId) return;
      // Clearing on sign-in too would race with the screens that start loading for the new user.
      if (userId !== undefined) queryClient.clear();
      userId = nextUserId;
    });
  }, [sessionStore, queryClient]);
}

export function useTodoClient(): TodoClient {
  const client = use(TodoClientContext);
  if (!client) throw new Error('useTodoClient must be used inside <TodoClientProvider>');
  return client;
}

export function useSessionState(): SessionState {
  const { sessionStore } = useTodoClient();
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getState);
}

export function useSession(): Session | null {
  return useSessionState().session;
}
