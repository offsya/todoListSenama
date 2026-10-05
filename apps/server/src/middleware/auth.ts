import type { Request, RequestHandler } from 'express';
import { HttpError } from '../lib/http-error.js';
import { TokenExpiredError, verifyAccessToken } from '../lib/jwt.js';

/** Rejects requests without a valid `Authorization: Bearer <token>` header with 401. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const [scheme, token, ...rest] = req.get('authorization')?.split(' ') ?? [];
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) {
    throw HttpError.unauthorized('Authentication required');
  }

  try {
    req.user = { id: verifyAccessToken(token).userId };
  } catch (error) {
    throw HttpError.unauthorized(
      error instanceof TokenExpiredError ? 'Token has expired' : 'Invalid token',
    );
  }
  next();
};

/** Id of the authenticated user. Only valid behind `requireAuth`. */
export function getUserId(req: Request): string {
  if (!req.user) throw HttpError.unauthorized('Authentication required');
  return req.user.id;
}
