import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient, TodoClientProvider, type Session } from '@todo/client';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { api } from '../lib/api';
import { sessionStore } from '../lib/session';
import { routes } from '../routes';

interface RenderAppOptions {
  /** Start signed in as this user. */
  session?: Session;
}

/** Renders the whole app (real routes, guards, API client and session store) at the given path. */
export function renderApp(path = '/', { session }: RenderAppOptions = {}) {
  if (session) sessionStore.set(session);

  // The production defaults (e.g. staleTime), minus retries that would slow down error tests.
  const queryClient = createQueryClient({ queries: { retry: false } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();

  const view = render(
    <QueryClientProvider client={queryClient}>
      <TodoClientProvider api={api} sessionStore={sessionStore}>
        <RouterProvider router={router} />
      </TodoClientProvider>
    </QueryClientProvider>,
  );

  return { ...view, user, router };
}
