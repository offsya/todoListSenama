import Ionicons from '@expo/vector-icons/Ionicons';
import { formatDueDate, isOverdue, useTodoTextEditor } from '@todo/client';
import { TODO_TEXT_MAX_LENGTH, type Todo } from '@todo/shared';
import { memo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { IconButton } from '../../components/IconButton';
import { makeStyles, radius, useColors } from '../../theme';

interface TodoItemProps {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onRename: (todo: Todo, text: string) => void;
  onDelete: (todo: Todo) => void;
  onAttach: (todo: Todo) => void;
  onOpenAttachment: (todo: Todo) => void;
  /** The file is being uploaded. */
  attaching?: boolean;
}

export const TodoItem = memo(function TodoItem({
  todo,
  onToggle,
  onRename,
  onDelete,
  onAttach,
  onOpenAttachment,
  attaching = false,
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
        <View style={styles.body}>
          <Pressable
            style={styles.textButton}
            onPress={() => setIsEditing(true)}
            role="button"
            aria-label={`Edit "${todo.text}"`}
          >
            <Text style={[styles.text, todo.completed && styles.textCompleted]}>{todo.text}</Text>
            {todo.dueDate && <DueDate dueDate={todo.dueDate} overdue={isOverdue(todo)} />}
          </Pressable>
          {todo.attachment && (
            <Pressable
              role="button"
              aria-label={`Open ${todo.attachment.name}`}
              onPress={() => onOpenAttachment(todo)}
              style={({ pressed }) => [styles.attachment, pressed && styles.pressed]}
            >
              <Ionicons name="document-attach-outline" size={14} color={colors.primaryText} />
              <Text style={styles.attachmentName} numberOfLines={1}>
                {todo.attachment.name}
              </Text>
              <Text style={styles.attachmentSize}>{formatSize(todo.attachment.size)}</Text>
            </Pressable>
          )}
        </View>
      )}

      {attaching ? (
        <ActivityIndicator style={styles.attaching} color={colors.primary} />
      ) : (
        <IconButton
          icon="attach-outline"
          label={`${todo.attachment ? 'Replace the file of' : 'Attach a file to'} "${todo.text}"`}
          onPress={() => onAttach(todo)}
        />
      )}

      <IconButton
        icon="trash-outline"
        label={`Delete "${todo.text}"`}
        onPress={() => onDelete(todo)}
      />
    </View>
  );
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DueDate({ dueDate, overdue }: { dueDate: string; overdue: boolean }) {
  const styles = useStyles();
  return (
    <Text style={[styles.due, overdue && styles.dueOverdue]}>
      {overdue ? 'Overdue · ' : 'Due '}
      {formatDueDate(dueDate)}
    </Text>
  );
}

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
  body: {
    flex: 1,
    gap: 4,
    paddingVertical: 4,
  },
  textButton: {
    paddingVertical: 4,
  },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    maxWidth: '100%',
    minHeight: 32,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
  },
  attachmentName: {
    flexShrink: 1,
    color: colors.primaryText,
    fontSize: 13,
    fontWeight: '600',
  },
  attachmentSize: {
    color: colors.textMuted,
    fontSize: 12,
  },
  attaching: {
    width: 44,
    height: 44,
  },
  pressed: {
    opacity: 0.85,
  },
  text: {
    color: colors.text,
    fontSize: 16,
  },
  due: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 13,
  },
  dueOverdue: {
    color: colors.danger,
    fontWeight: '600',
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
