import { describe, expect, it } from 'vitest';
import { loginSchema, PASSWORD_MAX_LENGTH, registerSchema } from './auth.js';

describe('registerSchema', () => {
  it('normalizes the email', () => {
    const result = registerSchema.parse({
      email: '  John.Doe@Example.COM ',
      password: 'secret123',
    });

    expect(result.email).toBe('john.doe@example.com');
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['without domain', 'john@'],
    ['not a string', 42],
  ])('rejects an email that is %s', (_, email) => {
    const result = registerSchema.safeParse({ email, password: 'secret123' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['email']);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = registerSchema.safeParse({ email: 'john@example.com', password: 'short' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Password must be at least 8 characters');
  });

  it('rejects a password longer than bcrypt can handle', () => {
    const result = registerSchema.safeParse({
      email: 'john@example.com',
      password: 'a'.repeat(PASSWORD_MAX_LENGTH + 1),
    });

    expect(result.success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = registerSchema.safeParse({
      email: 'john@example.com',
      password: 'secret123',
      role: 'admin',
    });

    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('does not apply password strength rules', () => {
    expect(loginSchema.safeParse({ email: 'john@example.com', password: '1' }).success).toBe(true);
  });

  it('requires a password', () => {
    const result = loginSchema.safeParse({ email: 'john@example.com', password: '' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Password is required');
  });
});
