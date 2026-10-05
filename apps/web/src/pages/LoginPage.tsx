import { zodResolver } from '@hookform/resolvers/zod';
import { useSignIn } from '@todo/client';
import { getErrorMessage, loginSchema } from '@todo/shared';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import styles from './AuthPage.module.css';

export function LoginPage() {
  // No navigation here: the GuestOnly guard redirects as soon as the session appears.
  const login = useSignIn();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  return (
    <>
      <title>Sign in · Todo</title>
      <h1 className={styles.title}>Welcome back</h1>
      <p className={styles.subtitle}>Sign in to see your todos.</p>

      <form
        className={styles.form}
        onSubmit={handleSubmit((values) => login.mutate(values))}
        noValidate
      >
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        {login.isError && <Alert>{getErrorMessage(login.error)}</Alert>}
        <Button type="submit" className={styles.submit} loading={login.isPending}>
          Sign in
        </Button>
      </form>

      <p className={styles.footer}>
        No account yet? <Link to="/register">Create one</Link>
      </p>
    </>
  );
}
