import { Router } from 'express';
import { rateLimit, type Options as RateLimitOptions } from 'express-rate-limit';
import { HttpError } from '../../lib/http-error.js';
import { requireAuth } from '../../middleware/auth.js';
import * as authController from './auth.controller.js';

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export interface AuthRouterOptions {
  /** Max requests per IP to each of the credential endpoints within the window. */
  rateLimit: number;
}

export function createAuthRouter({ rateLimit: limit }: AuthRouterOptions): Router {
  // A separate counter per endpoint: failed logins should not block registration and vice versa.
  const limiter = (options: Partial<RateLimitOptions> = {}) =>
    rateLimit({
      windowMs: RATE_LIMIT_WINDOW_MS,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, _res, next) =>
        next(HttpError.tooManyRequests('Too many attempts. Please try again later.')),
      ...options,
    });

  const router = Router();
  router.post('/register', limiter(), authController.register);
  // Only failed attempts count towards the login limit: it exists to stop password guessing.
  router.post('/login', limiter({ skipSuccessfulRequests: true }), authController.login);
  router.get('/me', requireAuth, authController.me);
  return router;
}
