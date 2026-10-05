import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/password.js';

describe('password hashing', () => {
  it('verifies the original password only', async () => {
    const hash = await hashPassword('correct-horse-battery');

    await expect(verifyPassword('correct-horse-battery', hash)).resolves.toBe(true);
    await expect(verifyPassword('correct-horse-batterY', hash)).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    const [first, second] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);

    expect(first).not.toBe(second);
  });

  it('uses the whole password, not just a prefix', async () => {
    const long = 'п'.repeat(72);
    const hash = await hashPassword(long);

    await expect(verifyPassword(long.slice(0, 36), hash)).resolves.toBe(false);
  });

  it('treats different Unicode forms of the same text as the same password', async () => {
    const composed = 'café-password'; // é as one code point
    const decomposed = 'café-password'; // e + combining accent

    const hash = await hashPassword(composed);

    await expect(verifyPassword(decomposed, hash)).resolves.toBe(true);
  });

  it.each([
    ['an empty string', ''],
    ['another algorithm', '$2b$10$abcdefghijklmnopqrstuv'],
    ['a truncated hash', 'scrypt$10$8$3$c2FsdA=='],
    ['an absurd cost', 'scrypt$40$8$3$c2FsdA==$a2V5'],
  ])('rejects %s', async (_, hash) => {
    await expect(verifyPassword('whatever', hash)).resolves.toBe(false);
  });
});
