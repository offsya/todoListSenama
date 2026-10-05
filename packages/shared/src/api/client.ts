import type { LoginInput, RegisterInput } from '../schemas/auth.js';
import type { CreateTodoInput, UpdateTodoInput } from '../schemas/todo.js';
import type { AuthResponse, CurrentUserResponse, Todo } from '../types.js';
import { ApiError, isApiErrorBody } from './errors.js';

type MaybePromise<T> = T | Promise<T>;
type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  /** API origin, e.g. `http://localhost:4000`. */
  baseUrl: string;
  /** Returns the current access token; requests go without `Authorization` when there is none. */
  getToken?: () => MaybePromise<string | null | undefined>;
  /** Called when the API rejects the token of an authenticated request (HTTP 401). */
  onUnauthorized?: () => void;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
  /** Custom fetch implementation, mostly for tests. Defaults to the global `fetch`. */
  fetch?: FetchFn;
}

interface RequestOptions {
  body?: unknown;
  /** Attach the access token. Disabled for login/registration. */
  auth?: boolean;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Resolve the global lazily and call it unbound: `someObject.fetch(...)` throws "Illegal invocation" in browsers.
  const fetchFn: FetchFn = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function request<T>(
    method: string,
    path: string,
    { body, auth = true }: RequestOptions = {},
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const token = auth ? await options.getToken?.() : undefined;
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new ApiError(0, 'TIMEOUT', 'The server took too long to respond. Please try again.');
      }
      throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the server. Check your connection.');
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 204) return undefined as T;

    const payload = await readJson(response);

    if (!response.ok) {
      // A 401 on a request that carried a token means the session is no longer valid.
      // A 401 from the login endpoint (wrong password) must not log the user out.
      if (response.status === 401 && token) options.onUnauthorized?.();
      throw toApiError(response.status, payload);
    }

    if (payload === undefined) {
      throw new ApiError(response.status, 'INTERNAL_ERROR', 'Unexpected response from the server.');
    }
    return payload as T;
  }

  return {
    auth: {
      register: (input: RegisterInput) =>
        request<AuthResponse>('POST', '/auth/register', { body: input, auth: false }),
      login: (input: LoginInput) =>
        request<AuthResponse>('POST', '/auth/login', { body: input, auth: false }),
      me: async () => (await request<CurrentUserResponse>('GET', '/auth/me')).user,
    },
    todos: {
      list: () => request<Todo[]>('GET', '/todos'),
      create: (input: CreateTodoInput) => request<Todo>('POST', '/todos', { body: input }),
      update: (id: string, input: UpdateTodoInput) =>
        request<Todo>('PUT', `/todos/${encodeURIComponent(id)}`, { body: input }),
      remove: (id: string) => request<void>('DELETE', `/todos/${encodeURIComponent(id)}`),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function toApiError(status: number, payload: unknown): ApiError {
  if (isApiErrorBody(payload)) {
    const { code, message, details } = payload.error;
    return new ApiError(status, code, message, details ?? []);
  }
  return new ApiError(
    status,
    status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
    `Request failed with status ${status}`,
  );
}
