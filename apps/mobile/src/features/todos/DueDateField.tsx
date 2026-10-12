import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { formatDueDate } from '@todo/client';
import { useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { makeStyles, radius, useColors } from '../../theme';

export interface DueDateFieldProps {
  /** Any moment of the picked day, or `null` for no due date. */
  value: Date | null;
  onChange: (value: Date | null) => void;
}

/**
 * "Add due date" chip that opens the system date picker: a dialog on Android, a calendar sheet
 * on iOS. The web build uses DueDateField.web.tsx.
 */
export function DueDateField({ value, onChange }: DueDateFieldProps) {
  const styles = useStyles();
  const colors = useColors();
  const [iosPickerOpen, setIosPickerOpen] = useState(false);
  // The day shown in the iOS sheet; committed with "Done".
  const [iosDraft, setIosDraft] = useState(new Date());

  const open = () => {
    const initial = value ?? new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initial,
        mode: 'date',
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(date);
        },
      });
      return;
    }
    setIosDraft(initial);
    setIosPickerOpen(true);
  };

  return (
    <View style={styles.row}>
      <Pressable
        role="button"
        aria-label={
          value ? `Due date: ${formatDueDate(value.toISOString())}. Change` : 'Add due date'
        }
        onPress={open}
        style={({ pressed }) => [styles.chip, value && styles.chipSet, pressed && styles.pressed]}
      >
        <Ionicons
          name="calendar-outline"
          size={16}
          color={value ? colors.primaryText : colors.textMuted}
        />
        <Text style={[styles.label, value && styles.labelSet]}>
          {value ? `Due ${formatDueDate(value.toISOString())}` : 'Add due date'}
        </Text>
      </Pressable>
      {value && (
        <Pressable
          role="button"
          aria-label="Remove due date"
          hitSlop={12}
          onPress={() => onChange(null)}
          style={styles.clear}
        >
          <Ionicons name="close-circle" size={20} color={colors.textMuted} />
        </Pressable>
      )}

      {Platform.OS === 'ios' && (
        <Modal
          visible={iosPickerOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setIosPickerOpen(false)}
        >
          <Pressable style={styles.backdrop} onPress={() => setIosPickerOpen(false)} />
          <View style={styles.sheet}>
            <DateTimePicker
              value={iosDraft}
              mode="date"
              display="inline"
              onChange={(_event, date) => date && setIosDraft(date)}
              accentColor={colors.primary}
            />
            <Pressable
              role="button"
              onPress={() => {
                onChange(iosDraft);
                setIosPickerOpen(false);
              }}
              style={styles.done}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        </Modal>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  chipSet: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  labelSet: {
    color: colors.primaryText,
  },
  clear: {
    padding: 2,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  sheet: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  done: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  doneText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
}));
