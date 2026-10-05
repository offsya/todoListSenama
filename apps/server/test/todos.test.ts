import { TODO_TEXT_MAX_LENGTH } from '@todo/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { TodoModel } from '../src/modules/todos/todo.model.js';
import { MAX_TODOS_PER_USER } from '../src/modules/todos/todos.service.js';
import { asUser, createTodo, createUser, isoDate, missingId, type TestUser } from './helpers.js';

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
});

describe('POST /todos', () => {
  it('creates a todo owned by the current user', async () => {
    const res = await asUser(user).post('/todos').send({ text: '  Buy milk  ' }).expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      text: 'Buy milk',
      completed: false,
      createdAt: isoDate,
      updatedAt: isoDate,
    });
    const stored = await TodoModel.findById(res.body.id).lean();
    expect(stored?.owner.toString()).toBe(user.id);
  });

  it.each([
    ['empty text', { text: '' }, 'text'],
    ['whitespace-only text', { text: '   ' }, 'text'],
    ['too long text', { text: 'a'.repeat(TODO_TEXT_MAX_LENGTH + 1) }, 'text'],
    ['non-string text', { text: 42 }, 'text'],
    ['missing text', {}, 'text'],
    ['unknown fields', { text: 'Buy milk', priority: 'high' }, ''],
  ])('rejects %s', async (_, payload, path) => {
    const res = await asUser(user).post('/todos').send(payload).expect(400);

    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: [expect.objectContaining({ path })],
    });
    await expect(TodoModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects malformed JSON', async () => {
    const res = await asUser(user)
      .post('/todos')
      .set('Content-Type', 'application/json')
      .send('{"text": "Buy milk"')
      .expect(400);

    expect(res.body.error).toEqual({
      code: 'BAD_REQUEST',
      message: 'Request body is not valid JSON',
    });
  });

  it('rejects a request without a body', async () => {
    const res = await asUser(user).post('/todos').expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects oversized payloads', async () => {
    const res = await asUser(user)
      .post('/todos')
      .send({ text: 'a'.repeat(20_000) })
      .expect(413);

    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('GET /todos', () => {
  it('returns an empty list for a new user', async () => {
    const res = await asUser(user).get('/todos').expect(200);

    expect(res.body).toEqual([]);
  });

  it('returns todos from the database, newest first', async () => {
    const first = await createTodo(user, 'First');
    const second = await createTodo(user, 'Second');

    const res = await asUser(user).get('/todos').expect(200);

    expect(res.body).toEqual([second, first]);
  });
});

describe('GET /todos/:id', () => {
  it('returns a single todo', async () => {
    const todo = await createTodo(user);

    const res = await asUser(user).get(`/todos/${todo.id}`).expect(200);

    expect(res.body).toEqual(todo);
  });

  it('responds with 404 for a missing todo', async () => {
    const res = await asUser(user).get(`/todos/${missingId}`).expect(404);

    expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'Todo not found' });
  });
});

describe('/todos/:id with a malformed id', () => {
  // Without the id check Mongoose throws a CastError, which would surface as a 500.
  it.each([
    ['GET', () => asUser(user).get('/todos/not-an-id')],
    ['PUT', () => asUser(user).put('/todos/not-an-id').send({ completed: true })],
    ['DELETE', () => asUser(user).delete('/todos/not-an-id')],
  ])('%s responds with 400', async (_, send) => {
    const res = await send().expect(400);

    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ path: 'id', message: 'Invalid id' }],
    });
  });
});

describe('PUT /todos/:id', () => {
  it('updates the text', async () => {
    const todo = await createTodo(user, 'Buy milk');

    const res = await asUser(user)
      .put(`/todos/${todo.id}`)
      .send({ text: 'Buy oat milk' })
      .expect(200);

    expect(res.body).toMatchObject({ id: todo.id, text: 'Buy oat milk', completed: false });
    expect(Date.parse(res.body.updatedAt)).toBeGreaterThanOrEqual(Date.parse(todo.updatedAt));
  });

  it('marks a todo as completed and back', async () => {
    const todo = await createTodo(user);

    const completed = await asUser(user)
      .put(`/todos/${todo.id}`)
      .send({ completed: true })
      .expect(200);
    expect(completed.body).toMatchObject({ text: todo.text, completed: true });

    const reopened = await asUser(user)
      .put(`/todos/${todo.id}`)
      .send({ completed: false })
      .expect(200);
    expect(reopened.body).toMatchObject({ text: todo.text, completed: false });
  });

  it.each([
    ['an empty body', {}],
    ['a non-boolean status', { completed: 'yes' }],
    ['empty text', { text: ' ' }],
    ['an attempt to change the owner', { text: 'Hi', owner: missingId }],
  ])('rejects %s', async (_, payload) => {
    const todo = await createTodo(user);

    const res = await asUser(user).put(`/todos/${todo.id}`).send(payload).expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const unchanged = await asUser(user).get(`/todos/${todo.id}`).expect(200);
    expect(unchanged.body).toEqual(todo);
  });

  it('responds with 404 for a missing todo', async () => {
    await asUser(user).put(`/todos/${missingId}`).send({ completed: true }).expect(404);
  });
});

describe('DELETE /todos/:id', () => {
  it('deletes a todo', async () => {
    const todo = await createTodo(user);

    const res = await asUser(user).delete(`/todos/${todo.id}`).expect(204);

    expect(res.text).toBe('');
    await expect(TodoModel.exists({ _id: todo.id })).resolves.toBeNull();
  });

  it('responds with 404 when the todo is already gone', async () => {
    const todo = await createTodo(user);
    await asUser(user).delete(`/todos/${todo.id}`).expect(204);

    await asUser(user).delete(`/todos/${todo.id}`).expect(404);
  });
});

describe('limits', () => {
  it(`stops at ${MAX_TODOS_PER_USER} todos per user`, async () => {
    await TodoModel.insertMany(
      Array.from({ length: MAX_TODOS_PER_USER }, (_, i) => ({ text: `Todo ${i}`, owner: user.id })),
    );

    const res = await asUser(user).post('/todos').send({ text: 'One too many' }).expect(409);

    expect(res.body.error).toEqual({
      code: 'CONFLICT',
      message: `You can have at most ${MAX_TODOS_PER_USER} todos. Delete some to add new ones.`,
    });
    await expect(TodoModel.countDocuments({ owner: user.id })).resolves.toBe(MAX_TODOS_PER_USER);
    // The limit is per user.
    await createTodo(await createUser());
  });

  it('rate-limits requests per user, not per IP', async () => {
    const limitedApp = createApp({ todosRateLimit: 2 });
    const other = await createUser();
    const list = (as: TestUser) =>
      request(limitedApp).get('/todos').auth(as.token, { type: 'bearer' });

    await list(user).expect(200);
    await list(user).expect(200);
    const res = await list(user).expect(429);

    expect(res.body.error).toEqual({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Please slow down.',
    });
    expect(res.headers).toHaveProperty('retry-after');
    // Same IP, different account.
    await list(other).expect(200);
  });

  it('does not count requests without a valid token', async () => {
    const limitedApp = createApp({ todosRateLimit: 1 });

    await request(limitedApp).get('/todos').expect(401);
    await request(limitedApp).get('/todos').expect(401);
    await request(limitedApp).get('/todos').auth(user.token, { type: 'bearer' }).expect(200);
  });
});
