import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { isDatabaseConnected } from './db/mongoose.js';
import { createS3Storage, type FileStorage } from './lib/file-storage.js';
import { httpLogger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createAuthRouter } from './modules/auth/auth.router.js';
import { createTodosRouter } from './modules/todos/todos.router.js';

export interface AppOptions {
  /** Max login/registration attempts per IP within 15 minutes. */
  authRateLimit: number;
  /** Max requests to /todos per user within a minute. */
  todosRateLimit: number;
  /** Number of trusted reverse proxies in front of the API. */
  trustProxy: number;
  /** Where attachments are kept; `null` turns the attachment routes off (503). */
  storage: FileStorage | null;
}

/** The private S3 bucket from the environment, if one is configured. */
function storageFromEnv(): FileStorage | null {
  if (!env.S3_BUCKET || !env.AWS_REGION) return null;
  return createS3Storage({ bucket: env.S3_BUCKET, region: env.AWS_REGION });
}

/** Builds the Express application. Kept separate from `index.ts` so tests can run it without a port. */
export function createApp({
  authRateLimit = env.AUTH_RATE_LIMIT_MAX,
  todosRateLimit = env.TODOS_RATE_LIMIT_MAX,
  trustProxy = env.TRUST_PROXY,
  storage = storageFromEnv(),
}: Partial<AppOptions> = {}): Express {
  const app = express();
  // Leave the setting untouched without a proxy: express-rate-limit then warns about
  // unexpected X-Forwarded-For headers, which reveals a missing TRUST_PROXY in production.
  if (trustProxy > 0) app.set('trust proxy', trustProxy);

  app.use(httpLogger);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => {
    const dbUp = isDatabaseConnected();
    res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'unavailable' });
  });

  app.use('/auth', createAuthRouter({ rateLimit: authRateLimit }));
  app.use('/todos', createTodosRouter({ rateLimit: todosRateLimit, storage }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
