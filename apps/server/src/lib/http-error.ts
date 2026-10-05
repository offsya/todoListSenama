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

  static notFound(message = 'Resource not found'): HttpError {
    return new HttpError(404, 'NOT_FOUND', message);
  }
}
