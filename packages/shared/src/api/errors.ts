import type { ApiErrorBody, ApiErrorCode, ValidationIssue } from '../types.js';

/** Error codes produced by the API plus the ones the client produces itself. */
export type ClientErrorCode = ApiErrorCode | 'NETWORK_ERROR' | 'TIMEOUT';

export class ApiError extends Error {
  /** HTTP status code, `0` when the request never got a response. */
  readonly status: number;
  readonly code: ClientErrorCode;
  readonly details: ValidationIssue[];

  constructor(
    status: number,
    code: ClientErrorCode,
    message: string,
    details: ValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

export function isApiErrorBody(payload: unknown): payload is ApiErrorBody {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) return false;
  const { error } = payload;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/** Human-readable message for showing an error in the UI. */
export function getErrorMessage(error: unknown, fallback = DEFAULT_ERROR_MESSAGE): string {
  if (!isApiError(error)) return fallback;
  // A field-level message ("Text must not be empty") is more helpful than the generic summary.
  return error.details[0]?.message ?? error.message;
}
