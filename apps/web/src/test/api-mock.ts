import {
  createTodoSchema,
  loginSchema,
  registerSchema,
  updateTodoSchema,
  type ApiErrorBody,
  type ApiErrorCode,
  type AuthResponse,
  type Todo,
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
  requests: [] as string[],
  sequence: 0,
};

export function resetApiMock() {
  db.users = [];
  db.todos = [];
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

export function seedTodo(owner: AuthResponse, text: string, completed = false): Todo {
  const todo: StoredTodo = {
    id: nextId(),
    text,
    completed,
    createdAt: now(),
    updatedAt: now(),
    ownerId: owner.user.id,
  };
  db.todos.unshift(todo);
  return toTodo(todo);
}

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
    return HttpResponse.json(db.todos.filter((todo) => todo.ownerId === user.id).map(toTodo));
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
];

export const server = setupServer(...handlers);

server.events.on('request:start', ({ request }) => {
  db.requests.push(`${request.method} ${new URL(request.url).pathname.replace(/^\/api/, '')}`);
});
