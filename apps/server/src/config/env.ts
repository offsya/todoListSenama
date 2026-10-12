import { z } from 'zod';

/** Optional setting; an empty value (`S3_BUCKET=` in an env file) counts as not set. */
const optionalString = () =>
  z.preprocess((value) => (value === '' ? undefined : value), z.string().optional());

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    MONGODB_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\//, 'Must be a mongodb:// or mongodb+srv:// connection string')
      .default('mongodb://127.0.0.1:27017/todo-app'),
    CORS_ORIGIN: z
      .string()
      .default('http://localhost:5173,http://localhost:8081')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    JWT_SECRET: z
      .string({ error: 'JWT_SECRET is required' })
      .min(32, 'JWT_SECRET must be at least 32 characters long'),
    JWT_EXPIRES_IN: z
      .string()
      .regex(/^\d+[smhd]$/, 'Use a duration like 15m, 12h or 7d')
      // Short-lived: there are no refresh tokens, so a leaked token is only good for 15 minutes.
      .default('15m'),
    /** log2 of the scrypt CPU/memory cost: 15 means N = 32768 (32 MiB, ~0.2 s per hash). */
    PASSWORD_HASH_COST: z.coerce.number().int().min(10).max(20).default(15),
    /** Max login/registration attempts per IP and endpoint within the 15-minute window. */
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    /** Max requests to /todos per user within a minute: far above what a person clicks. */
    TODOS_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    /** Number of reverse proxies in front of the API, so rate limiting sees real client IPs. */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    /** Interface to listen on, e.g. 127.0.0.1 behind a reverse proxy on the same machine. */
    HOST: optionalString(),
    /** Private S3 bucket for todo attachments. Without it the attachment routes answer 503. */
    S3_BUCKET: optionalString(),
    /** Region of the bucket. Credentials come from the AWS default chain (the EC2 instance role). */
    AWS_REGION: optionalString(),
  })
  .superRefine((env, ctx) => {
    // The .env.example value is fine locally but would let anyone mint tokens in production.
    if (env.NODE_ENV === 'production' && env.JWT_SECRET.includes('change-me')) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'Replace the example JWT_SECRET from .env.example with a random secret',
      });
    }
    if (env.S3_BUCKET && !env.AWS_REGION) {
      ctx.addIssue({
        code: 'custom',
        path: ['AWS_REGION'],
        message: 'Set AWS_REGION to the region of S3_BUCKET',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Fail fast on startup instead of crashing later with a confusing error.
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
