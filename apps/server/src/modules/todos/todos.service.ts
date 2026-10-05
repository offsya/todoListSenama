import type { CreateTodoInput, Todo, UpdateTodoInput } from '@todo/shared';
import { HttpError } from '../../lib/http-error.js';
import { TodoModel, toTodoDto } from './todo.model.js';

const todoNotFound = () => HttpError.notFound('Todo not found');

export async function listTodos(): Promise<Todo[]> {
  // _id breaks ties between todos created within the same millisecond.
  const todos = await TodoModel.find().sort({ createdAt: -1, _id: -1 }).lean();
  return todos.map(toTodoDto);
}

export async function getTodo(id: string): Promise<Todo> {
  const todo = await TodoModel.findById(id).lean();
  if (!todo) throw todoNotFound();
  return toTodoDto(todo);
}

export async function createTodo(input: CreateTodoInput): Promise<Todo> {
  const todo = await TodoModel.create(input);
  return toTodoDto(todo);
}

export async function updateTodo(id: string, input: UpdateTodoInput): Promise<Todo> {
  const todo = await TodoModel.findByIdAndUpdate(
    id,
    { $set: input },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!todo) throw todoNotFound();
  return toTodoDto(todo);
}

export async function deleteTodo(id: string): Promise<void> {
  const { deletedCount } = await TodoModel.deleteOne({ _id: id });
  if (deletedCount === 0) throw todoNotFound();
}
