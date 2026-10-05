/**
 * Starts a local MongoDB without Docker or a system-wide installation, using the binary that
 * mongodb-memory-server downloads on `npm install`. Data is kept in `.mongo-data/` between runs.
 *
 *   npm run db:memory
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

const port = Number(process.env.MONGO_PORT ?? 27017);
const dbPath = resolve(import.meta.dirname, '../.mongo-data');
mkdirSync(dbPath, { recursive: true });

const mongod = await MongoMemoryServer.create({
  // The very first start initializes the data directory and can be slow (antivirus scans etc.).
  instance: { port, dbPath, storageEngine: 'wiredTiger', launchTimeout: 60_000 },
});

console.log(`MongoDB is running at ${mongod.getUri()}`);
console.log(`Data directory: ${dbPath}`);
console.log('Press Ctrl+C to stop.');

const stop = async () => {
  await mongod.stop({ doCleanup: false });
  process.exit(0);
};

process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
