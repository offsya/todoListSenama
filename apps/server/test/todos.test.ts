import { TODO_TEXT_MAX_LENGTH, type Todo } from '@todo/shared';
import { describe, expect, it } from 'vitest';
import { TodoModel } from '../src/modules/todos/todo.model.js';
import { api, isoDate, missingId } from './helpers.js';

async function createTodo(text = 'Buy milk'): Promise<Todo> {
  const res = await api().post('/todos').send({ text }).expect(201);
  return res.body as Todo;
}

describe('POST /todos', () => {
  it('creates a todo', async () => {
    const res = await api().post('/todos').send({ text: '  Buy milk  ' }).expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      text: 'Buy milk',
      completed: false,
      createdAt: isoDate,
      updatedAt: isoDate,
    });
    await expect(TodoModel.countDocuments()).resolves.toBe(1);
  });

  it.each([
    ['empty text', { text: '' }, 'text'],
    ['whitespace-only text', { text: '   ' }, 'text'],
    ['too long text', { text: 'a'.repeat(TODO_TEXT_MAX_LENGTH + 1) }, 'text'],
    ['non-string text', { text: 42 }, 'text'],
    ['missing text', {}, 'text'],
    ['unknown fields', { text: 'Buy milk', completed: true, priority: 'high' }, ''],
  ])('rejects %s', async (_, payload, path) => {
    const res = await api().post('/todos').send(payload).expect(400);

    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ path })],
    });
    await expect(TodoModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects malformed JSON', async () => {
    const res = await api()
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
    const res = await api().post('/todos').expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects oversized payloads', async () => {
    const res = await api()
      .post('/todos')
      .send({ text: 'a'.repeat(20_000) })
      .expect(413);

    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('GET /todos', () => {
  it('returns an empty list when there are no todos', async () => {
    const res = await api().get('/todos').expect(200);

    expect(res.body).toEqual([]);
  });

  it('returns todos from the database, newest first', async () => {
    const first = await createTodo('First');
    const second = await createTodo('Second');

    const res = await api().get('/todos').expect(200);

    expect(res.body).toEqual([second, first]);
  });
});

describe('GET /todos/:id', () => {
  it('returns a single todo', async () => {
    const todo = await createTodo();

    const res = await api().get(`/todos/${todo.id}`).expect(200);

    expect(res.body).toEqual(todo);
  });

  it('responds with 404 for a missing todo', async () => {
    const res = await api().get(`/todos/${missingId}`).expect(404);

    expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'Todo not found' });
  });

  it('responds with 400 for a malformed id', async () => {
    const res = await api().get('/todos/not-an-id').expect(400);

    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ path: 'id', message: 'Invalid id' }],
    });
  });
});

describe('PUT /todos/:id', () => {
  it('updates the text', async () => {
    const todo = await createTodo('Buy milk');

    const res = await api().put(`/todos/${todo.id}`).send({ text: 'Buy oat milk' }).expect(200);

    expect(res.body).toMatchObject({ id: todo.id, text: 'Buy oat milk', completed: false });
    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(todo.updatedAt).getTime(),
    );
  });

  it('marks a todo as completed and back', async () => {
    const todo = await createTodo();

    await api()
      .put(`/todos/${todo.id}`)
      .send({ completed: true })
      .expect(200)
      .expect((res) => expect(res.body.completed).toBe(true));

    const res = await api().put(`/todos/${todo.id}`).send({ completed: false }).expect(200);

    expect(res.body).toMatchObject({ text: todo.text, completed: false });
  });

  it.each([
    ['an empty body', {}],
    ['a non-boolean status', { completed: 'yes' }],
    ['empty text', { text: ' ' }],
    ['an unknown field', { text: 'Hi', createdAt: '2000-01-01T00:00:00.000Z' }],
  ])('rejects %s', async (_, payload) => {
    const todo = await createTodo();

    const res = await api().put(`/todos/${todo.id}`).send(payload).expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    await expect(api().get(`/todos/${todo.id}`)).resolves.toMatchObject({ body: todo });
  });

  it('responds with 404 for a missing todo', async () => {
    await api().put(`/todos/${missingId}`).send({ completed: true }).expect(404);
  });
});

describe('DELETE /todos/:id', () => {
  it('deletes a todo', async () => {
    const todo = await createTodo();

    const res = await api().delete(`/todos/${todo.id}`).expect(204);

    expect(res.text).toBe('');
    await expect(TodoModel.exists({ _id: todo.id })).resolves.toBeNull();
  });

  it('responds with 404 when the todo is already gone', async () => {
    const todo = await createTodo();
    await api().delete(`/todos/${todo.id}`).expect(204);

    await api().delete(`/todos/${todo.id}`).expect(404);
  });
});
