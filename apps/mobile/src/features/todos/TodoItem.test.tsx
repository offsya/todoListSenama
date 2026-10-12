import type { Todo } from '@todo/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TodoItem } from './TodoItem';

const todo: Todo = {
  id: 't1',
  text: 'Buy milk',
  completed: false,
  dueDate: null,
  attachment: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function setup(overrides: Partial<Todo> = {}) {
  const props = {
    todo: { ...todo, ...overrides },
    onToggle: jest.fn(),
    onRename: jest.fn(),
    onDelete: jest.fn(),
    onAttach: jest.fn(),
    onOpenAttachment: jest.fn(),
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

  it('attaches a file', async () => {
    const { onAttach, todo: shown } = await setup();

    await fireEvent.press(screen.getByRole('button', { name: 'Attach a file to "Buy milk"' }));

    expect(onAttach).toHaveBeenCalledWith(shown);
  });

  it('shows the attached file and opens it', async () => {
    const attachment = { name: 'invoice.pdf', size: 2048, contentType: 'application/pdf' };
    const { onOpenAttachment, todo: shown } = await setup({ attachment });

    expect(screen.getByText('2 KB')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Replace the file of "Buy milk"' }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Open invoice.pdf' }));

    expect(onOpenAttachment).toHaveBeenCalledWith(shown);
  });

  it('shows the due date and marks an overdue todo', async () => {
    await setup({ dueDate: '2020-01-01T00:00:00.000Z' });

    expect(screen.getByText('Overdue · Jan 1, 2020')).toBeOnTheScreen();
  });
});
