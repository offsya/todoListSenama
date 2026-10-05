import { useState, type Ref } from 'react';
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { makeStyles, radius, useColors } from '../theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  ref?: Ref<TextInput>;
}

export function TextField({ label, error, style, onFocus, onBlur, ...props }: TextFieldProps) {
  const styles = useStyles();
  const colors = useColors();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        aria-label={label}
        // React Native has no aria-describedby: the hint makes screen readers read the error
        // when the field is focused.
        accessibilityHint={error}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, focused && styles.focused, error ? styles.invalid : null, style]}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...props}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

interface FormTextFieldProps<T extends FieldValues> extends Omit<TextFieldProps, 'value'> {
  control: Control<T>;
  name: FieldPath<T>;
}

/** TextField bound to react-hook-form; shows the field's validation error. */
export function FormTextField<T extends FieldValues>({
  control,
  name,
  ...props
}: FormTextFieldProps<T>) {
  // Destructured: the React Compiler lint treats every property of an object holding a ref as a ref.
  const {
    field: { ref, value, onChange, onBlur },
    fieldState: { error },
  } = useController({ control, name });

  return (
    <TextField
      {...props}
      ref={ref}
      value={value}
      onChangeText={onChange}
      onBlur={onBlur}
      error={error?.message}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  field: {
    gap: 6,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
  focused: {
    borderColor: colors.primary,
  },
  invalid: {
    borderColor: colors.danger,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
}));
