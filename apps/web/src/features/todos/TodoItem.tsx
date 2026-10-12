import { formatDueDate, isOverdue, useTodoTextEditor } from '@todo/client';
import { TODO_TEXT_MAX_LENGTH, type Todo, type TodoAttachment } from '@todo/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { DownloadIcon, PaperclipIcon, PencilIcon, TrashIcon } from '../../components/icons';
import { NEW_TODO_INPUT_ID } from './NewTodoForm';
import styles from './TodoItem.module.css';

interface TodoItemProps {
  todo: Todo;
  /** Toggling the status takes the item out of the current filter. */
  leavesViewOnToggle?: boolean;
  onToggle: (completed: boolean) => void;
  onRename: (text: string) => void;
  onDelete: () => void;
  onAttach: (file: File) => void;
  onDownload: () => void;
  /** The file is being uploaded. */
  attaching?: boolean;
}

export function TodoItem({
  todo,
  leavesViewOnToggle = false,
  onToggle,
  onRename,
  onDelete,
  onAttach,
  onDownload,
  attaching = false,
}: TodoItemProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const itemRef = useRef<HTMLLIElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  // Enter/Escape remove the focused input: give focus back to the Edit button, so keyboard users
  // stay in place. A click elsewhere has already moved the focus, keep it there.
  useEffect(() => {
    if (isEditing) {
      wasEditing.current = true;
      return;
    }
    if (wasEditing.current && document.activeElement === document.body) {
      editButtonRef.current?.focus();
    }
    wasEditing.current = false;
  }, [isEditing]);

  const finishEditing = (text?: string) => {
    setIsEditing(false);
    if (text !== undefined && text !== todo.text) onRename(text);
  };

  // The item is about to disappear (optimistic updates are immediate): move focus to a
  // neighbour, or keyboard and screen reader users would be sent back to the top of the page.
  const focusNeighbour = () => {
    const neighbour =
      itemRef.current?.nextElementSibling ?? itemRef.current?.previousElementSibling;
    const nextFocus =
      neighbour?.querySelector<HTMLElement>('input[type="checkbox"]') ??
      document.getElementById(NEW_TODO_INPUT_ID);
    nextFocus?.focus();
  };

  const handleToggle = (completed: boolean) => {
    if (leavesViewOnToggle) focusNeighbour();
    onToggle(completed);
  };

  const handleDelete = () => {
    focusNeighbour();
    onDelete();
  };

  return (
    <li ref={itemRef} className={styles.item} data-completed={todo.completed || undefined}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={todo.completed}
        onChange={(event) => handleToggle(event.target.checked)}
        aria-label={todo.text}
      />

      {isEditing ? (
        <TodoTextEditor
          initialText={todo.text}
          onSave={finishEditing}
          onCancel={() => finishEditing()}
        />
      ) : (
        <>
          <div className={styles.body}>
            <span className={styles.text} onDoubleClick={() => setIsEditing(true)}>
              {todo.text}
            </span>
            {todo.dueDate && <DueDate dueDate={todo.dueDate} overdue={isOverdue(todo)} />}
            {todo.attachment && (
              <AttachmentLink attachment={todo.attachment} onDownload={onDownload} />
            )}
          </div>
          <div className={styles.actions}>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Reset, so picking the same file again still fires a change.
                event.target.value = '';
                if (file) onAttach(file);
              }}
            />
            <Button
              variant="icon"
              aria-label={`${todo.attachment ? 'Replace the file of' : 'Attach a file to'} "${todo.text}"`}
              title={todo.attachment ? 'Replace file' : 'Attach file'}
              loading={attaching}
              onClick={() => fileInputRef.current?.click()}
            >
              {!attaching && <PaperclipIcon />}
            </Button>
            <Button
              ref={editButtonRef}
              variant="icon"
              aria-label={`Edit "${todo.text}"`}
              onClick={() => setIsEditing(true)}
            >
              <PencilIcon />
            </Button>
            <Button variant="icon" aria-label={`Delete "${todo.text}"`} onClick={handleDelete}>
              <TrashIcon />
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

function AttachmentLink({
  attachment,
  onDownload,
}: {
  attachment: TodoAttachment;
  onDownload: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.attachment}
      onClick={onDownload}
      title={`Download ${attachment.name}`}
    >
      <DownloadIcon width={14} height={14} />
      <span className={styles.attachmentName}>{attachment.name}</span>
      <span className={styles.attachmentSize}>{formatSize(attachment.size)}</span>
    </button>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DueDate({ dueDate, overdue }: { dueDate: string; overdue: boolean }) {
  return (
    <span className={styles.due} data-overdue={overdue || undefined}>
      {overdue ? 'Overdue · ' : 'Due '}
      <time dateTime={dueDate} title={new Date(dueDate).toLocaleString()}>
        {formatDueDate(dueDate)}
      </time>
    </span>
  );
}

interface TodoTextEditorProps {
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}

/** Enter saves, Escape cancels, leaving the field saves a valid value (like TodoMVC). */
function TodoTextEditor(props: TodoTextEditorProps) {
  const editor = useTodoTextEditor(props);
  const errorId = useId();

  return (
    <div className={styles.editor}>
      <input
        className={styles.editInput}
        value={editor.text}
        onChange={(event) => editor.changeText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== 'Escape') return;
          // Focus moves to the Edit button right away; without this the rest of the same
          // keystroke (keypress) would "click" it and reopen the editor.
          event.preventDefault();
          if (event.key === 'Enter') editor.submit();
          else editor.cancel();
        }}
        onBlur={editor.blur}
        aria-label="Edit todo"
        aria-invalid={editor.error ? true : undefined}
        aria-describedby={editor.error ? errorId : undefined}
        maxLength={TODO_TEXT_MAX_LENGTH}
        autoFocus
      />
      {editor.error && (
        <p id={errorId} className={styles.error} role="alert">
          {editor.error}
        </p>
      )}
    </div>
  );
}
