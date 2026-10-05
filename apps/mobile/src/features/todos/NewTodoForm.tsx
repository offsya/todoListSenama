import Ionicons from '@expo/vector-icons/Ionicons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateTodo } from '@todo/client';
import { createTodoSchema, getErrorMessage, TODO_TEXT_MAX_LENGTH } from '@todo/shared';
import { useController, useForm } from 'react-hook-form';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { makeStyles, radius, useColors } from '../../theme';

export function NewTodoForm() {
  const styles = useStyles();
  const colors = useColors();
  const createTodo = useCreateTodo();
  const { control, handleSubmit, reset } = useForm({
    resolver: zodResolver(createTodoSchema),
    defaultValues: { text: '' },
  });
  const {
    field: { ref, value, onChange, onBlur },
    fieldState,
  } = useController({ control, name: 'text' });

  const submit = handleSubmit(({ text }) => {
    createTodo.mutate(text, { onSuccess: () => reset() });
  });

  const error =
    fieldState.error?.message ??
    (createTodo.isError ? getErrorMessage(createTodo.error) : undefined);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          onSubmitEditing={submit}
          submitBehavior="submit"
          placeholder="What needs to be done?"
          placeholderTextColor={colors.textMuted}
          aria-label="New todo"
          returnKeyType="done"
          maxLength={TODO_TEXT_MAX_LENGTH}
          style={[styles.input, error ? styles.inputInvalid : null]}
        />
        <Pressable
          role="button"
          aria-label="Add todo"
          aria-disabled={createTodo.isPending}
          aria-busy={createTodo.isPending}
          disabled={createTodo.isPending}
          onPress={submit}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          {createTodo.isPending ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Ionicons name="add" size={24} color={colors.onPrimary} />
          )}
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
  inputInvalid: {
    borderColor: colors.danger,
  },
  addButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  pressed: {
    opacity: 0.85,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
}));
