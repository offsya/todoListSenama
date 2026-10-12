import type { LoginInput, RegisterInput } from '../schemas/auth.js';
import type { CreateTodoInput, ListTodosQuery, UpdateTodoInput } from '../schemas/todo.js';
import type { AuthResponse, CurrentUserResponse, Todo, TodoPage } from '../types.js';
import { ApiError, isApiErrorBody } from './errors.js';

type MaybePromise<T> = T | Promise<T>;
type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  /** API origin, e.g. `http://localhost:4000`. */
  baseUrl: string;
  /** Returns the current access token; requests go without `Authorization` when there is none. */
  getToken?: () => MaybePromise<string | null | undefined>;
  /**
   * Called when the API rejects the token of an authenticated request (HTTP 401), with that
   * token: by the time a slow response arrives, the user may have signed in again.
   */
  onUnauthorized?: (rejectedToken: string) => void;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
  /** Custom fetch implementation, mostly for tests. Defaults to the global `fetch`. */
  fetch?: FetchFn;
}

interface RequestOptions {
  /** Sent as JSON. */
  body?: unknown;
  /** Sent as multipart/form-data, with the boundary the platform picks. */
  form?: FormData;
  /** Attach the access token. Disabled for login/registration. */
  auth?: boolean;
  /** Read a successful response as a file instead of JSON. */
  responseType?: 'json' | 'blob';
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
/** Files take longer than JSON, especially on a phone. */
const FILE_TIMEOUT_MS = 120_000;

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Resolve the global lazily and call it unbound: `someObject.fetch(...)` throws "Illegal invocation" in browsers.
  const fetchFn: FetchFn = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function request<T>(
    method: string,
    path: string,
    { body, form, auth = true, responseType = 'json', ...rest }: RequestOptions = {},
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const token = auth ? await options.getToken?.() : undefined;
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), rest.timeoutMs ?? timeoutMs);

    let response: Response;
    let payload: unknown;
    try {
      response = await fetchFn(`${baseUrl}${path}`, {
        method,
        headers,
        body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
        signal: controller.signal,
      });
      // The timeout covers the body too: a connection that stalls halfway through the response
      // must not leave the request pending forever.
      if (response.status === 204) payload = undefined;
      else if (response.ok && responseType === 'blob') payload = await response.blob();
      else payload = await readJson(response);
    } catch {
      if (controller.signal.aborted) {
        throw new ApiError(0, 'TIMEOUT', 'The server took too long to respond. Please try again.');
      }
      throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the server. Check your connection.');
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 204) return undefined as T;

    if (!response.ok) {
      // A 401 on a request that carried a token means that token is no longer valid.
      // A 401 from the login endpoint (wrong password) must not log the user out.
      if (response.status === 401 && token) options.onUnauthorized?.(token);
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
      list: (query: Partial<ListTodosQuery> = {}) =>
        request<TodoPage>('GET', `/todos${toQueryString(query)}`),
      create: (input: CreateTodoInput) => request<Todo>('POST', '/todos', { body: input }),
      update: (id: string, input: UpdateTodoInput) =>
        request<Todo>('PUT', `/todos/${encodeURIComponent(id)}`, { body: input }),
      remove: (id: string) => request<void>('DELETE', `/todos/${encodeURIComponent(id)}`),
      /**
       * Attaches a file (replacing the previous one): `form` carries it in the
       * `ATTACHMENT_FIELD` field. On React Native the value can be `{ uri, name, type }`.
       */
      uploadAttachment: (id: string, form: FormData) =>
        request<Todo>('POST', attachmentPath(id), { form, timeoutMs: FILE_TIMEOUT_MS }),
      downloadAttachment: (id: string) =>
        request<Blob>('GET', attachmentPath(id), {
          responseType: 'blob',
          timeoutMs: FILE_TIMEOUT_MS,
        }),
      /** Absolute URL of the attachment, for platforms that download to disk themselves. */
      attachmentUrl: (id: string) => `${baseUrl}${attachmentPath(id)}`,
    },
  };
}

const attachmentPath = (id: string) => `/todos/${encodeURIComponent(id)}/attachment`;

export type ApiClient = ReturnType<typeof createApiClient>;

function toQueryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

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
