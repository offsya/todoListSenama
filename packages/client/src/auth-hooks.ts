import { useMutation } from '@tanstack/react-query';
import type { LoginInput, RegisterInput } from '@todo/shared';
import { useTodoClient } from './context.js';

// Screens do not navigate after signing in or out: route guards react to the session change,
// and TodoClientProvider clears the previous user's cached data.

export function useSignIn() {
  const { api, sessionStore } = useTodoClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.auth.login(input),
    onSuccess: (session) => sessionStore.set(session),
  });
}

export function useSignUp() {
  const { api, sessionStore } = useTodoClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => api.auth.register(input),
    onSuccess: (session) => sessionStore.set(session),
  });
}

export function useSignOut(): () => void {
  const { sessionStore } = useTodoClient();
  return () => sessionStore.set(null);
}
