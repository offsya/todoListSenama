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
});
