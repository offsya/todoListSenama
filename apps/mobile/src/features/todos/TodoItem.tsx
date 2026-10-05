import Ionicons from '@expo/vector-icons/Ionicons';
import { useTodoTextEditor } from '@todo/client';
import { TODO_TEXT_MAX_LENGTH, type Todo } from '@todo/shared';
import { memo, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { IconButton } from '../../components/IconButton';
import { makeStyles, radius, useColors } from '../../theme';

interface TodoItemProps {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onRename: (todo: Todo, text: string) => void;
  onDelete: (todo: Todo) => void;
}

export const TodoItem = memo(function TodoItem({
  todo,
  onToggle,
  onRename,
  onDelete,
}: TodoItemProps) {
  const styles = useStyles();
  const colors = useColors();
  const [isEditing, setIsEditing] = useState(false);

  const finishEditing = (text?: string) => {
    setIsEditing(false);
    if (text !== undefined && text !== todo.text) onRename(todo, text);
  };

  return (
    <View style={styles.row}>
      <Pressable
        {...(Platform.OS === 'web' && { onKeyDown: toggleOnSpace(() => onToggle(todo)) })}
        role="checkbox"
        aria-checked={todo.completed}
        aria-label={todo.text}
        onPress={() => onToggle(todo)}
        // 22pt box + 2×12pt = a 46pt touch target (guideline: 44pt / 48dp).
        hitSlop={12}
        style={[styles.checkbox, todo.completed && styles.checkboxChecked]}
      >
        {todo.completed && <Ionicons name="checkmark" size={15} color={colors.onPrimary} />}
      </Pressable>

      {isEditing ? (
        <TodoTextEditor
          initialText={todo.text}
          onSave={finishEditing}
          onCancel={() => finishEditing()}
        />
      ) : (
        <Pressable
          style={styles.textButton}
          onPress={() => setIsEditing(true)}
          role="button"
          aria-label={`Edit "${todo.text}"`}
        >
          <Text style={[styles.text, todo.completed && styles.textCompleted]}>{todo.text}</Text>
        </Pressable>
      )}

      <IconButton
        icon="trash-outline"
        label={`Delete "${todo.text}"`}
        onPress={() => onDelete(todo)}
      />
    </View>
  );
});

/**
 * react-native-web presses an element on Space only when its role is "button", so a custom
 * checkbox has to handle the key itself (Enter already works).
 */
function toggleOnSpace(toggle: () => void) {
  return (event: { key: string; preventDefault: () => void }) => {
    if (event.key !== ' ') return;
    event.preventDefault(); // no page scroll
    toggle();
  };
}

interface TodoTextEditorProps {
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}

/** "Done" saves; tapping elsewhere saves a valid value and drops an invalid one. */
function TodoTextEditor(props: TodoTextEditorProps) {
  const styles = useStyles();
  const editor = useTodoTextEditor(props);

  return (
    <View style={styles.editor}>
      <TextInput
        value={editor.text}
        onChangeText={editor.changeText}
        onSubmitEditing={editor.submit}
        onBlur={editor.blur}
        // Keep the keyboard open on submit, so a validation error can be fixed in place.
        // react-native-web ignores submitBehavior and reads only blurOnSubmit; on iOS and
        // Android submitBehavior takes precedence.
        submitBehavior="submit"
        blurOnSubmit={false}
        returnKeyType="done"
        maxLength={TODO_TEXT_MAX_LENGTH}
        aria-label="Edit todo"
        accessibilityHint={editor.error}
        autoFocus
        style={[styles.input, editor.error ? styles.inputInvalid : null]}
      />
      {editor.error && <Text style={styles.error}>{editor.error}</Text>}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  checkbox: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderRadius: 6,
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  textButton: {
    flex: 1,
    paddingVertical: 8,
  },
  text: {
    color: colors.text,
    fontSize: 16,
  },
  textCompleted: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  editor: {
    flex: 1,
    gap: 4,
  },
  input: {
    minHeight: 40,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    color: colors.text,
    fontSize: 16,
  },
  inputInvalid: {
    borderColor: colors.danger,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
}));
