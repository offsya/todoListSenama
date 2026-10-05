import { describe, expect, it } from 'vitest';
import { api } from './helpers.js';

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
