import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const SECRET = 'a-random-secret-that-is-long-enough-for-hs256';

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv({ JWT_SECRET: SECRET });

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      JWT_EXPIRES_IN: '7d',
      PASSWORD_HASH_COST: 15,
      CORS_ORIGIN: ['http://localhost:5173', 'http://localhost:8081'],
    });
  });

  it('parses a comma-separated list of CORS origins', () => {
    const env = parseEnv({
      JWT_SECRET: SECRET,
      CORS_ORIGIN: ' https://a.example , https://b.example,',
    });

    expect(env.CORS_ORIGIN).toEqual(['https://a.example', 'https://b.example']);
  });

  it.each([
    ['a missing JWT secret', {}, 'JWT_SECRET is required'],
    ['a short JWT secret', { JWT_SECRET: 'short' }, 'at least 32 characters'],
    [
      'a token lifetime without a unit',
      { JWT_SECRET: SECRET, JWT_EXPIRES_IN: '3600' },
      '15m, 12h or 7d',
    ],
    ['a non-MongoDB URI', { JWT_SECRET: SECRET, MONGODB_URI: 'postgres://db' }, 'mongodb://'],
  ])('rejects %s', (_, source, message) => {
    expect(() => parseEnv(source)).toThrow(message);
  });

  it('refuses the example JWT secret in production', () => {
    const source = {
      NODE_ENV: 'production',
      JWT_SECRET: 'dev-only-secret-change-me-0123456789abcdef',
    };

    expect(() => parseEnv(source)).toThrow('Replace the example JWT_SECRET');
    expect(() => parseEnv({ ...source, NODE_ENV: 'development' })).not.toThrow();
  });
});
