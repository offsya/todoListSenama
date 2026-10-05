// Smoke test of the Docker stack. Start the stack first:
//
//   docker compose up -d --build --wait
//   npm run smoke
//
// Checks that both apps are served and reach the API through nginx, then walks through the
// main requirements over HTTP: the list does not open without a token, other users' todos are
// out of reach and invalid data is rejected. Every run registers two throwaway users.
// WEB_URL, MOBILE_WEB_URL and API_URL point it at another host.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, describe, it } from 'node:test';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:8080';
const MOBILE_WEB_URL = process.env.MOBILE_WEB_URL ?? 'http://localhost:8082';
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** Sends a request to the API; resolves with the status and the parsed JSON body. */
async function api(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(API_URL + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

for (const [name, url] of [
  ['web app', WEB_URL],
  ['mobile app, web build', MOBILE_WEB_URL],
]) {
  describe(name, () => {
    it('serves the app on every client-side route, with security headers', async () => {
      for (const path of ['/', '/some/client/route']) {
        const res = await fetch(url + path);
        assert.equal(res.status, 200, path);
        assert.match(await res.text(), /<div id="root">/);
        assert.match(res.headers.get('content-security-policy') ?? '', /script-src 'self'/);
        assert.equal(res.headers.get('x-frame-options'), 'DENY');
      }
    });

    it('reaches the API through /api', async () => {
      const res = await fetch(`${url}/api/health`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { status: 'ok' });
    });
  });
}

describe('API', () => {
  const password = 'smoke-test-password';
  let alice;
  let bob;

  before(async () => {
    const register = async () => {
      const email = `smoke-${randomUUID()}@example.com`;
      const res = await api('POST', '/auth/register', { body: { email, password } });
      assert.equal(res.status, 201);
      return { email, token: res.body.token };
    };
    alice = await register();
    bob = await register();
  });

  it('is healthy', async () => {
    assert.equal((await api('GET', '/health')).status, 200);
  });

  it('logs in with the right password only', async () => {
    const ok = await api('POST', '/auth/login', { body: { email: alice.email, password } });
    assert.equal(ok.status, 200);
    assert.equal(typeof ok.body.token, 'string');

    const wrong = await api('POST', '/auth/login', {
      body: { email: alice.email, password: 'wrong-password' },
    });
    assert.equal(wrong.status, 401);
  });

  it('does not open the list without a valid token', async () => {
    assert.equal((await api('GET', '/todos')).status, 401);
    assert.equal((await api('GET', '/todos', { token: 'not-a-token' })).status, 401);
  });

  it('rejects invalid data', async () => {
    const res = await api('POST', '/todos', { token: alice.token, body: { text: '   ' } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it("lets users manage their own todos and nobody else's", async () => {
    const created = await api('POST', '/todos', {
      token: alice.token,
      body: { text: 'Smoke test' },
    });
    assert.equal(created.status, 201);
    const path = `/todos/${created.body.id}`;

    // Someone else's todo looks exactly like a missing one.
    const asBob = { token: bob.token };
    assert.equal((await api('GET', path, asBob)).status, 404);
    assert.equal((await api('PUT', path, { ...asBob, body: { completed: true } })).status, 404);
    assert.equal((await api('DELETE', path, asBob)).status, 404);
    assert.deepEqual((await api('GET', '/todos', asBob)).body, []);

    const updated = await api('PUT', path, {
      token: alice.token,
      body: { text: 'Smoke test, done', completed: true },
    });
    assert.equal(updated.status, 200);
    assert.deepEqual((await api('GET', '/todos', { token: alice.token })).body, [updated.body]);

    assert.equal((await api('DELETE', path, { token: alice.token })).status, 204);
    assert.deepEqual((await api('GET', '/todos', { token: alice.token })).body, []);
  });
});
