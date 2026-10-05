import { useSessionState } from '@todo/client';
import { Navigate, Outlet, useLocation } from 'react-router';

interface RedirectState {
  /** Where the user was going before being sent to the login page. */
  from?: string;
}

/** Renders the nested routes for signed-in users and sends everyone else to the login page. */
export function RequireAuth() {
  const { status, session } = useSessionState();
  const location = useLocation();

  // Do not redirect before the stored session is restored, or a page reload would end on /login.
  if (status === 'loading') return null;

  if (!session) {
    const state: RedirectState = { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }
  return <Outlet />;
}

/** Wraps the login and registration pages: once signed in, go back to the original page. */
export function GuestOnly() {
  const { status, session } = useSessionState();
  const location = useLocation();

  if (status === 'loading') return null;

  if (session) {
    const { from } = (location.state ?? {}) as RedirectState;
    return <Navigate to={from?.startsWith('/') ? from : '/'} replace />;
  }
  return <Outlet />;
}
