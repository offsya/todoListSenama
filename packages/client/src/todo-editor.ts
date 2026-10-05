import { todoTextSchema } from '@todo/shared';
import { useRef, useState } from 'react';

interface TodoTextEditorOptions {
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}

/**
 * State of an inline todo editor, shared by the web and mobile UIs. Saving validates with the
 * same schema as the API. The editor finishes exactly once: confirming usually unmounts the
 * input, which can fire a trailing blur event.
 */
export function useTodoTextEditor({ initialText, onSave, onCancel }: TodoTextEditorOptions) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string>();
  const finished = useRef(false);

  const finish = (action: () => void) => {
    if (finished.current) return;
    finished.current = true;
    action();
  };

  // Arrow functions: the handlers are passed to inputs unbound (`onBlur={editor.blur}`).
  return {
    text,
    error,
    changeText: (value: string) => {
      setText(value);
      setError(undefined);
    },
    /** Enter / "Done": save, or explain why the text cannot be saved. */
    submit: () => {
      const result = todoTextSchema.safeParse(text);
      if (result.success) finish(() => onSave(result.data));
      else setError(result.error.issues[0]?.message);
    },
    /** Focus left the field: save a valid value, silently drop an invalid edit. */
    blur: () => {
      const result = todoTextSchema.safeParse(text);
      finish(result.success ? () => onSave(result.data) : onCancel);
    },
    cancel: () => finish(onCancel),
  };
}
