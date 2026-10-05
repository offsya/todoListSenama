import { useTodoTextEditor } from '@todo/client';
import { TODO_TEXT_MAX_LENGTH, type Todo } from '@todo/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { PencilIcon, TrashIcon } from '../../components/icons';
import { NEW_TODO_INPUT_ID } from './NewTodoForm';
import styles from './TodoItem.module.css';

interface TodoItemProps {
  todo: Todo;
  /** Toggling the status takes the item out of the current filter. */
  leavesViewOnToggle?: boolean;
  onToggle: (completed: boolean) => void;
  onRename: (text: string) => void;
  onDelete: () => void;
}

export function TodoItem({
  todo,
  leavesViewOnToggle = false,
  onToggle,
  onRename,
  onDelete,
}: TodoItemProps) {
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
          <span className={styles.text} onDoubleClick={() => setIsEditing(true)}>
            {todo.text}
          </span>
          <div className={styles.actions}>
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
