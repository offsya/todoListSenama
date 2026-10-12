import { getTodoFilter, useDeleteTodo, useSignOut, useTodoList, useUpdateTodo } from '@todo/client';
import { getErrorMessage, type Todo } from '@todo/shared';
import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { ErrorMessage } from '../components/ErrorMessage';
import { IconButton } from '../components/IconButton';
import { KeyboardAvoidingContainer } from '../components/KeyboardAvoidingContainer';
import { FilterTabs } from '../features/todos/FilterTabs';
import { NewTodoForm } from '../features/todos/NewTodoForm';
import { TodoItem } from '../features/todos/TodoItem';
import { makeStyles, radius, useColors } from '../theme';

export default function TodosScreen() {
  const styles = useStyles();
  const colors = useColors();
  const list = useTodoList();
  const { todos, filter } = list;
  // Edits are optimistic: a failed one is rolled back and reported here, because the item
  // itself may already be filtered out of view.
  const [actionError, setActionError] = useState<unknown>(null);
  const updateTodo = useUpdateTodo({ onError: setActionError });
  const deleteTodo = useDeleteTodo({ onError: setActionError });
  const signOut = useSignOut();
  // Only a pull shows the refresh spinner, not the resync after every edit or on app focus.
  const [isRefreshingByUser, setIsRefreshingByUser] = useState(false);
  const refreshByUser = async () => {
    setIsRefreshingByUser(true);
    try {
      await todos.refetch();
    } finally {
      setIsRefreshingByUser(false);
    }
  };

  const { mutate: update } = updateTodo;
  const { mutate: remove } = deleteTodo;
  const toggle = useCallback(
    (todo: Todo) => update({ id: todo.id, changes: { completed: !todo.completed } }),
    [update],
  );
  const rename = useCallback(
    (todo: Todo, text: string) => update({ id: todo.id, changes: { text } }),
    [update],
  );
  const destroy = useCallback((todo: Todo) => remove(todo.id), [remove]);

  const activeFilter = getTodoFilter(filter);
  const visible = todos.data?.items ?? [];
  const retryButton = <TextButton title="Retry" onPress={() => void todos.refetch()} />;

  const renderEmpty = () => {
    if (todos.isPending) {
      return <ActivityIndicator style={styles.state} color={colors.primary} />;
    }
    if (!todos.data) {
      return (
        <View style={styles.state}>
          <ErrorMessage message={getErrorMessage(todos.error)} action={retryButton} />
        </View>
      );
    }
    return <Text style={[styles.state, styles.emptyText]}>{activeFilter.emptyMessage}</Text>;
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton icon="log-out-outline" label="Sign out" onPress={signOut} />
          ),
        }}
      />
      <KeyboardAvoidingContainer>
        <FlatList
          data={visible}
          keyExtractor={(todo) => todo.id}
          renderItem={({ item }) => (
            <TodoItem todo={item} onToggle={toggle} onRename={rename} onDelete={destroy} />
          )}
          ListHeaderComponent={
            <View style={styles.header}>
              <NewTodoForm />
              {actionError !== null && (
                <ErrorMessage
                  message={getErrorMessage(actionError)}
                  action={<TextButton title="Dismiss" onPress={() => setActionError(null)} />}
                />
              )}
              {/* Loaded todos stay on screen when a background refresh fails. */}
              {todos.data && todos.isError && (
                <ErrorMessage
                  message={`Could not refresh the list: ${getErrorMessage(todos.error)}`}
                  action={retryButton}
                />
              )}
              {todos.data && <FilterTabs value={filter} onChange={list.setFilter} />}
            </View>
          }
          ListEmptyComponent={renderEmpty()}
          ListFooterComponent={
            todos.data && (
              <View style={styles.pagination} role="navigation" aria-label="Pages">
                <PageButton
                  title="‹ Previous"
                  disabled={!list.hasPrevious}
                  onPress={list.previous}
                />
                <Text style={styles.pageInfo} aria-live="polite">
                  Page {list.page} of {list.totalPages}
                </Text>
                <PageButton title="Next ›" disabled={!list.hasNext} onPress={list.next} />
              </View>
            )
          }
          ItemSeparatorComponent={Separator}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          // iOS: keep the field being edited above the keyboard (Android: see the container).
          automaticallyAdjustKeyboardInsets
          refreshControl={
            <RefreshControl
              refreshing={isRefreshingByUser}
              onRefresh={() => void refreshByUser()}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
      </KeyboardAvoidingContainer>
    </>
  );
}

function Separator() {
  const styles = useStyles();
  return <View style={styles.separator} />;
}

interface PageButtonProps {
  title: string;
  disabled: boolean;
  onPress: () => void;
}

function PageButton({ title, disabled, onPress }: PageButtonProps) {
  const styles = useStyles();
  return (
    <Pressable
      role="button"
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pageButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.pageButtonText}>{title}</Text>
    </Pressable>
  );
}

function TextButton({ title, onPress }: { title: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable role="button" onPress={onPress} hitSlop={12} style={styles.textButtonArea}>
      <Text style={styles.textButton}>{title}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  header: {
    gap: 12,
    marginBottom: 12,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  state: {
    paddingVertical: 40,
    borderRadius: radius.lg,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
  },
  pageInfo: {
    color: colors.textMuted,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  pageButton: {
    minHeight: 44,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  pageButtonText: {
    color: colors.primaryText,
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.4,
  },
  textButtonArea: {
    paddingVertical: 4,
  },
  textButton: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
}));
