import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient, TodoClientProvider } from '@todo/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { api } from './lib/api';
import { sessionStore } from './lib/session';
import { routes } from './routes';

const router = createBrowserRouter(routes);
const queryClient = createQueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TodoClientProvider api={api} sessionStore={sessionStore}>
        <RouterProvider router={router} />
      </TodoClientProvider>
    </QueryClientProvider>
  );
}
