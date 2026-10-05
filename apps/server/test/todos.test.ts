import { TODO_TEXT_MAX_LENGTH } from '@todo/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { TodoModel } from '../src/modules/todos/todo.model.js';
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

  it('responds with 400 for a malformed id', async () => {
    const res = await asUser(user).get('/todos/not-an-id').expect(400);

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
