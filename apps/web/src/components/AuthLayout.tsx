import { Outlet } from 'react-router';
import styles from './AuthLayout.module.css';
import { Logo } from './Logo';

/** Centered card for the login and registration pages. */
export function AuthLayout() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <Logo />
        </div>
        <Outlet />
      </div>
    </main>
  );
}
