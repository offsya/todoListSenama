import { Router } from 'express';
import * as todosController from './todos.controller.js';

// Express 5 forwards rejected promises from async handlers to the error handler.
export const todosRouter = Router();

todosRouter.get('/', todosController.list);
todosRouter.post('/', todosController.create);
todosRouter.get('/:id', todosController.getById);
todosRouter.put('/:id', todosController.update);
todosRouter.delete('/:id', todosController.remove);
