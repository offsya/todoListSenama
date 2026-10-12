import { getTodoFilter } from '@todo/client';
import {
  ATTACHMENT_FIELD,
  createTodoSchema,
  listTodosQuerySchema,
  loginSchema,
  registerSchema,
  updateTodoSchema,
  type ApiErrorBody,
  type ApiErrorCode,
  type AuthResponse,
  type Todo,
  type TodoPage,
  type User,
} from '@todo/shared';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import type { ZodError } from 'zod';

/**
 * A small in-memory fake of the API for component tests. It follows the real contract: the
 * same zod schemas validate payloads (unknown fields are rejected), errors have the API's shape,
 * and every todo route checks the token and the owner.
 */

export const API_URL = `${window.location.origin}/api`;

interface StoredUser {
  user: User;
  password: string;
}

interface StoredTodo extends Todo {
  ownerId: string;
}

const db = {
  users: [] as StoredUser[],
  todos: [] as StoredTodo[],
  files: new Map<string, File>(),
  requests: [] as string[],
  sequence: 0,
};

export function resetApiMock() {
  db.users = [];
  db.todos = [];
  db.files = new Map();
  db.requests = [];
  db.sequence = 0;
}

const nextId = () => (db.sequence += 1).toString(16).padStart(24, '0');
const now = () => new Date().toISOString();
const tokenFor = (user: User) => `token-for-${user.id}`;

export const apiError = (status: number, code: ApiErrorCode, message: string) =>
  HttpResponse.json<ApiErrorBody>({ error: { code, message } }, { status });

const validationError = (error: ZodError) =>
  HttpResponse.json<ApiErrorBody>(
    {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    },
    { status: 400 },
  );

const unauthorized = () => apiError(401, 'UNAUTHORIZED', 'Invalid token');
const notFound = () => apiError(404, 'NOT_FOUND', 'Todo not found');

function toTodo({ ownerId: _ownerId, ...todo }: StoredTodo): Todo {
  return todo;
}

function authenticate(request: Request): User | undefined {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  return db.users.find(({ user }) => tokenFor(user) === token)?.user;
}

// ---- Fixtures --------------------------------------------------------------------------

export function seedUser(email = 'alice@example.com', password = 'password123'): AuthResponse {
  const user: User = { id: nextId(), email, createdAt: now() };
  db.users.push({ user, password });
  return { token: tokenFor(user), user };
}

export function seedTodo(
  owner: AuthResponse,
  text: string,
  completed = false,
  dueDate: string | null = null,
): Todo {
  const todo: StoredTodo = {
    id: nextId(),
    text,
    completed,
    dueDate,
    attachment: null,
    createdAt: now(),
    updatedAt: now(),
    ownerId: owner.user.id,
  };
  db.todos.unshift(todo);
  return toTodo(todo);
}

/** The file stored for a todo, as the fake API received it. */
export const storedFile = (todoId: string) => db.files.get(todoId);

export const findStoredTodo = (text: string) => db.todos.find((todo) => todo.text === text);

/** Requests the app sent to the API, e.g. `POST /auth/login`. */
export const apiRequests = () => [...db.requests];

// ---- Handlers --------------------------------------------------------------------------

const handlers = [
  http.post(`${API_URL}/auth/register`, async ({ request }) => {
    const input = registerSchema.safeParse(await request.json());
    if (!input.success) return validationError(input.error);
    if (db.users.some(({ user }) => user.email === input.data.email)) {
      return apiError(409, 'CONFLICT', 'Email is already registered');
    }
    return HttpResponse.json(seedUser(input.data.email, input.data.password), { status: 201 });
  }),

  http.post(`${API_URL}/auth/login`, async ({ request }) => {
    const input = loginSchema.safeParse(await request.json());
    if (!input.success) return validationError(input.error);
    const { email, password } = input.data;
    const match = db.users.find(
      (entry) => entry.user.email === email && entry.password === password,
    );
    if (!match) return apiError(401, 'UNAUTHORIZED', 'Invalid email or password');
    return HttpResponse.json({ token: tokenFor(match.user), user: match.user });
  }),

  http.get(`${API_URL}/todos`, ({ request }) => {
    const user = authenticate(request);
    if (!user) return unauthorized();
    const query = listTodosQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success) return validationError(query.error);
    const { filter, page, limit } = query.data;
    const matching = db.todos
      .filter((todo) => todo.ownerId === user.id && getTodoFilter(filter).matches(todo))
      .map(toTodo);
    const body: TodoPage = {
      items: matching.slice((page - 1) * limit, page * limit),
      page,
      limit,
      total: matching.length,
      totalPages: Math.max(1, Math.ceil(matching.length / limit)),
    };
    return HttpResponse.json(body);
  }),

  http.post(`${API_URL}/todos`, async ({ request }) => {
    const user = authenticate(request);
    if (!user) return unauthorized();
    const input = createTodoSchema.safeParse(await request.json());
    if (!input.success) return validationError(input.error);
    const todo: StoredTodo = {
      id: nextId(),
      text: input.data.text,
      completed: false,
      dueDate: input.data.dueDate ?? null,
      attachment: null,
      createdAt: now(),
      updatedAt: now(),
      ownerId: user.id,
    };
    db.todos.unshift(todo);
    return HttpResponse.json(toTodo(todo), { status: 201 });
  }),

  http.put(`${API_URL}/todos/:id`, async ({ request, params }) => {
    const user = authenticate(request);
    if (!user) return unauthorized();
    const todo = db.todos.find((item) => item.id === params.id && item.ownerId === user.id);
    if (!todo) return notFound();
    const input = updateTodoSchema.safeParse(await request.json());
    if (!input.success) return validationError(input.error);
    Object.assign(todo, input.data, { updatedAt: now() });
    return HttpResponse.json(toTodo(todo));
  }),

  http.delete(`${API_URL}/todos/:id`, ({ request, params }) => {
    const user = authenticate(request);
    if (!user) return unauthorized();
    const index = db.todos.findIndex((item) => item.id === params.id && item.ownerId === user.id);
    if (index === -1) return notFound();
    db.todos.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API_URL}/todos/:id/attachment`, async ({ request, params }) => {
    const user = authenticate(request);
    if (!user) return unauthorized();
    const todo = db.todos.find((item) => item.id === params.id && item.ownerId === user.id);
    if (!todo) return notFound();
    const file = (await request.formData()).get(ATTACHMENT_FIELD);
    if (!(file instanceof File)) return apiError(400, 'BAD_REQUEST', 'Send one file');
    db.files.set(todo.id, file);
    todo.attachment = { name: file.name, size: file.size, contentType: file.type };
    return HttpResponse.json(toTodo(todo));
  }),

  http.get(`${API_URL}/todos/:id/attachment`, ({ request, params }) => {
    const user = authenticate(request);
    if (!user) return unauthorized();
    const todo = db.todos.find((item) => item.id === params.id && item.ownerId === user.id);
    const file = todo && db.files.get(todo.id);
    if (!file) return notFound();
    return new HttpResponse(file, { headers: { 'Content-Type': file.type } });
  }),
];

export const server = setupServer(...handlers);

server.events.on('request:start', ({ request }) => {
  const url = new URL(request.url);
  db.requests.push(`${request.method} ${url.pathname.replace(/^\/api/, '')}${url.search}`);
});
