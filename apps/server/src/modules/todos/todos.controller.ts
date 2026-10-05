import { createTodoSchema, updateTodoSchema } from '@todo/shared';
import type { Request, Response } from 'express';
import { idParamsSchema, parseBody, parseParams } from '../../lib/validation.js';
import { getUserId } from '../../middleware/auth.js';
import * as todosService from './todos.service.js';

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await todosService.listTodos(getUserId(req)));
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = parseParams(idParamsSchema, req);
  res.json(await todosService.getTodo(getUserId(req), id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = parseBody(createTodoSchema, req);
  res.status(201).json(await todosService.createTodo(getUserId(req), input));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = parseParams(idParamsSchema, req);
  const input = parseBody(updateTodoSchema, req);
  res.json(await todosService.updateTodo(getUserId(req), id, input));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = parseParams(idParamsSchema, req);
  await todosService.deleteTodo(getUserId(req), id);
  res.status(204).end();
}
