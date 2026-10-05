import { useTodoTextEditor } from '@todo/client';
import { TODO_TEXT_MAX_LENGTH, type Todo } from '@todo/shared';
import { useId, useState } from 'react';
import { Button } from '../../components/Button';
import { PencilIcon, TrashIcon } from '../../components/icons';
import styles from './TodoItem.module.css';

interface TodoItemProps {
  todo: Todo;
  onToggle: (completed: boolean) => void;
  onRename: (text: string) => void;
  onDelete: () => void;
}

export function TodoItem({ todo, onToggle, onRename, onDelete }: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const textId = useId();

  const finishEditing = (text?: string) => {
    setIsEditing(false);
    if (text !== undefined && text !== todo.text) onRename(text);
  };

  return (
    <li className={styles.item} data-completed={todo.completed || undefined}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={todo.completed}
        onChange={(event) => onToggle(event.target.checked)}
        aria-labelledby={textId}
      />

      {isEditing ? (
        <TodoTextEditor
          initialText={todo.text}
          onSave={finishEditing}
          onCancel={() => finishEditing()}
        />
      ) : (
        <>
          <span id={textId} className={styles.text} onDoubleClick={() => setIsEditing(true)}>
            {todo.text}
          </span>
          <div className={styles.actions}>
            <Button
              variant="icon"
              aria-label={`Edit "${todo.text}"`}
              onClick={() => setIsEditing(true)}
            >
              <PencilIcon />
            </Button>
            <Button variant="icon" aria-label={`Delete "${todo.text}"`} onClick={onDelete}>
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
          if (event.key === 'Enter') editor.submit();
          if (event.key === 'Escape') editor.cancel();
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
