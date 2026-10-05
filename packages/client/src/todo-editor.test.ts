import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTodoTextEditor } from './todo-editor.js';

function setup(initialText = 'Buy milk') {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const { result } = renderHook(() => useTodoTextEditor({ initialText, onSave, onCancel }));
  return { result, onSave, onCancel };
}

describe('useTodoTextEditor', () => {
  it('saves the trimmed text once, even if the input fires blur after Enter', () => {
    const { result, onSave } = setup();

    act(() => result.current.changeText('  Buy oat milk  '));
    act(() => result.current.submit());
    act(() => result.current.blur());

    expect(onSave).toHaveBeenCalledExactlyOnceWith('Buy oat milk');
  });

  it('explains why an empty text cannot be saved and keeps editing', () => {
    const { result, onSave, onCancel } = setup();

    act(() => result.current.changeText('   '));
    act(() => result.current.submit());

    expect(result.current.error).toBe('Text must not be empty');
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('clears the error as soon as the text changes', () => {
    const { result } = setup();

    act(() => result.current.changeText(''));
    act(() => result.current.submit());
    act(() => result.current.changeText('B'));

    expect(result.current.error).toBeUndefined();
  });

  it('drops an invalid edit when the field loses focus', () => {
    const { result, onSave, onCancel } = setup();

    act(() => result.current.changeText(''));
    act(() => result.current.blur());

    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('cancels once, ignoring the blur that follows', () => {
    const { result, onSave, onCancel } = setup();

    act(() => result.current.cancel());
    act(() => result.current.blur());

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });
});
