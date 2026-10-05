import { zodResolver } from '@hookform/resolvers/zod';
import { useSignUp } from '@todo/client';
import { getErrorMessage, PASSWORD_MIN_LENGTH, registerSchema } from '@todo/shared';
import { Link } from 'expo-router';
import { useForm } from 'react-hook-form';
import { Text } from 'react-native';
import { z } from 'zod';
import { AuthScreen } from '../components/AuthScreen';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { FormTextField } from '../components/TextField';
import { makeStyles } from '../theme';

// Password confirmation is a UI concern, so it extends the shared API schema here.
const signUpFormSchema = registerSchema
  .extend({ confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, {
    error: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export default function SignUpScreen() {
  const styles = useStyles();
  const signUp = useSignUp();
  const { control, handleSubmit, setFocus } = useForm({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  const submit = handleSubmit(({ email, password }) => {
    // The API rejects unknown fields, so send only what it expects. The keyboard's return key
    // stays active while the request is in flight.
    if (!signUp.isPending) signUp.mutate({ email, password });
  });

  return (
    <AuthScreen
      title="Create an account"
      subtitle="Your todos stay private to you."
      hasHeader
      footer={
        <Text style={styles.footer}>
          Already have an account?{' '}
          {/* Go back to the sign-in screen below instead of stacking another one. */}
          <Link href="/sign-in" dismissTo style={styles.link}>
            Sign in
          </Link>
        </Text>
      }
    >
      <FormTextField
        control={control}
        name="email"
        label="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => setFocus('password')}
      />
      <FormTextField
        control={control}
        name="password"
        label="Password"
        placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => setFocus('confirmPassword')}
      />
      <FormTextField
        control={control}
        name="confirmPassword"
        label="Confirm password"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {signUp.isError && <ErrorMessage message={getErrorMessage(signUp.error)} />}
      <Button title="Create account" loading={signUp.isPending} onPress={submit} />
    </AuthScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  footer: {
    color: colors.textMuted,
    fontSize: 15,
  },
  link: {
    color: colors.primaryText,
    fontWeight: '600',
  },
}));
