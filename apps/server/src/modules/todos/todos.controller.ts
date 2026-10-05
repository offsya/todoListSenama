import { createTodoSchema, updateTodoSchema } from '@todo/shared';
import type { Request, Response } from 'express';
import { idParamsSchema, parseBody, parseParams } from '../../lib/validation.js';
import * as todosService from './todos.service.js';

export async function list(_req: Request, res: Response): Promise<void> {
  res.json(await todosService.listTodos());
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = parseParams(idParamsSchema, req);
  res.json(await todosService.getTodo(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = parseBody(createTodoSchema, req);
  res.status(201).json(await todosService.createTodo(input));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = parseParams(idParamsSchema, req);
  const input = parseBody(updateTodoSchema, req);
  res.json(await todosService.updateTodo(id, input));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = parseParams(idParamsSchema, req);
  await todosService.deleteTodo(id);
  res.status(204).end();
}
