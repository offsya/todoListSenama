import type { ApiClient } from '@todo/shared';
import { createContext, use, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { Session, SessionState, SessionStore } from './session-store.js';

export interface TodoClient {
  api: ApiClient;
  sessionStore: SessionStore;
}

const TodoClientContext = createContext<TodoClient | null>(null);

interface TodoClientProviderProps extends TodoClient {
  children: ReactNode;
}

/** Makes the platform-specific API client and session store available to the shared hooks. */
export function TodoClientProvider({ api, sessionStore, children }: TodoClientProviderProps) {
  const client = useMemo(() => ({ api, sessionStore }), [api, sessionStore]);
  return <TodoClientContext value={client}>{children}</TodoClientContext>;
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
