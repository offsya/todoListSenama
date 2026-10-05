import { describe, expect, it } from 'vitest';
import { api, asUser, createUser } from './helpers.js';

describe('application', () => {
  it('reports health', async () => {
    const res = await api().get('/health').expect(200);

    expect(res.body).toEqual({ status: 'ok' });
  });

  it('responds with a JSON 404 for unknown routes', async () => {
    const res = await api().get('/unknown').expect(404);

    expect(res.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Route GET /unknown not found',
    });
  });

  it('sets security headers', async () => {
    const res = await api().get('/health');

    expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff');
    expect(res.headers).not.toHaveProperty('x-powered-by');
  });

  it('allows the configured CORS origins only', async () => {
    const allowed = await api().get('/health').set('Origin', 'http://localhost:5173');
    const denied = await api().get('/health').set('Origin', 'https://evil.example.com');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(denied.headers).not.toHaveProperty('access-control-allow-origin');
  });
});

describe('malformed requests are client errors, not crashes', () => {
  it('rejects a body that claims to be gzip but is not', async () => {
    const res = await api()
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .send('{"email":"a@example.com","password":"x"}')
      .expect(400);

    expect(res.body.error).toEqual({ code: 'BAD_REQUEST', message: 'Bad Request' });
  });

  it('rejects an unsupported content encoding', async () => {
    const res = await api()
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'compress')
      .send('{}')
      .expect(415);

    expect(res.body.error).toEqual({ code: 'BAD_REQUEST', message: 'Unsupported Media Type' });
  });

  it('rejects an invalid percent-encoding in the URL', async () => {
    const user = await createUser();

    const res = await asUser(user).get('/todos/%E0%A4%A').expect(400);

    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});
