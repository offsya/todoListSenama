import { createApiClient } from '@todo/shared';
import { API_URL } from './config';
import { sessionStore } from './session';

export const api = createApiClient({
  baseUrl: API_URL,
  getToken: sessionStore.getToken,
  // The token expired or is no longer valid: dropping the session (unless the user has signed
  // in again meanwhile) flips the route guards, and Expo Router shows the sign-in screen.
  onUnauthorized: sessionStore.invalidate,
});
