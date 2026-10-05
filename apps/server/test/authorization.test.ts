import type { Todo } from '@todo/shared';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { TodoModel } from '../src/modules/todos/todo.model.js';
import { api, asUser, createTodo, createUser, missingId, type TestUser } from './helpers.js';

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('authentication', () => {
  it.each([
    ['get', '/todos'],
    ['post', '/todos'],
    ['get', `/todos/${missingId}`],
    ['put', `/todos/${missingId}`],
    ['delete', `/todos/${missingId}`],
    ['get', '/auth/me'],
  ] as const)('%s %s requires a token', async (method, url) => {
    const res = await api()[method](url).expect(401);

    expect(res.body.error).toEqual({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  it('does not reveal todos without a token', async () => {
    const user = await createUser();
    await createTodo(user);

    const res = await api().get('/todos').expect(401);

    expect(res.body).not.toBeInstanceOf(Array);
  });

  it.each([
    ['a non-bearer scheme', 'Basic dXNlcjpwYXNz', 'Authentication required'],
    ['an empty bearer token', 'Bearer ', 'Authentication required'],
    ['a garbage token', 'Bearer not-a-jwt', 'Invalid token'],
    [
      'a token signed with another secret',
      `Bearer ${jwt.sign({}, 'some-other-secret-that-is-long-enough', { subject: missingId })}`,
      'Invalid token',
    ],
    [
      'an unsigned token (alg: none)',
      `Bearer ${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: missingId })}.`,
      'Invalid token',
    ],
    [
      'a token without a subject',
      `Bearer ${jwt.sign({}, env.JWT_SECRET, { expiresIn: '1h' })}`,
      'Invalid token',
    ],
    [
      'an expired token',
      `Bearer ${jwt.sign({}, env.JWT_SECRET, { subject: missingId, expiresIn: -10 })}`,
      'Token has expired',
    ],
  ])('rejects %s', async (_, authorization, message) => {
    const res = await api().get('/todos').set('Authorization', authorization).expect(401);

    expect(res.body.error).toEqual({ code: 'UNAUTHORIZED', message });
  });
});

describe("access to other users' todos", () => {
  let alice: TestUser;
  let bob: TestUser;
  let aliceTodo: Todo;

  beforeEach(async () => {
    alice = await createUser();
    bob = await createUser();
    aliceTodo = await createTodo(alice, "Alice's todo");
  });

  it("lists only the current user's todos", async () => {
    const bobTodo = await createTodo(bob, "Bob's todo");

    await asUser(alice).get('/todos').expect(200, [aliceTodo]);
    await asUser(bob).get('/todos').expect(200, [bobTodo]);
  });

  it("cannot read someone else's todo", async () => {
    const res = await asUser(bob).get(`/todos/${aliceTodo.id}`).expect(404);

    expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'Todo not found' });
  });

  it("cannot update someone else's todo", async () => {
    await asUser(bob)
      .put(`/todos/${aliceTodo.id}`)
      .send({ text: 'Hacked', completed: true })
      .expect(404);

    await asUser(alice).get(`/todos/${aliceTodo.id}`).expect(200, aliceTodo);
  });

  it("cannot delete someone else's todo", async () => {
    await asUser(bob).delete(`/todos/${aliceTodo.id}`).expect(404);

    await expect(TodoModel.exists({ _id: aliceTodo.id })).resolves.not.toBeNull();
  });

  it('gets the same response as for a missing todo, so ids cannot be probed', async () => {
    const foreign = await asUser(bob).get(`/todos/${aliceTodo.id}`);
    const missing = await asUser(bob).get(`/todos/${missingId}`);

    expect(foreign.status).toBe(missing.status);
    expect(foreign.body).toEqual(missing.body);
  });
});
