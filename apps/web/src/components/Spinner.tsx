import styles from './Spinner.module.css';

interface SpinnerProps {
  size?: number;
  /** Accessible label; omit for decorative spinners inside labelled controls. */
  label?: string;
}

export function Spinner({ size = 20, label }: SpinnerProps) {
  return (
    <span
      className={styles.spinner}
      style={{ width: size, height: size }}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
