import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../src/app.js';

export const app = createApp();

export const api = () => request(app);

/** Matches an ISO-8601 timestamp produced by `Date#toISOString`. */
export const isoDate = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

/** A syntactically valid id that does not belong to any document. */
export const missingId = '64b7f0c2a1b2c3d4e5f60718';
