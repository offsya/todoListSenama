import { MongoMemoryServer } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

/**
 * Gives the tests a MongoDB: the one at TEST_MONGODB_URI when it is set (GitHub Actions runs a
 * MongoDB service container for them, see .github/workflows/api-tests.yml), otherwise a single
 * in-memory server for the whole run. Every test file works in its own database either way.
 */
export default async function setup(project: TestProject) {
  const externalUri = process.env.TEST_MONGODB_URI;
  if (externalUri) {
    // Not the URI itself: it may carry a password.
    console.info('API tests use the MongoDB from TEST_MONGODB_URI');
    project.provide('mongoUri', externalUri);
    return;
  }

  console.info('API tests use an in-memory MongoDB (mongodb-memory-server)');
  const mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  project.provide('mongoUri', mongod.getUri());

  return async () => {
    await mongod.stop();
  };
}
