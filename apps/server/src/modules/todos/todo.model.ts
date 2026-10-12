import { TODO_TEXT_MAX_LENGTH, type Todo } from '@todo/shared';
import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const attachmentSchema = new Schema(
  {
    /** Object key in the file storage (S3). Never a URL: files are only served through the API. */
    key: { type: String, required: true },
    /** Original file name, for the download. */
    name: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false },
);

const todoSchema = new Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: TODO_TEXT_MAX_LENGTH },
    completed: { type: Boolean, required: true, default: false },
    dueDate: { type: Date, default: null },
    attachment: { type: attachmentSchema, default: null },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

// Serves the "todos of a user, newest first" query: equality on owner + sort without a scan.
todoSchema.index({ owner: 1, createdAt: -1, _id: -1 });

export type TodoRecord = InferSchemaType<typeof todoSchema> & { _id: Types.ObjectId };

export const TodoModel = model('Todo', todoSchema);

/**
 * Maps a database record to the public API representation: the owner is implied by the token,
 * and the storage key of the attachment stays on the server.
 */
export function toTodoDto(todo: TodoRecord): Todo {
  return {
    id: todo._id.toString(),
    text: todo.text,
    completed: todo.completed,
    dueDate: todo.dueDate?.toISOString() ?? null,
    attachment: todo.attachment
      ? {
          name: todo.attachment.name,
          size: todo.attachment.size,
          contentType: todo.attachment.contentType,
        }
      : null,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
  };
}
