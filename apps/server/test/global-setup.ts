import { MongoMemoryServer } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

/** Starts a single in-memory MongoDB for the whole test run. */
export default async function setup(project: TestProject) {
  const mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  project.provide('mongoUri', mongod.getUri());

  return async () => {
    await mongod.stop();
  };
}
