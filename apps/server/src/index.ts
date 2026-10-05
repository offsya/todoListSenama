import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectToDatabase, disconnectFromDatabase } from './db/mongoose.js';
import { logger } from './lib/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  await connectToDatabase(env.MONGODB_URI);

  const server = createApp().listen(env.PORT, (error?: Error) => {
    if (error) {
      // Express 5 reports listen errors (e.g. EADDRINUSE) here instead of throwing.
      logger.fatal({ err: error }, `Cannot listen on port ${env.PORT}`);
      void disconnectFromDatabase().finally(() => process.exit(1));
      return;
    }
    logger.info(`API is listening on http://localhost:${env.PORT}`);
  });

  const shutdown = (signal: NodeJS.Signals) => {
    logger.info({ signal }, 'Shutting down');
    // Stop accepting new connections, let in-flight requests finish, then close the DB.
    server.close((error) => {
      disconnectFromDatabase()
        .catch((dbError: unknown) => logger.error({ err: dbError }, 'Failed to close MongoDB'))
        .finally(() => process.exit(error ? 1 : 0));
    });
    server.closeIdleConnections();
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Failed to start the API');
  process.exit(1);
});
