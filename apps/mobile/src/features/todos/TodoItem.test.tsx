import type { Todo } from '@todo/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TodoItem } from './TodoItem';

const todo: Todo = {
  id: 't1',
  text: 'Buy milk',
  completed: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function setup(overrides: Partial<Todo> = {}) {
  const props = {
    todo: { ...todo, ...overrides },
    onToggle: jest.fn(),
    onRename: jest.fn(),
    onDelete: jest.fn(),
  };
  await render(<TodoItem {...props} />);
  return props;
}

async function startEditing() {
  await fireEvent.press(screen.getByRole('button', { name: 'Edit "Buy milk"' }));
  return screen.getByLabelText('Edit todo');
}

describe('TodoItem', () => {
  it('shows the completion state', async () => {
    await setup({ completed: true });

    expect(screen.getByRole('checkbox', { name: 'Buy milk' })).toBeChecked();
  });

  it('toggles completion', async () => {
    const { onToggle, todo: shown } = await setup();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Buy milk' }));

    expect(onToggle).toHaveBeenCalledWith(shown);
  });

  it('renames a todo, trimming the text', async () => {
    const { onRename, todo: shown } = await setup();

    const input = await startEditing();
    await fireEvent.changeText(input, '  Buy oat milk ');
    await fireEvent(input, 'submitEditing');

    expect(onRename).toHaveBeenCalledWith(shown, 'Buy oat milk');
    expect(screen.queryByLabelText('Edit todo')).not.toBeOnTheScreen();
  });

  it('keeps editing and explains why an empty text cannot be saved', async () => {
    const { onRename } = await setup();

    const input = await startEditing();
    await fireEvent.changeText(input, '   ');
    await fireEvent(input, 'submitEditing');

    expect(screen.getByText('Text must not be empty')).toBeOnTheScreen();
    expect(screen.getByLabelText('Edit todo')).toBeOnTheScreen();
    expect(onRename).not.toHaveBeenCalled();
  });

  it('drops an invalid edit when the field loses focus', async () => {
    const { onRename } = await setup();

    const input = await startEditing();
    await fireEvent.changeText(input, '');
    await fireEvent(input, 'blur');

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText('Buy milk')).toBeOnTheScreen();
  });

  it('deletes a todo', async () => {
    const { onDelete, todo: shown } = await setup();

    await fireEvent.press(screen.getByRole('button', { name: 'Delete "Buy milk"' }));

    expect(onDelete).toHaveBeenCalledWith(shown);
  });
});
