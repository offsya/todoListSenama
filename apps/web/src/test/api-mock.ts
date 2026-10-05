import type {
  ApiErrorBody,
  ApiErrorCode,
  AuthResponse,
  CreateTodoInput,
  LoginInput,
  RegisterInput,
  Todo,
  UpdateTodoInput,
  User,
} from '@todo/shared';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';

/**
 * A small in-memory fake of the API for component tests. It mirrors the real contract
 * (status codes, error format, ownership, strict payloads) without a server or database.
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

const unauthorized = () => apiError(401, 'UNAUTHORIZED', 'Invalid token');
const notFound = () => apiError(404, 'NOT_FOUND', 'Todo not found');

function toTodo({ ownerId: _ownerId, ...todo }: StoredTodo): Todo {
  return todo;
}

function hasOnlyKeys(body: object, allowed: string[]) {
  return Object.keys(body).every((key) => allowed.includes(key));
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
  http.post<never, RegisterInput, AuthResponse | ApiErrorBody>(
    `${API_URL}/auth/register`,
    async ({ request }) => {
      const body = await request.json();
      if (!hasOnlyKeys(body, ['email', 'password'])) {
        return apiError(400, 'VALIDATION_ERROR', 'Validation failed');
      }
      if (db.users.some(({ user }) => user.email === body.email)) {
        return apiError(409, 'CONFLICT', 'Email is already registered');
      }
      return HttpResponse.json(seedUser(body.email, body.password), { status: 201 });
    },
  ),

  http.post<never, LoginInput, AuthResponse | ApiErrorBody>(
    `${API_URL}/auth/login`,
    async ({ request }) => {
      const { email, password } = await request.json();
      const match = db.users.find(
        (entry) => entry.user.email === email && entry.password === password,
      );
      if (!match) return apiError(401, 'UNAUTHORIZED', 'Invalid email or password');
      return HttpResponse.json({ token: tokenFor(match.user), user: match.user });
    },
  ),

  http.get(`${API_URL}/todos`, ({ request }) => {
    const user = authenticate(request);
    if (!user) return unauthorized();
    return HttpResponse.json(db.todos.filter((todo) => todo.ownerId === user.id).map(toTodo));
  }),

  http.post(`${API_URL}/todos`, async ({ request }) => {
    const user = authenticate(request);
    if (!user) return unauthorized();
    const { text } = (await request.json()) as CreateTodoInput;
    const todo: StoredTodo = {
      id: nextId(),
      text,
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
    Object.assign(todo, (await request.json()) as UpdateTodoInput, { updatedAt: now() });
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
