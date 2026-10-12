import { dayFromDate, dueDateFromDay } from '@todo/client';
import { createElement } from 'react';
import { View } from 'react-native';
import { makeStyles, radius, useColors } from '../../theme';
import type { DueDateFieldProps } from './DueDateField';

/**
 * The date picker library has no web implementation; the browser's own date input does the job
 * (react-native-web renders to the DOM, so a plain element fits in).
 */
export function DueDateField({ value, onChange }: DueDateFieldProps) {
  const styles = useStyles();
  const colors = useColors();

  return (
    <View style={styles.row}>
      {createElement('input', {
        type: 'date',
        'aria-label': 'Due date',
        value: value ? dayFromDate(value) : '',
        onChange: (event: { target: { value: string } }) => {
          const dueDate = dueDateFromDay(event.target.value);
          onChange(dueDate ? new Date(dueDate) : null);
        },
        style: {
          minHeight: 36,
          padding: '0 10px',
          border: `1px solid ${colors.border}`,
          borderRadius: radius.sm,
          background: colors.surface,
          color: colors.text,
          font: 'inherit',
          fontSize: 14,
          colorScheme: 'light dark',
        },
      })}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
}));
