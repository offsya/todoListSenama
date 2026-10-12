import type {
  CreateTodoInput,
  ListTodosQuery,
  Todo,
  TodoFilter,
  TodoPage,
  UpdateTodoInput,
} from '@todo/shared';
import { trusted, type QueryFilter } from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { FileStorage } from '../../lib/file-storage.js';
import { HttpError } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import { TodoModel, toTodoDto } from './todo.model.js';

/**
 * Upper bound for one user's list. Pages are read with skip/limit, which gets slower the further
 * the page; the cap keeps the last page cheap.
 */
export const MAX_TODOS_PER_USER = 1000;

// Every query is scoped by owner. Someone else's todo is reported as "not found" rather than
// "forbidden", so other users' todo ids cannot be probed.
const todoNotFound = () => HttpError.notFound('Todo not found');

type TodoQuery = QueryFilter<InstanceType<typeof TodoModel>>;

/**
 * Conditions of each filter. Operators go through `trusted()`: the connection sanitizes filters,
 * which would otherwise turn `{ $lt: now }` into an equality check.
 */
function filterConditions(filter: TodoFilter, now: Date): TodoQuery {
  switch (filter) {
    case 'all':
      return {};
    case 'done':
      return { completed: true };
    case 'active':
      // `null` also matches todos without the field.
      return {
        completed: false,
        $or: [{ dueDate: null }, { dueDate: trusted({ $gte: now }) }],
      };
    case 'overdue':
      return { completed: false, dueDate: trusted({ $lt: now }) };
  }
}

export async function listTodos(
  ownerId: string,
  { filter, page, limit }: ListTodosQuery,
): Promise<TodoPage> {
  const query: TodoQuery = { owner: ownerId, ...filterConditions(filter, new Date()) };
  const [todos, total] = await Promise.all([
    TodoModel.find(query)
      // _id breaks ties between todos created within the same millisecond.
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    TodoModel.countDocuments(query),
  ]);
  return {
    items: todos.map(toTodoDto),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getTodo(ownerId: string, id: string): Promise<Todo> {
  const todo = await TodoModel.findOne({ _id: id, owner: ownerId }).lean();
  if (!todo) throw todoNotFound();
  return toTodoDto(todo);
}

export async function createTodo(ownerId: string, input: CreateTodoInput): Promise<Todo> {
  // Not atomic: parallel requests can overshoot the limit slightly. The per-user rate limit
  // bounds that, and an exact count is not worth a counter to keep in sync.
  const count = await TodoModel.countDocuments({ owner: ownerId });
  if (count >= MAX_TODOS_PER_USER) {
    throw HttpError.conflict(
      `You can have at most ${MAX_TODOS_PER_USER} todos. Delete some to add new ones.`,
    );
  }

  const todo = await TodoModel.create({ ...input, owner: ownerId });
  return toTodoDto(todo);
}

export async function updateTodo(
  ownerId: string,
  id: string,
  input: UpdateTodoInput,
): Promise<Todo> {
  const todo = await TodoModel.findOneAndUpdate(
    { _id: id, owner: ownerId },
    { $set: input },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!todo) throw todoNotFound();
  return toTodoDto(todo);
}

export async function deleteTodo(
  ownerId: string,
  id: string,
  storage: FileStorage | null,
): Promise<void> {
  const todo = await TodoModel.findOneAndDelete({ _id: id, owner: ownerId }).lean();
  if (!todo) throw todoNotFound();
  if (todo.attachment) await removeStoredFile(storage, todo.attachment.key);
}

// ---- Attachments -----------------------------------------------------------------------------

export interface UploadedFile {
  name: string;
  contentType: string;
  buffer: Buffer;
}

export interface AttachmentDownload {
  name: string;
  contentType: string;
  size: number;
  body: Readable;
}

/** A file left behind is only wasted space: log it instead of failing the request. */
async function removeStoredFile(storage: FileStorage | null, key: string): Promise<void> {
  try {
    await storage?.delete(key);
  } catch (error) {
    logger.error({ err: error, key }, 'Failed to delete an attachment from the file storage');
  }
}

/** Throws 404 unless the todo exists and belongs to the user, before the upload is stored. */
export async function assertTodoExists(ownerId: string, id: string): Promise<void> {
  if (!(await TodoModel.exists({ _id: id, owner: ownerId }))) throw todoNotFound();
}

/** Stores the file and attaches it to the todo, replacing the previous attachment. */
export async function attachFile(
  ownerId: string,
  id: string,
  file: UploadedFile,
  storage: FileStorage,
): Promise<Todo> {
  // A fresh key per upload: a replaced file is never overwritten in place, so a download that
  // is still streaming the old one is not cut off halfway.
  const key = `attachments/${ownerId}/${id}/${randomUUID()}`;
  await storage.put(key, file.buffer, file.contentType);

  const attachment = {
    key,
    name: file.name,
    contentType: file.contentType,
    size: file.buffer.length,
  };
  const previous = await TodoModel.findOneAndUpdate(
    { _id: id, owner: ownerId },
    { $set: { attachment } },
    { returnDocument: 'before' },
  ).lean();
  if (!previous) {
    // The todo was deleted while the file was uploading.
    await removeStoredFile(storage, key);
    throw todoNotFound();
  }
  if (previous.attachment) await removeStoredFile(storage, previous.attachment.key);
  return getTodo(ownerId, id);
}

export async function getAttachment(
  ownerId: string,
  id: string,
  storage: FileStorage,
): Promise<AttachmentDownload> {
  const todo = await TodoModel.findOne({ _id: id, owner: ownerId }).lean();
  if (!todo) throw todoNotFound();
  if (!todo.attachment) throw HttpError.notFound('This todo has no attachment');
  const { key, name, contentType, size } = todo.attachment;
  return { name, contentType, size, body: await storage.get(key) };
}
