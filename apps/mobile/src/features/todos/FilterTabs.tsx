import { TODO_FILTERS, type TodoFilter } from '@todo/client';
import type { Todo } from '@todo/shared';
import { Pressable, Text, View } from 'react-native';
import { makeStyles, radius } from '../../theme';

interface FilterTabsProps {
  todos: Todo[];
  value: TodoFilter;
  onChange: (filter: TodoFilter) => void;
}

export function FilterTabs({ todos, value, onChange }: FilterTabsProps) {
  const styles = useStyles();

  return (
    <View style={styles.tabs} role="tablist">
      {TODO_FILTERS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            role="tab"
            aria-selected={selected}
            onPress={() => onChange(option.value)}
            style={[styles.tab, selected && styles.tabSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {option.label} {todos.filter(option.matches).length}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  tabs: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 6,
  },
  tabSelected: {
    backgroundColor: colors.primarySoft,
  },
  label: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  labelSelected: {
    color: colors.primary,
  },
}));
