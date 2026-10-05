import { TODO_TEXT_MAX_LENGTH, type Todo } from '@todo/shared';
import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const todoSchema = new Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: TODO_TEXT_MAX_LENGTH },
    completed: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

type TodoRecord = InferSchemaType<typeof todoSchema> & { _id: Types.ObjectId };

export const TodoModel = model('Todo', todoSchema);

/** Maps a database record to the public API representation. */
export function toTodoDto(todo: TodoRecord): Todo {
  return {
    id: todo._id.toString(),
    text: todo.text,
    completed: todo.completed,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
  };
}
