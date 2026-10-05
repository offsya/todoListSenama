import { zodResolver } from '@hookform/resolvers/zod';
import { useSignUp } from '@todo/client';
import { getErrorMessage, PASSWORD_MIN_LENGTH, registerSchema } from '@todo/shared';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import styles from './AuthPage.module.css';

// Password confirmation is a UI concern, so it extends the shared API schema here.
const registerFormSchema = registerSchema
  .extend({ confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, {
    error: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export function RegisterPage() {
  const registration = useSignUp();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  return (
    <>
      <title>Create account · Todo</title>
      <h1 className={styles.title}>Create an account</h1>
      <p className={styles.subtitle}>Your todos stay private to you.</p>

      <form
        className={styles.form}
        // The API rejects unknown fields, so send only what it expects.
        onSubmit={handleSubmit(({ email, password }) => registration.mutate({ email, password }))}
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
          autoComplete="new-password"
          placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        {registration.isError && <Alert>{getErrorMessage(registration.error)}</Alert>}
        <Button type="submit" className={styles.submit} loading={registration.isPending}>
          Create account
        </Button>
      </form>

      <p className={styles.footer}>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </>
  );
}
