import { ApiError, ATTACHMENT_FIELD, MAX_ATTACHMENT_SIZE, type Todo } from '@todo/shared';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api } from './api';
import { sessionStore } from './session';

const tooLarge = (name: string) =>
  new ApiError(413, 'PAYLOAD_TOO_LARGE', `"${name}" is larger than 5 MB.`);

/**
 * Lets the user pick a file and returns the form to upload it with, or `null` when the picker
 * was cancelled.
 */
export async function pickAttachment(): Promise<FormData | null> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  if (asset.size !== undefined && asset.size > MAX_ATTACHMENT_SIZE) throw tooLarge(asset.name);

  const form = new FormData();
  // React Native's fetch streams the file from its URI.
  form.append(ATTACHMENT_FIELD, {
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType ?? 'application/octet-stream',
  } as unknown as Blob);
  return form;
}

/**
 * Downloads the attachment with the access token into the app's cache, then opens the system
 * share sheet, from which the user can open or save it. The file never has a public link.
 */
export async function openAttachment(todo: Todo): Promise<void> {
  if (!todo.attachment) return;
  const token = sessionStore.getToken();
  const directory = new Directory(Paths.cache, 'attachments', todo.id);
  directory.create({ intermediates: true, idempotent: true });

  let file: File;
  try {
    file = await File.downloadFileAsync(
      api.todos.attachmentUrl(todo.id),
      new File(directory, todo.attachment.name),
      { headers: token ? { Authorization: `Bearer ${token}` } : {}, idempotent: true },
    );
  } catch (error) {
    // The error message carries the HTTP status: an expired token signs the user out, like
    // every other request does.
    const status = /status:? ?(\d{3})/.exec(String(error))?.[1];
    if (status === '401' && token) sessionStore.invalidate(token);
    throw new ApiError(
      Number(status ?? 0),
      status === '404' ? 'NOT_FOUND' : 'NETWORK_ERROR',
      status === '404' ? 'The file is no longer there.' : 'Could not download the file.',
    );
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: todo.attachment.contentType,
    dialogTitle: todo.attachment.name,
  });
}
