import { createQueryClient } from '@todo/client';

/** The app's single query cache (exported so tests can reset it between cases). */
export const queryClient = createQueryClient();
