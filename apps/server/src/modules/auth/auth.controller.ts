import { loginSchema, registerSchema, type CurrentUserResponse } from '@todo/shared';
import type { Request, Response } from 'express';
import { parseBody } from '../../lib/validation.js';
import { getUserId } from '../../middleware/auth.js';
import * as authService from './auth.service.js';

export async function register(req: Request, res: Response): Promise<void> {
  const input = parseBody(registerSchema, req);
  res.status(201).json(await authService.register(input));
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = parseBody(loginSchema, req);
  res.json(await authService.login(input));
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await authService.getCurrentUser(getUserId(req));
  res.json({ user } satisfies CurrentUserResponse);
}
