import {
  ATTACHMENT_FIELD,
  createTodoSchema,
  listTodosQuerySchema,
  MAX_ATTACHMENT_SIZE,
  updateTodoSchema,
} from '@todo/shared';
import type { Request, Response } from 'express';
import multer from 'multer';
import { basename } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FileStorage } from '../../lib/file-storage.js';
import { HttpError } from '../../lib/http-error.js';
import { idParamsSchema, parseBody, parseParams, parseQuery } from '../../lib/validation.js';
import { getUserId } from '../../middleware/auth.js';
import * as todosService from './todos.service.js';

const MAX_ATTACHMENT_SIZE_MB = MAX_ATTACHMENT_SIZE / 1024 / 1024;

const parseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE, files: 1, fields: 0 },
  // Browsers send non-ASCII file names as raw UTF-8.
  defParamCharset: 'utf8',
}).single(ATTACHMENT_FIELD);

/** Reads the multipart body; multer's errors become 4xx responses instead of a 500. */
function receiveFile(req: Request, res: Response): Promise<Express.Multer.File> {
  return new Promise((resolve, reject) => {
    parseUpload(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        reject(
          error.code === 'LIMIT_FILE_SIZE'
            ? new HttpError(
                413,
                'PAYLOAD_TOO_LARGE',
                `The file is larger than ${MAX_ATTACHMENT_SIZE_MB} MB`,
              )
            : HttpError.badRequest(
                `Send one file in the "${ATTACHMENT_FIELD}" field of a multipart/form-data body`,
              ),
        );
      } else if (error) {
        // Malformed multipart bodies come from busboy as plain errors.
        reject(HttpError.badRequest('Malformed multipart/form-data body'));
      } else if (!req.file) {
        reject(
          HttpError.badRequest(
            `Send one file in the "${ATTACHMENT_FIELD}" field of a multipart/form-data body`,
          ),
        );
      } else {
        resolve(req.file);
      }
    });
  });
}

/** Keeps only the last path segment and drops control characters; never empty. */
function cleanFileName(name: string): string {
  const cleaned = basename(name.replaceAll('\\', '/'))
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    .slice(0, 255);
  return cleaned || 'file';
}

const CONTENT_TYPE = /^[\w.+-]+\/[\w.+-]+$/;

export interface TodosControllerOptions {
  /** `null` when no file storage is configured: the attachment routes then answer 503. */
  storage: FileStorage | null;
}

export function createTodosController({ storage }: TodosControllerOptions) {
  const requireStorage = (): FileStorage => {
    if (!storage) throw HttpError.serviceUnavailable('File storage is not configured');
    return storage;
  };

  return {
    list: async (req: Request, res: Response): Promise<void> => {
      const query = parseQuery(listTodosQuerySchema, req);
      res.json(await todosService.listTodos(getUserId(req), query));
    },

    getById: async (req: Request, res: Response): Promise<void> => {
      const { id } = parseParams(idParamsSchema, req);
      res.json(await todosService.getTodo(getUserId(req), id));
    },

    create: async (req: Request, res: Response): Promise<void> => {
      const input = parseBody(createTodoSchema, req);
      res.status(201).json(await todosService.createTodo(getUserId(req), input));
    },

    update: async (req: Request, res: Response): Promise<void> => {
      const { id } = parseParams(idParamsSchema, req);
      const input = parseBody(updateTodoSchema, req);
      res.json(await todosService.updateTodo(getUserId(req), id, input));
    },

    remove: async (req: Request, res: Response): Promise<void> => {
      const { id } = parseParams(idParamsSchema, req);
      await todosService.deleteTodo(getUserId(req), id, storage);
      res.status(204).end();
    },

    uploadAttachment: async (req: Request, res: Response): Promise<void> => {
      const { id } = parseParams(idParamsSchema, req);
      const files = requireStorage();
      const userId = getUserId(req);
      // Check the owner before reading up to 5 MB of someone else's upload.
      await todosService.assertTodoExists(userId, id);

      const file = await receiveFile(req, res);
      const todo = await todosService.attachFile(
        userId,
        id,
        {
          name: cleanFileName(file.originalname),
          contentType: CONTENT_TYPE.test(file.mimetype)
            ? file.mimetype
            : 'application/octet-stream',
          buffer: file.buffer,
        },
        files,
      );
      res.json(todo);
    },

    downloadAttachment: async (req: Request, res: Response): Promise<void> => {
      const { id } = parseParams(idParamsSchema, req);
      const file = await todosService.getAttachment(getUserId(req), id, requireStorage());

      // Always a download, never rendered inline: an uploaded HTML file must not run as a page.
      res.attachment(file.name);
      res.type(file.contentType);
      res.set({ 'Content-Length': String(file.size), 'Cache-Control': 'private, no-store' });
      // On a failure halfway through, pipeline destroys the response and the client sees a
      // broken download rather than a truncated "complete" file.
      await pipeline(file.body, res);
    },
  };
}
