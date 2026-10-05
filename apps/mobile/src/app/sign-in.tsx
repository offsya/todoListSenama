import { zodResolver } from '@hookform/resolvers/zod';
import { useSignIn } from '@todo/client';
import { getErrorMessage, loginSchema } from '@todo/shared';
import { Link } from 'expo-router';
import { useForm } from 'react-hook-form';
import { Text } from 'react-native';
import { AuthScreen } from '../components/AuthScreen';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { FormTextField } from '../components/TextField';
import { makeStyles } from '../theme';

export default function SignInScreen() {
  const styles = useStyles();
  // No navigation here: the protected routes in the root layout react to the new session.
  const signIn = useSignIn();
  const { control, handleSubmit, setFocus } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit((values) => {
    // The keyboard's return key stays active while the request is in flight.
    if (!signIn.isPending) signIn.mutate(values);
  });

  return (
    <AuthScreen
      title="Welcome back"
      subtitle="Sign in to see your todos."
      footer={
        <Text style={styles.footer}>
          No account yet?{' '}
          <Link href="/sign-up" style={styles.link}>
            Create one
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
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {signIn.isError && <ErrorMessage message={getErrorMessage(signIn.error)} />}
      <Button title="Sign in" loading={signIn.isPending} onPress={submit} />
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
