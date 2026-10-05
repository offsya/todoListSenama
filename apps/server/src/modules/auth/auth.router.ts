import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../../lib/http-error.js';
import { getDummyPasswordHash } from '../../lib/password.js';
import { requireAuth } from '../../middleware/auth.js';
import * as authController from './auth.controller.js';

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export interface AuthRouterOptions {
  /** Max requests per IP to each of the credential endpoints within the window. */
  rateLimit: number;
}

export function createAuthRouter({ rateLimit: limit }: AuthRouterOptions): Router {
  // Compute the hash used for unknown emails now, so the first such login is not slower.
  void getDummyPasswordHash();

  // Every attempt counts, successful or not: each one costs a password hash, so the limit
  // protects the CPU as well as slowing down password guessing.
  // A separate counter per endpoint: failed logins do not block registration and vice versa.
  const limiter = () =>
    rateLimit({
      windowMs: RATE_LIMIT_WINDOW_MS,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, _res, next) =>
        next(HttpError.tooManyRequests('Too many attempts. Please try again later.')),
    });

  const router = Router();
  router.post('/register', limiter(), authController.register);
  router.post('/login', limiter(), authController.login);
  router.get('/me', requireAuth, authController.me);
  return router;
}
