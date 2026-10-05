import { describe, expect, it, vi } from 'vitest';
import { createApiClient, type ApiClientOptions } from './client.js';
import { ApiError, getErrorMessage } from './errors.js';

const BASE_URL = 'http://api.test';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function setup(response: Response, options: Partial<ApiClientOptions> = {}) {
  const fetch = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(response));
  const api = createApiClient({ baseUrl: BASE_URL, fetch, ...options });
  return { api, fetch };
}

describe('createApiClient', () => {
  it('sends JSON with the bearer token and returns the parsed body', async () => {
    const todo = { id: '1', text: 'Buy milk', completed: false, createdAt: '', updatedAt: '' };
    const { api, fetch } = setup(jsonResponse(201, todo), { getToken: () => 'jwt-token' });

    await expect(api.todos.create({ text: 'Buy milk' })).resolves.toEqual(todo);

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/todos`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ text: 'Buy milk' }));
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer jwt-token',
      'Content-Type': 'application/json',
    });
  });

  it('supports async token getters and trailing slashes in the base URL', async () => {
    const { api, fetch } = setup(jsonResponse(200, []), {
      baseUrl: `${BASE_URL}/`,
      getToken: () => Promise.resolve('async-token'),
    });

    await api.todos.list();

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/todos`);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer async-token' });
  });

  it('does not send the token to the login endpoint', async () => {
    const { api, fetch } = setup(jsonResponse(200, { token: 't', user: {} }), {
      getToken: () => 'stale-token',
    });

    await api.auth.login({ email: 'john@example.com', password: 'secret123' });

    expect(fetch.mock.calls[0]![1].headers).not.toHaveProperty('Authorization');
  });

  it('resolves to undefined for 204 No Content', async () => {
    const { api, fetch } = setup(new Response(null, { status: 204 }));

    await expect(api.todos.remove('abc/123')).resolves.toBeUndefined();
    expect(fetch.mock.calls[0]![0]).toBe(`${BASE_URL}/todos/abc%2F123`);
  });

  it('turns an error response into an ApiError', async () => {
    const { api } = setup(
      jsonResponse(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ path: 'text', message: 'Text must not be empty' }],
        },
      }),
    );

    const error = await api.todos.create({ text: '' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(getErrorMessage(error)).toBe('Text must not be empty');
  });

  it('falls back to a generic error when the body is not JSON', async () => {
    const { api } = setup(new Response('<html>Bad gateway</html>', { status: 502 }));

    await expect(api.todos.list()).rejects.toMatchObject({ status: 502, code: 'INTERNAL_ERROR' });
  });

  it('reports a rejected token via onUnauthorized', async () => {
    const onUnauthorized = vi.fn();
    const { api } = setup(
      jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Token expired' } }),
      { getToken: () => 'expired', onUnauthorized },
    );

    await expect(api.todos.list()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('does not treat wrong credentials as an expired session', async () => {
    const onUnauthorized = vi.fn();
    const { api } = setup(
      jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } }),
      { onUnauthorized },
    );

    await expect(
      api.auth.login({ email: 'john@example.com', password: 'wrong-password' }),
    ).rejects.toMatchObject({ message: 'Invalid email or password' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('reports network failures', async () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    const api = createApiClient({ baseUrl: BASE_URL, fetch });

    await expect(api.todos.list()).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('aborts requests that take too long', async () => {
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const api = createApiClient({ baseUrl: BASE_URL, fetch, timeoutMs: 10 });

    await expect(api.todos.list()).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

describe('getErrorMessage', () => {
  it('hides unexpected errors behind a generic message', () => {
    expect(getErrorMessage(new Error('Cannot read properties of undefined'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
