import type { Request } from 'express';
import { z } from 'zod';

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const idParamsSchema = z.object({ id: objectIdSchema });

/**
 * Validates the request body. Throws a ZodError that the error handler turns into a 400 response.
 * Express 5 leaves `req.body` undefined when there is no body, so validate `{}` instead to get
 * field-level messages ("Text must be a string") rather than "expected object".
 */
export function parseBody<T extends z.ZodType>(schema: T, req: Request): z.output<T> {
  return schema.parse(req.body ?? {});
}

export function parseParams<T extends z.ZodType>(schema: T, req: Request): z.output<T> {
  return schema.parse(req.params);
}
