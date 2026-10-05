import {
  getTodoFilter,
  useDeleteTodo,
  useSignOut,
  useTodos,
  useUpdateTodo,
  type TodoFilter,
} from '@todo/client';
import { getErrorMessage, type Todo } from '@todo/shared';
import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { ErrorMessage } from '../components/ErrorMessage';
import { IconButton } from '../components/IconButton';
import { FilterTabs } from '../features/todos/FilterTabs';
import { NewTodoForm } from '../features/todos/NewTodoForm';
import { TodoItem } from '../features/todos/TodoItem';
import { makeStyles, radius, useColors } from '../theme';

export default function TodosScreen() {
  const styles = useStyles();
  const colors = useColors();
  const todos = useTodos();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const signOut = useSignOut();
  const [filter, setFilter] = useState<TodoFilter>('all');

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
  const items = todos.data ?? [];
  const visible = items.filter(activeFilter.matches);
  // Edits are optimistic, so failures are reported here: the item itself may be filtered out.
  const actionError = updateTodo.error ?? deleteTodo.error;

  const renderEmpty = () => {
    if (todos.isPending) {
      return <ActivityIndicator style={styles.state} color={colors.primary} />;
    }
    if (todos.isError) {
      return (
        <View style={styles.state}>
          <ErrorMessage action={<TextButton title="Retry" onPress={() => void todos.refetch()} />}>
            {getErrorMessage(todos.error)}
          </ErrorMessage>
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
      <FlatList
        data={visible}
        keyExtractor={(todo) => todo.id}
        renderItem={({ item }) => (
          <TodoItem todo={item} onToggle={toggle} onRename={rename} onDelete={destroy} />
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <NewTodoForm />
            {actionError && (
              <ErrorMessage
                action={
                  <TextButton
                    title="Dismiss"
                    onPress={() => {
                      updateTodo.reset();
                      deleteTodo.reset();
                    }}
                  />
                }
              >
                {getErrorMessage(actionError)}
              </ErrorMessage>
            )}
            {todos.isSuccess && <FilterTabs todos={items} value={filter} onChange={setFilter} />}
          </View>
        }
        ListEmptyComponent={renderEmpty()}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={todos.isRefetching}
            onRefresh={() => void todos.refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />
    </>
  );
}

function Separator() {
  const styles = useStyles();
  return <View style={styles.separator} />;
}

function TextButton({ title, onPress }: { title: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable role="button" onPress={onPress} hitSlop={8}>
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
  textButton: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
}));
