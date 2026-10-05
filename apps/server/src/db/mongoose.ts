import mongoose, { type ConnectOptions } from 'mongoose';
import { logger } from '../lib/logger.js';

// Defense in depth against query selector injection ({ "$gt": "" } in user input).
// Request payloads are validated anyway, but this protects any query built from user data.
mongoose.set('sanitizeFilter', true);

export async function connectToDatabase(uri: string, options: ConnectOptions = {}): Promise<void> {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000, ...options });
  logger.info('Connected to MongoDB');
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export const isDatabaseConnected = (): boolean =>
  mongoose.connection.readyState === mongoose.ConnectionStates.connected;
