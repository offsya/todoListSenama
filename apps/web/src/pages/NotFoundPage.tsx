import { Link } from 'react-router';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  return (
    <main className={styles.page}>
      <title>Page not found · Todo</title>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>Page not found</h1>
      <Link to="/">Back to my todos</Link>
    </main>
  );
}
