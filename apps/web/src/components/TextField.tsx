import { useId, type ComponentProps } from 'react';
import styles from './TextField.module.css';

interface TextFieldProps extends ComponentProps<'input'> {
  label: string;
  error?: string;
}

/** Labelled input with an accessible error message. Accepts `ref` (React 19), so it works with react-hook-form's `register`. */
export function TextField({ label, error, id, className, ...inputProps }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
