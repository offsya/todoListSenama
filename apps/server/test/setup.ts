import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, inject } from 'vitest';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';

beforeAll(async () => {
  // A database per test file lets Vitest run the files in parallel.
  await connectToDatabase(inject('mongoUri'), { dbName: `test-${randomUUID()}` });
  // Make sure unique indexes exist before the tests rely on them.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
});

afterEach(async () => {
  // deleteMany instead of dropDatabase: dropping would also drop the indexes.
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectFromDatabase();
});
