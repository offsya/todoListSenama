import { useSession, useSignOut } from '@todo/client';
import { Outlet } from 'react-router';
import styles from './AppLayout.module.css';
import { Button } from './Button';
import { LogoutIcon } from './icons';
import { Logo } from './Logo';

/** Shell for signed-in pages: header with the current user and sign-out. */
export function AppLayout() {
  const session = useSession();
  const signOut = useSignOut();

  return (
    <>
      <header className={styles.header}>
        <div className={styles.inner}>
          <Logo />
          <div className={styles.account}>
            <span className={styles.email}>{session?.user.email}</span>
            <Button variant="ghost" onClick={signOut}>
              <LogoutIcon />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </>
  );
}
