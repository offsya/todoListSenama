import { ApiError, ATTACHMENT_FIELD, MAX_ATTACHMENT_SIZE, type Todo } from '@todo/shared';
import * as DocumentPicker from 'expo-document-picker';
import { api } from './api';

/** Web build: the picker returns a browser File, which goes into the form as is. */
export async function pickAttachment(): Promise<FormData | null> {
  const result = await DocumentPicker.getDocumentAsync();
  const file = result.canceled ? undefined : result.assets[0]?.file;
  if (!file) return null;
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `"${file.name}" is larger than 5 MB.`);
  }

  const form = new FormData();
  form.append(ATTACHMENT_FIELD, file);
  return form;
}

/** Fetches the file with the token and saves it from memory, like the web app. */
export async function openAttachment(todo: Todo): Promise<void> {
  if (!todo.attachment) return;
  const blob = await api.todos.downloadAttachment(todo.id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = todo.attachment.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
