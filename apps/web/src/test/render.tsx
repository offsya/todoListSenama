import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TodoClientProvider, type Session } from '@todo/client';
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

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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
