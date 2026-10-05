import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
// Generous enough for passphrases and password managers; the whole value is hashed.
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 254;

export const emailSchema = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .max(EMAIL_MAX_LENGTH, `Email must be at most ${EMAIL_MAX_LENGTH} characters`)
  .pipe(z.email('Invalid email address'));

export const passwordSchema = z
  .string({ error: 'Password is required' })
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

export const registerSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
});

// Login intentionally does not enforce password rules: they may change over time,
// and existing users must still be able to sign in.
export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
