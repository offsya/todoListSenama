import type { ReactNode } from 'react';
import styles from './Alert.module.css';

interface AlertProps {
  children: ReactNode;
  action?: ReactNode;
}

/** Inline error message, announced by screen readers when it appears. */
export function Alert({ children, action }: AlertProps) {
  return (
    <div role="alert" className={styles.alert}>
      <span>{children}</span>
      {action}
    </div>
  );
}
