import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '@todo/shared';

const MAX_RETRIES = 2;

/** 4xx responses (unauthorized, not found, validation) will not fix themselves on retry. */
const isClientError = (error: unknown) =>
  isApiError(error) && error.status >= 400 && error.status < 500;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => failureCount < MAX_RETRIES && !isClientError(error),
      },
      mutations: {
        retry: false,
      },
    },
  });
}
