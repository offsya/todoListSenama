import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { objectIdSchema } from './validation.js';

// Pin the algorithm on both sides: never let the token header decide how it is verified.
const ALGORITHM = 'HS256';

export const { JsonWebTokenError, TokenExpiredError } = jwt;

export interface AccessTokenPayload {
  userId: string;
}

export function signAccessToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    subject: userId,
    // The format is validated by the env schema (e.g. "7d").
    expiresIn: env.JWT_EXPIRES_IN as NonNullable<SignOptions['expiresIn']>,
  });
}

/** Throws a `JsonWebTokenError` (`TokenExpiredError` for expired tokens) if the token is not valid. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] });

  const subject = objectIdSchema.safeParse(typeof payload === 'string' ? undefined : payload.sub);
  if (!subject.success) throw new JsonWebTokenError('Invalid token subject');

  return { userId: subject.data };
}
