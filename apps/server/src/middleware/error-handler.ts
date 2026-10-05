import type { ApiErrorBody } from '@todo/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(HttpError.notFound(`Route ${req.method} ${req.path} not found`));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const error = toHttpError(err);

  if (error.status >= 500) {
    logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
  }
  if (error.status === 401) {
    res.set('WWW-Authenticate', 'Bearer');
  }

  const body: ApiErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
    },
  };
  res.status(error.status).json(body);
};

function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    return new HttpError(400, 'VALIDATION_ERROR', 'Validation failed', details);
  }

  if (isBodyParserError(err)) {
    if (err.type === 'entity.too.large') {
      return new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    }
    if (err.type === 'entity.parse.failed') {
      return HttpError.badRequest('Request body is not valid JSON');
    }
    return HttpError.badRequest(err.message);
  }

  // Anything else is a bug: hide the details from the client, they are in the logs.
  return new HttpError(500, 'INTERNAL_ERROR', 'Internal server error');
}

/** Errors thrown by `express.json()` (body-parser) carry a `type` and a 4xx `status`. */
function isBodyParserError(err: unknown): err is Error & { type: string; status: number } {
  return (
    err instanceof Error &&
    'type' in err &&
    typeof err.type === 'string' &&
    'status' in err &&
    typeof err.status === 'number' &&
    err.status >= 400 &&
    err.status < 500
  );
}
