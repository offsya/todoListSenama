import { TODO_TEXT_MAX_LENGTH, type Todo, type TodoPage } from '@todo/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { TodoModel } from '../src/modules/todos/todo.model.js';
import { MAX_TODOS_PER_USER } from '../src/modules/todos/todos.service.js';
import {
  asUser,
  createTodo,
  createUser,
  insertTodos,
  isoDate,
  missingId,
  type TestUser,
} from './helpers.js';

let user: TestUser;

const texts = (items: Todo[]) => items.map((todo) => todo.text);
/** `Todo <from>` … `Todo <to>`, counting down. */
const range = (from: number, to: number) =>
  Array.from({ length: from - to + 1 }, (_, i) => `Todo ${from - i}`);

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
      dueDate: null,
      createdAt: isoDate,
      updatedAt: isoDate,
    });
    const stored = await TodoModel.findById(res.body.id).lean();
    expect(stored?.owner.toString()).toBe(user.id);
  });

  it('stores a due date', async () => {
    const dueDate = '2030-05-01T20:59:59.999Z';

    const res = await asUser(user).post('/todos').send({ text: 'Pay rent', dueDate }).expect(201);

    expect(res.body).toMatchObject({ text: 'Pay rent', dueDate });
    const stored = await TodoModel.findById(res.body.id).lean();
    expect(stored?.dueDate?.toISOString()).toBe(dueDate);
  });

  it('accepts a due date with a time zone offset and returns it in UTC', async () => {
    const res = await asUser(user)
      .post('/todos')
      .send({ text: 'Call mom', dueDate: '2030-05-01T23:59:59+03:00' })
      .expect(201);

    expect(res.body.dueDate).toBe('2030-05-01T20:59:59.000Z');
  });

  it.each([
    ['empty text', { text: '' }, 'text'],
    ['a date without a time', { text: 'Pay rent', dueDate: '2030-05-01' }, 'dueDate'],
    ['a malformed due date', { text: 'Pay rent', dueDate: 'tomorrow' }, 'dueDate'],
    ['a numeric due date', { text: 'Pay rent', dueDate: 1_900_000_000_000 }, 'dueDate'],
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
  it('returns an empty first page for a new user', async () => {
    const res = await asUser(user).get('/todos').expect(200);

    expect(res.body).toEqual({ items: [], page: 1, limit: 10, total: 0, totalPages: 1 });
  });

  it('returns todos from the database, newest first', async () => {
    const first = await createTodo(user, 'First');
    const second = await createTodo(user, 'Second');

    const res = await asUser(user).get('/todos').expect(200);

    expect(res.body.items).toEqual([second, first]);
  });

  describe('pages', () => {
    beforeEach(async () => {
      await insertTodos(user, 25);
    });

    it('returns the first 10 todos by default', async () => {
      const res = await asUser(user).get('/todos').expect(200);

      expect(res.body).toMatchObject({ page: 1, limit: 10, total: 25, totalPages: 3 });
      expect(texts(res.body.items)).toEqual(range(24, 15));
    });

    it('returns the requested page', async () => {
      const second = await asUser(user).get('/todos?page=2').expect(200);
      const last = await asUser(user).get('/todos?page=3').expect(200);

      expect(texts(second.body.items)).toEqual(range(14, 5));
      expect(texts(last.body.items)).toEqual(range(4, 0));
      expect(last.body).toMatchObject({ page: 3, total: 25, totalPages: 3 });
    });

    it('honours the limit', async () => {
      const res = await asUser(user).get('/todos?page=2&limit=7').expect(200);

      expect(res.body).toMatchObject({ page: 2, limit: 7, total: 25, totalPages: 4 });
      expect(texts(res.body.items)).toEqual(range(17, 11));
    });

    it('returns an empty page past the end', async () => {
      const res = await asUser(user).get('/todos?page=4').expect(200);

      expect(res.body).toMatchObject({ items: [], page: 4, total: 25, totalPages: 3 });
    });

    it.each([
      ['page=0', 'page'],
      ['page=-1', 'page'],
      ['page=1.5', 'page'],
      ['page=abc', 'page'],
      ['limit=0', 'limit'],
      ['limit=101', 'limit'],
      ['filter=later', 'filter'],
    ])('rejects %s', async (query, path) => {
      const res = await asUser(user).get(`/todos?${query}`).expect(400);

      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [expect.objectContaining({ path })],
      });
    });
  });

  describe('filters', () => {
    const DAY = 24 * 60 * 60 * 1000;
    let todos: Record<
      'noDate' | 'future' | 'past' | 'doneFuture' | 'donePast' | 'doneNoDate',
      Todo
    >;

    beforeEach(async () => {
      const make = async (
        text: string,
        { completed = false, dueIn }: { completed?: boolean; dueIn?: number },
      ) => {
        const dueDate =
          dueIn === undefined ? undefined : new Date(Date.now() + dueIn).toISOString();
        const created = await asUser(user).post('/todos').send({ text, dueDate }).expect(201);
        if (!completed) return created.body as Todo;
        const done = await asUser(user)
          .put(`/todos/${created.body.id}`)
          .send({ completed: true })
          .expect(200);
        return done.body as Todo;
      };
      // Created one by one: the order below is the creation order.
      todos = {
        noDate: await make('No due date', {}),
        future: await make('Due tomorrow', { dueIn: DAY }),
        past: await make('Due yesterday', { dueIn: -DAY }),
        doneFuture: await make('Done, due tomorrow', { completed: true, dueIn: DAY }),
        donePast: await make('Done, due yesterday', { completed: true, dueIn: -DAY }),
        doneNoDate: await make('Done, no due date', { completed: true }),
      };
    });

    const list = async (filter: string) => {
      const res = await asUser(user).get(`/todos?filter=${filter}`).expect(200);
      return res.body as TodoPage;
    };

    it('all: every todo', async () => {
      const page = await list('all');

      expect(page.total).toBe(6);
      expect(page.items).toHaveLength(6);
    });

    it('active: not completed, due date not passed', async () => {
      const page = await list('active');

      expect(page.items).toEqual([todos.future, todos.noDate]);
      expect(page.total).toBe(2);
    });

    it('done: completed, whatever the due date', async () => {
      const page = await list('done');

      expect(page.items).toEqual([todos.doneNoDate, todos.donePast, todos.doneFuture]);
      expect(page.total).toBe(3);
    });

    it('overdue: not completed, due date passed', async () => {
      const page = await list('overdue');

      expect(page.items).toEqual([todos.past]);
      expect(page.total).toBe(1);
    });

    it('moves a todo from active to overdue once its due date passes', async () => {
      await TodoModel.updateOne({ _id: todos.future.id }, { dueDate: new Date(Date.now() - 1) });

      expect(texts((await list('active')).items)).toEqual([todos.noDate.text]);
      expect(texts((await list('overdue')).items)).toEqual([todos.past.text, todos.future.text]);
    });

    it('pages through filtered todos', async () => {
      const first = await asUser(user).get('/todos?filter=done&limit=2').expect(200);
      const second = await asUser(user).get('/todos?filter=done&limit=2&page=2').expect(200);

      expect(first.body).toMatchObject({ total: 3, totalPages: 2 });
      expect(first.body.items).toEqual([todos.doneNoDate, todos.donePast]);
      expect(second.body.items).toEqual([todos.doneFuture]);
    });
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

  it('sets and clears the due date', async () => {
    const todo = await createTodo(user);
    const dueDate = '2030-01-31T22:59:59.999Z';

    const set = await asUser(user).put(`/todos/${todo.id}`).send({ dueDate }).expect(200);
    expect(set.body).toMatchObject({ text: todo.text, dueDate });

    const cleared = await asUser(user).put(`/todos/${todo.id}`).send({ dueDate: null }).expect(200);
    expect(cleared.body).toMatchObject({ text: todo.text, dueDate: null });
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
    ['a malformed due date', { dueDate: '31.01.2030' }],
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
