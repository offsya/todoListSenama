import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { isDatabaseConnected } from './db/mongoose.js';
import { httpLogger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

/** Builds the Express application. Kept separate from `index.ts` so tests can run it without a port. */
export function createApp(): Express {
  const app = express();

  app.use(httpLogger);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => {
    const dbUp = isDatabaseConnected();
    res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'unavailable' });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
