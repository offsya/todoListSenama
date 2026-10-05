import { CheckIcon } from './icons';
import styles from './Logo.module.css';

export function Logo() {
  return (
    <span className={styles.logo}>
      <span className={styles.mark}>
        <CheckIcon width={16} height={16} strokeWidth={3} />
      </span>
      Todo
    </span>
  );
}
