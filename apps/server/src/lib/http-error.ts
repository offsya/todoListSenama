import type { ApiErrorCode, ValidationIssue } from '@todo/shared';

/** An error that is safe to expose to API clients as is. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: ValidationIssue[] | undefined;

  constructor(status: number, code: ApiErrorCode, message: string, details?: ValidationIssue[]) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string): HttpError {
    return new HttpError(400, 'BAD_REQUEST', message);
  }

  static unauthorized(message: string): HttpError {
    return new HttpError(401, 'UNAUTHORIZED', message);
  }

  static notFound(message = 'Resource not found'): HttpError {
    return new HttpError(404, 'NOT_FOUND', message);
  }

  static conflict(message: string): HttpError {
    return new HttpError(409, 'CONFLICT', message);
  }

  static tooManyRequests(message: string): HttpError {
    return new HttpError(429, 'TOO_MANY_REQUESTS', message);
  }
}
