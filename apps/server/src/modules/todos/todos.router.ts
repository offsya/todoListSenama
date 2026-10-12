import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { FileStorage } from '../../lib/file-storage.js';
import { HttpError } from '../../lib/http-error.js';
import { getUserId, requireAuth } from '../../middleware/auth.js';
import { createTodosController } from './todos.controller.js';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export interface TodosRouterOptions {
  /** Max requests per user within a minute. */
  rateLimit: number;
  /** Storage for attachments; `null` disables them (503). */
  storage: FileStorage | null;
}

// Express 5 forwards rejected promises from async handlers to the error handler.
export function createTodosRouter({ rateLimit: limit, storage }: TodosRouterOptions): Router {
  const router = Router();
  const todosController = createTodosController({ storage });

  router.use(requireAuth);
  // Counted per account, not per IP: one account cannot flood the database from many
  // addresses, and users behind the same NAT do not share a budget.
  router.use(
    rateLimit({
      windowMs: RATE_LIMIT_WINDOW_MS,
      limit,
      keyGenerator: (req) => getUserId(req),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, _res, next) =>
        next(HttpError.tooManyRequests('Too many requests. Please slow down.')),
    }),
  );

  router.get('/', todosController.list);
  router.post('/', todosController.create);
  router.get('/:id', todosController.getById);
  router.put('/:id', todosController.update);
  router.delete('/:id', todosController.remove);
  router.post('/:id/attachment', todosController.uploadAttachment);
  router.get('/:id/attachment', todosController.downloadAttachment);
  return router;
}
