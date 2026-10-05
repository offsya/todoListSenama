import type { AuthResponse, Todo } from '@todo/shared';
import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../src/app.js';

export const app = createApp();

export const api = () => request(app);

export interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
}

let userSequence = 0;

/** Registers a user through the API and returns their credentials and access token. */
export async function createUser(
  overrides: Partial<Pick<TestUser, 'email' | 'password'>> = {},
): Promise<TestUser> {
  userSequence += 1;
  const credentials = {
    email: `user${userSequence}@example.com`,
    password: 'correct-horse-battery',
    ...overrides,
  };
  const res = await api().post('/auth/register').send(credentials).expect(201);
  const { token, user } = res.body as AuthResponse;
  return { ...credentials, id: user.id, token };
}

/** Requests authenticated as the given user. */
export function asUser(user: Pick<TestUser, 'token'>) {
  const auth = { type: 'bearer' } as const;
  return {
    get: (url: string) => api().get(url).auth(user.token, auth),
    post: (url: string) => api().post(url).auth(user.token, auth),
    put: (url: string) => api().put(url).auth(user.token, auth),
    delete: (url: string) => api().delete(url).auth(user.token, auth),
  };
}

export async function createTodo(user: TestUser, text = 'Buy milk'): Promise<Todo> {
  const res = await asUser(user).post('/todos').send({ text }).expect(201);
  return res.body as Todo;
}

/** Matches an ISO-8601 timestamp produced by `Date#toISOString`. */
export const isoDate = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

/** A syntactically valid id that does not belong to any document. */
export const missingId = '64b7f0c2a1b2c3d4e5f60718';
