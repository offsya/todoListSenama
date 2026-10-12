/** Public user representation returned by the API (never contains the password hash). */
export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  /** ISO-8601 timestamp after which an unfinished todo is overdue, or `null`. */
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One page of `GET /todos`. */
export interface TodoPage {
  items: Todo[];
  page: number;
  limit: number;
  /** Number of todos matching the filter, on all pages. */
  total: number;
  /** At least 1, so "page 1 of 1" holds for an empty list too. */
  totalPages: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface CurrentUserResponse {
  user: User;
}

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR';

export interface ValidationIssue {
  /** Dot-separated path to the invalid field, e.g. `email`; empty for object-level issues. */
  path: string;
  message: string;
}

/** Shape of every non-2xx response body. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ValidationIssue[];
  };
}
