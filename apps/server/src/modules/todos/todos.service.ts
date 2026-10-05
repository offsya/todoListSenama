import type { CreateTodoInput, Todo, UpdateTodoInput } from '@todo/shared';
import { HttpError } from '../../lib/http-error.js';
import { TodoModel, toTodoDto } from './todo.model.js';

// Every query is scoped by owner. Someone else's todo is reported as "not found" rather than
// "forbidden", so other users' todo ids cannot be probed.
const todoNotFound = () => HttpError.notFound('Todo not found');

export async function listTodos(ownerId: string): Promise<Todo[]> {
  // _id breaks ties between todos created within the same millisecond.
  const todos = await TodoModel.find({ owner: ownerId }).sort({ createdAt: -1, _id: -1 }).lean();
  return todos.map(toTodoDto);
}

export async function getTodo(ownerId: string, id: string): Promise<Todo> {
  const todo = await TodoModel.findOne({ _id: id, owner: ownerId }).lean();
  if (!todo) throw todoNotFound();
  return toTodoDto(todo);
}

export async function createTodo(ownerId: string, input: CreateTodoInput): Promise<Todo> {
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
