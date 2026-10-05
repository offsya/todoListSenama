import type { ApiErrorBody } from '@todo/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { STATUS_CODES } from 'node:http';
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

  // Express and body-parser report bad requests (malformed JSON, broken gzip, an invalid
  // percent-encoding in the URL, an unsupported encoding...) as errors with a 4xx status.
  const status = getClientErrorStatus(err);
  if (status !== undefined) {
    if (status === 413) return new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    if (hasType(err, 'entity.parse.failed')) {
      return HttpError.badRequest('Request body is not valid JSON');
    }
    // Generic text: the original messages can echo raw request data.
    return new HttpError(status, 'BAD_REQUEST', STATUS_CODES[status] ?? 'Bad Request');
  }

  // Anything else is a bug: hide the details from the client, they are in the logs.
  return new HttpError(500, 'INTERNAL_ERROR', 'Internal server error');
}

function getClientErrorStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const status = 'status' in err ? err.status : 'statusCode' in err ? err.statusCode : undefined;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

function hasType(err: unknown, type: string): boolean {
  return typeof err === 'object' && err !== null && 'type' in err && err.type === type;
}
