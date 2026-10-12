import type {
  CreateTodoInput,
  ListTodosQuery,
  Todo,
  TodoFilter,
  TodoPage,
  UpdateTodoInput,
} from '@todo/shared';
import { trusted, type QueryFilter } from 'mongoose';
import { HttpError } from '../../lib/http-error.js';
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

export async function deleteTodo(ownerId: string, id: string): Promise<void> {
  const { deletedCount } = await TodoModel.deleteOne({ _id: id, owner: ownerId });
  if (deletedCount === 0) throw todoNotFound();
}
