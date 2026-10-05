import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw/http';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '@todo/client';
import { API_URL, apiError, findStoredTodo, seedTodo, seedUser, server } from '../../test/api-mock';
import { renderApp } from '../../test/render';

let session: Session;

beforeEach(() => {
  session = seedUser();
});

const todoList = () => screen.findByRole('list', { name: 'Todos' });

describe('TodosPage', () => {
  it('shows the empty state for a new user', async () => {
    renderApp('/', { session });

    expect(
      await screen.findByText('Nothing to do yet. Add your first todo above.'),
    ).toBeInTheDocument();
  });

  it("lists only the current user's todos, newest first", async () => {
    seedTodo(session, 'First');
    seedTodo(session, 'Second');
    seedTodo(seedUser('bob@example.com'), "Bob's todo");

    renderApp('/', { session });

    const items = within(await todoList()).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Second', 'First']);
  });

  it('adds a todo', async () => {
    const { user } = renderApp('/', { session });

    const input = await screen.findByLabelText('New todo');
    await user.type(input, '  Write tests  {Enter}');

    expect(await screen.findByText('Write tests')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(findStoredTodo('Write tests')).toBeDefined();
  });

  it('does not add an empty todo', async () => {
    const { user } = renderApp('/', { session });

    await user.type(await screen.findByLabelText('New todo'), '   ');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Text must not be empty');
  });

  it('marks a todo as completed', async () => {
    seedTodo(session, 'Buy milk');
    const { user } = renderApp('/', { session });

    const checkbox = await screen.findByRole('checkbox', { name: 'Buy milk' });
    await user.click(checkbox);

    expect(checkbox).toBeChecked();
    await waitFor(() => expect(findStoredTodo('Buy milk')?.completed).toBe(true));
    expect(screen.getByText('All done')).toBeInTheDocument();
  });

  it('edits a todo', async () => {
    seedTodo(session, 'Buy milk');
    const { user } = renderApp('/', { session });

    await user.click(await screen.findByRole('button', { name: 'Edit "Buy milk"' }));
    const input = screen.getByRole('textbox', { name: 'Edit todo' });
    await user.clear(input);
    await user.type(input, 'Buy oat milk{Enter}');

    expect(await screen.findByText('Buy oat milk')).toBeInTheDocument();
    await waitFor(() => expect(findStoredTodo('Buy oat milk')).toBeDefined());
    // The same Enter keystroke must not reopen the editor through the focused Edit button.
    expect(screen.queryByRole('textbox', { name: 'Edit todo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit "Buy oat milk"' })).toHaveFocus();
  });

  it('cancels editing with Escape', async () => {
    seedTodo(session, 'Buy milk');
    const { user } = renderApp('/', { session });

    await user.click(await screen.findByRole('button', { name: 'Edit "Buy milk"' }));
    await user.type(screen.getByRole('textbox', { name: 'Edit todo' }), ' and bread{Escape}');

    expect(screen.queryByRole('textbox', { name: 'Edit todo' })).not.toBeInTheDocument();
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
    expect(findStoredTodo('Buy milk')).toBeDefined();
  });

  it('does not save an empty text', async () => {
    seedTodo(session, 'Buy milk');
    const { user } = renderApp('/', { session });

    await user.click(await screen.findByRole('button', { name: 'Edit "Buy milk"' }));
    await user.clear(screen.getByRole('textbox', { name: 'Edit todo' }));
    await user.keyboard('{Enter}');

    expect(screen.getByRole('alert')).toHaveTextContent('Text must not be empty');
    expect(findStoredTodo('Buy milk')).toBeDefined();
  });

  it('deletes a todo', async () => {
    seedTodo(session, 'Buy milk');
    const { user } = renderApp('/', { session });

    await user.click(await screen.findByRole('button', { name: 'Delete "Buy milk"' }));

    await waitFor(() => expect(screen.queryByText('Buy milk')).not.toBeInTheDocument());
    await waitFor(() => expect(findStoredTodo('Buy milk')).toBeUndefined());
  });

  it('rolls back and reports an error when saving fails', async () => {
    seedTodo(session, 'Buy milk');
    server.use(
      http.put(`${API_URL}/todos/:id`, () =>
        apiError(500, 'INTERNAL_ERROR', 'Internal server error'),
      ),
    );
    const { user } = renderApp('/', { session });

    const checkbox = await screen.findByRole('checkbox', { name: 'Buy milk' });
    await user.click(checkbox);

    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');
    await waitFor(() => expect(checkbox).not.toBeChecked());
  });

  it('filters todos', async () => {
    seedTodo(session, 'Done', true);
    seedTodo(session, 'To do');
    const { user } = renderApp('/', { session });
    const list = await todoList();

    await user.click(screen.getByRole('button', { name: /^Active/ }));
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['To do']);

    await user.click(screen.getByRole('button', { name: /^Completed/ }));
    expect(within(await todoList()).getByText('Done')).toBeInTheDocument();
    expect(screen.queryByText('To do')).not.toBeInTheDocument();
  });

  it('offers to retry when the todos cannot be loaded', async () => {
    server.use(
      http.get(`${API_URL}/todos`, () => apiError(500, 'INTERNAL_ERROR', 'Internal server error'), {
        once: true,
      }),
    );
    seedTodo(session, 'Buy milk');
    const { user } = renderApp('/', { session });

    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Buy milk')).toBeInTheDocument();
  });

  it('reports a failed edit even when a later one succeeds', async () => {
    const failing = seedTodo(session, 'Fails');
    seedTodo(session, 'Succeeds');
    server.use(
      http.put(`${API_URL}/todos/:id`, async ({ params }) => {
        if (params.id !== failing.id) return undefined; // fall through to the fake API
        await new Promise((resolve) => setTimeout(resolve, 50)); // fail after the other one
        return apiError(500, 'INTERNAL_ERROR', 'Internal server error');
      }),
    );
    const { user } = renderApp('/', { session });

    await user.click(await screen.findByRole('checkbox', { name: 'Fails' }));
    await user.click(screen.getByRole('checkbox', { name: 'Succeeds' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Fails' })).not.toBeChecked());
    expect(screen.getByRole('checkbox', { name: 'Succeeds' })).toBeChecked();
  });

  it('keeps showing the list when a background refresh fails', async () => {
    seedTodo(session, 'Buy milk');
    const { user } = renderApp('/', { session });
    await screen.findByText('Buy milk');
    server.use(
      http.get(`${API_URL}/todos`, () => apiError(500, 'INTERNAL_ERROR', 'Internal server error')),
    );

    // Adding a todo resyncs the list from the server, which now fails.
    await user.type(screen.getByLabelText('New todo'), 'Buy bread{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not refresh the list');
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
    expect(screen.getByText('Buy bread')).toBeInTheDocument();
  });

  it('gives focus back to the edit button after editing with the keyboard', async () => {
    seedTodo(session, 'Buy milk');
    const { user } = renderApp('/', { session });

    await user.click(await screen.findByRole('button', { name: 'Edit "Buy milk"' }));
    await user.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: 'Edit "Buy milk"' })).toHaveFocus();
  });

  it('moves focus to the next todo after a deletion', async () => {
    seedTodo(session, 'Second');
    seedTodo(session, 'First');
    const { user } = renderApp('/', { session });

    await user.click(await screen.findByRole('button', { name: 'Delete "First"' }));

    expect(screen.getByRole('checkbox', { name: 'Second' })).toHaveFocus();
  });
});
