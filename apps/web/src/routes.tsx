import type { RouteObject } from 'react-router';
import { GuestOnly, RequireAuth } from './auth/guards';
import { AppLayout } from './components/AppLayout';
import { AuthLayout } from './components/AuthLayout';
import { TodosPage } from './features/todos/TodosPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RegisterPage } from './pages/RegisterPage';

export const routes: RouteObject[] = [
  {
    element: <GuestOnly />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [{ path: '/', element: <TodosPage /> }],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];
