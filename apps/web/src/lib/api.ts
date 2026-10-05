import { createApiClient } from '@todo/shared';
import { sessionStore } from './session';

// VITE_API_URL may be absolute or relative to the app ("/api" by default, served by the dev
// proxy). Resolve it against the page origin: fetch outside a browser needs absolute URLs.
const baseUrl = new URL(import.meta.env.VITE_API_URL || '/api', window.location.origin).href;

export const api = createApiClient({
  baseUrl,
  getToken: sessionStore.getToken,
  // The token expired or is no longer valid: drop the session (unless the user has signed in
  // again meanwhile), and the route guard sends the user to the login page.
  onUnauthorized: sessionStore.invalidate,
});
