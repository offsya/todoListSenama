import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { apiRequests, seedTodo, seedUser } from '../test/api-mock';
import { renderApp } from '../test/render';
import { sessionStore } from '../lib/session';

const loginHeading = () => screen.findByRole('heading', { name: 'Welcome back' });

describe('signing in', () => {
  it('sends anonymous users to the login page', async () => {
    const { router } = renderApp('/');

    expect(await loginHeading()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(apiRequests()).toEqual([]);
  });

  it("signs in and opens the user's todos", async () => {
    const session = seedUser('alice@example.com', 'password123');
    seedTodo(session, 'Buy milk');
    const { user, router } = renderApp('/');

    await user.type(await screen.findByLabelText('Email'), 'Alice@Example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Buy milk')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(sessionStore.getToken()).toBe(session.token);
    // Keyboard users land on the new todo field, not on <body>.
    expect(screen.getByLabelText('New todo')).toHaveFocus();
  });

  it('shows the API error for wrong credentials', async () => {
    seedUser('alice@example.com', 'password123');
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(sessionStore.getState().session).toBeNull();
  });

  it('validates the form before calling the API', async () => {
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Invalid email address')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(apiRequests()).toEqual([]);
  });

  it('keeps signed-in users away from the login page', async () => {
    const { router } = renderApp('/login', { session: seedUser() });

    expect(await screen.findByRole('heading', { name: 'My todos' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('registration', () => {
  it('creates an account and signs the user in', async () => {
    const { user } = renderApp('/register');

    await user.type(await screen.findByLabelText('Email'), 'bob@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('Nothing to do yet. Add your first todo above.'),
    ).toBeInTheDocument();
    expect(sessionStore.getState().session?.user.email).toBe('bob@example.com');
  });

  it('requires the passwords to match', async () => {
    const { user } = renderApp('/register');

    await user.type(await screen.findByLabelText('Email'), 'bob@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'password124');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(apiRequests()).toEqual([]);
  });

  it('shows the API error for a taken email', async () => {
    seedUser('bob@example.com');
    const { user } = renderApp('/register');

    await user.type(await screen.findByLabelText('Email'), 'bob@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email is already registered');
  });
});

describe('session', () => {
  it('signs out', async () => {
    const { user } = renderApp('/', { session: seedUser() });

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await loginHeading()).toBeInTheDocument();
    expect(sessionStore.getState().session).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('returns to the login page when the API rejects the token', async () => {
    const expired = {
      token: 'expired-token',
      user: { id: 'deadbeef', email: 'old@example.com', createdAt: new Date().toISOString() },
    };

    renderApp('/', { session: expired });

    expect(await loginHeading()).toBeInTheDocument();
    expect(sessionStore.getState().session).toBeNull();
  });

  it('signs out when another tab signs out', async () => {
    renderApp('/', { session: seedUser() });
    expect(await screen.findByRole('heading', { name: 'My todos' })).toBeInTheDocument();

    // What the browser does when another tab removes the session from localStorage.
    localStorage.removeItem('todo-app.session');
    window.dispatchEvent(new StorageEvent('storage', { key: 'todo-app.session' }));

    expect(await loginHeading()).toBeInTheDocument();
  });

  it("shows only the new user's todos after switching accounts", async () => {
    const alice = seedUser('alice@example.com', 'password123');
    seedTodo(alice, "Alice's todo");
    const bob = seedUser('bob@example.com', 'password456');
    seedTodo(bob, "Bob's todo");
    const { user } = renderApp('/', { session: alice });
    expect(await screen.findByText("Alice's todo")).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await user.type(await screen.findByLabelText('Email'), 'bob@example.com');
    await user.type(screen.getByLabelText('Password'), 'password456');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText("Bob's todo")).toBeInTheDocument();
    expect(screen.queryByText("Alice's todo")).not.toBeInTheDocument();
  });

  it('returns to the requested page after signing in', async () => {
    seedUser('alice@example.com', 'password123');
    const { user, router } = renderApp('/?from=email');

    await user.type(await screen.findByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await screen.findByRole('heading', { name: 'My todos' });
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('?from=email');
  });
});
