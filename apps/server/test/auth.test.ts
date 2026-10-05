import { PASSWORD_MAX_LENGTH } from '@todo/shared';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { UserModel } from '../src/modules/users/user.model.js';
import { api, asUser, createUser, isoDate } from './helpers.js';

const PASSWORD = 'correct-horse-battery';

describe('POST /auth/register', () => {
  it('creates a user and returns an access token', async () => {
    const res = await api()
      .post('/auth/register')
      .send({ email: ' Alice@Example.COM ', password: PASSWORD })
      .expect(201);

    expect(res.body).toEqual({
      token: expect.any(String),
      user: { id: expect.any(String), email: 'alice@example.com', createdAt: isoDate },
    });
    await asUser(res.body).get('/todos').expect(200);
  });

  it('stores a salted scrypt hash instead of the password', async () => {
    await api().post('/auth/register').send({ email: 'alice@example.com', password: PASSWORD });

    const user = await UserModel.findOne({ email: 'alice@example.com' })
      .select('+passwordHash')
      .lean();
    expect(user?.passwordHash).toMatch(/^scrypt\$10\$8\$3\$[\w+/=]+\$[\w+/=]+$/);
    expect(user?.passwordHash).not.toContain(PASSWORD);
  });

  it('rejects an email that is already registered, regardless of case', async () => {
    await createUser({ email: 'alice@example.com' });

    const res = await api()
      .post('/auth/register')
      .send({ email: 'ALICE@example.com', password: 'another-password' })
      .expect(409);

    expect(res.body.error).toEqual({ code: 'CONFLICT', message: 'Email is already registered' });
    await expect(UserModel.countDocuments()).resolves.toBe(1);
  });

  it('lets only one of two concurrent registrations with the same email win', async () => {
    const register = () =>
      api().post('/auth/register').send({ email: 'race@example.com', password: PASSWORD });

    const responses = await Promise.all([register(), register()]);

    expect(responses.map((res) => res.status).sort()).toEqual([201, 409]);
  });

  it.each([
    [
      'an invalid email',
      { email: 'not-an-email', password: PASSWORD },
      'email',
      'Invalid email address',
    ],
    ['a missing email', { password: PASSWORD }, 'email', 'Email is required'],
    [
      'a short password',
      { email: 'a@example.com', password: 'short' },
      'password',
      'Password must be at least 8 characters',
    ],
    [
      'a too long password',
      { email: 'a@example.com', password: 'a'.repeat(PASSWORD_MAX_LENGTH + 1) },
      'password',
      `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
    ],
    ['a missing password', { email: 'a@example.com' }, 'password', 'Password is required'],
    [
      'unknown fields',
      { email: 'a@example.com', password: PASSWORD, role: 'admin' },
      '',
      'Unrecognized key: "role"',
    ],
  ])('rejects %s', async (_, payload, path, message) => {
    const res = await api().post('/auth/register').send(payload).expect(400);

    expect(res.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: [{ path, message }],
    });
    await expect(UserModel.countDocuments()).resolves.toBe(0);
  });
});

describe('POST /auth/login', () => {
  it('returns a valid access token for correct credentials', async () => {
    const user = await createUser({ email: 'alice@example.com', password: PASSWORD });

    const res = await api()
      .post('/auth/login')
      .send({ email: 'Alice@example.com', password: PASSWORD })
      .expect(200);

    expect(res.body).toEqual({
      token: expect.any(String),
      user: { id: user.id, email: 'alice@example.com', createdAt: isoDate },
    });
    const payload = jwt.verify(res.body.token, env.JWT_SECRET) as jwt.JwtPayload;
    expect(payload.sub).toBe(user.id);
    expect(payload.exp).toBeGreaterThan(Date.now() / 1000);

    // The token unlocks the todo list.
    await asUser(res.body).get('/todos').expect(200, []);
  });

  it.each([
    ['a wrong password', { email: 'alice@example.com', password: 'wrong-password' }],
    ['an unknown email', { email: 'bob@example.com', password: PASSWORD }],
  ])('rejects %s with the same generic error', async (_, credentials) => {
    await createUser({ email: 'alice@example.com', password: PASSWORD });

    const res = await api().post('/auth/login').send(credentials).expect(401);

    expect(res.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
    });
  });

  it.each([
    ['a missing password', { email: 'alice@example.com' }],
    ['an empty password', { email: 'alice@example.com', password: '' }],
    ['a non-string password', { email: 'alice@example.com', password: 12345678 }],
    ['an invalid email', { email: 'alice', password: PASSWORD }],
    ['an empty body', {}],
  ])('rejects %s with 400', async (_, payload) => {
    const res = await api().post('/auth/login').send(payload).expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('is not vulnerable to NoSQL operator injection', async () => {
    await createUser({ email: 'alice@example.com', password: PASSWORD });

    const res = await api()
      .post('/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } })
      .expect(400);

    expect(res.body).not.toHaveProperty('token');
  });
});

describe('GET /auth/me', () => {
  it('returns the current user', async () => {
    const user = await createUser({ email: 'alice@example.com' });

    const res = await asUser(user).get('/auth/me').expect(200);

    expect(res.body).toEqual({
      user: { id: user.id, email: 'alice@example.com', createdAt: isoDate },
    });
  });

  it('rejects a token of a user that no longer exists', async () => {
    const user = await createUser();
    await UserModel.deleteOne({ _id: user.id });

    const res = await asUser(user).get('/auth/me').expect(401);

    expect(res.body.error).toEqual({ code: 'UNAUTHORIZED', message: 'User no longer exists' });
  });
});

describe('rate limiting', () => {
  it('blocks an IP after too many failed login attempts', async () => {
    const limitedApp = createApp({ authRateLimit: 3 });
    await createUser({ email: 'alice@example.com', password: PASSWORD });
    const attempt = () =>
      request(limitedApp)
        .post('/auth/login')
        .send({ email: 'alice@example.com', password: 'guess' });

    for (let i = 0; i < 3; i += 1) await attempt().expect(401);
    const res = await attempt().expect(429);

    expect(res.body.error).toEqual({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many attempts. Please try again later.',
    });
    expect(res.headers).toHaveProperty('retry-after');
  });

  it('counts successful logins too: each attempt costs a password hash', async () => {
    const limitedApp = createApp({ authRateLimit: 2 });
    const user = await createUser();
    const login = () =>
      request(limitedApp).post('/auth/login').send({ email: user.email, password: user.password });

    await login().expect(200);
    await login().expect(200);
    await login().expect(429);
  });

  it('limits registrations separately from logins', async () => {
    const limitedApp = createApp({ authRateLimit: 1 });
    const register = (email: string) =>
      request(limitedApp).post('/auth/register').send({ email, password: PASSWORD });

    await register('first@example.com').expect(201);
    await register('second@example.com').expect(429);
    await request(limitedApp)
      .post('/auth/login')
      .send({ email: 'first@example.com', password: PASSWORD })
      .expect(200);
  });

  it('tells clients apart by X-Forwarded-For behind a trusted proxy', async () => {
    const proxiedApp = createApp({ authRateLimit: 1, trustProxy: 1 });
    const attemptFrom = (ip: string) =>
      request(proxiedApp)
        .post('/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: 'nobody@example.com', password: 'guess' });

    await attemptFrom('203.0.113.1').expect(401);
    await attemptFrom('203.0.113.1').expect(429);
    await attemptFrom('203.0.113.2').expect(401);
  });
});
