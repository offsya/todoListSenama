import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@todo/client';
import {
  API_URL,
  apiError,
  apiRequests,
  findStoredTodo,
  seedTodo,
  seedUser,
  server,
  storedFile,
} from '../../test/api-mock';
import { renderApp } from '../../test/render';

let session: Session;

beforeEach(() => {
  session = seedUser();
});

const todoList = () => screen.findByRole('list', { name: 'Todos' });
const itemTexts = () =>
  screen.getAllByRole('checkbox').map((checkbox) => checkbox.getAttribute('aria-label'));

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
    // The fake API would answer with the same message: make sure the form stopped the request.
    expect(apiRequests()).not.toContain('POST /todos');
  });

  it('marks a todo as completed', async () => {
    seedTodo(session, 'Buy milk');
    const { user } = renderApp('/', { session });

    const checkbox = await screen.findByRole('checkbox', { name: 'Buy milk' });
    await user.click(checkbox);

    expect(checkbox).toBeChecked();
    await waitFor(() => expect(findStoredTodo('Buy milk')?.completed).toBe(true));
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
    expect(screen.getByRole('textbox', { name: 'Edit todo' })).toBeInTheDocument();
    expect(apiRequests().filter((request) => request.startsWith('PUT'))).toEqual([]);
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

  it('filters todos on the server', async () => {
    seedTodo(session, 'Done', true);
    seedTodo(session, 'To do');
    seedTodo(session, 'Late', false, '2020-01-01T00:00:00.000Z');
    const { user } = renderApp('/', { session });
    await todoList();

    await user.click(screen.getByRole('button', { name: 'Active' }));
    await waitFor(() => expect(itemTexts()).toEqual(['To do']));

    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(itemTexts()).toEqual(['Done']));

    await user.click(screen.getByRole('button', { name: 'Overdue' }));
    await waitFor(() => expect(itemTexts()).toEqual(['Late']));

    await user.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(itemTexts()).toHaveLength(3));
    expect(apiRequests()).toEqual(
      expect.arrayContaining([
        'GET /todos?filter=active&page=1&limit=10',
        'GET /todos?filter=done&page=1&limit=10',
        'GET /todos?filter=overdue&page=1&limit=10',
      ]),
    );
  });

  it('shows the due date and marks overdue todos', async () => {
    seedTodo(session, 'Late', false, '2020-01-01T00:00:00.000Z');
    seedTodo(session, 'Later', false, '2999-03-04T20:59:59.999Z');
    renderApp('/', { session });

    const late = await screen.findByText('Late');
    expect(late.parentElement).toHaveTextContent(/Overdue · Jan 1, 2020/);
    expect(screen.getByText('Later').parentElement).toHaveTextContent(/Due Mar [45], 2999/);
  });

  it('adds a todo with a due date', async () => {
    const { user } = renderApp('/', { session });

    await user.type(await screen.findByLabelText('New todo'), 'Pay rent');
    await user.type(screen.getByLabelText('Due date'), '2030-05-01');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Pay rent')).toBeInTheDocument();
    const stored = new Date(findStoredTodo('Pay rent')!.dueDate!);
    // The end of the picked day in the user's time zone.
    expect([stored.getFullYear(), stored.getMonth(), stored.getDate()]).toEqual([2030, 4, 1]);
    expect([stored.getHours(), stored.getMinutes()]).toEqual([23, 59]);
    expect(screen.getByLabelText('Due date')).toHaveValue('');
  });

  it('pages through the todos with Next and Previous', async () => {
    for (let i = 1; i <= 12; i += 1) seedTodo(session, `Todo ${i}`);
    const { user } = renderApp('/', { session });
    await todoList();

    expect(itemTexts()).toHaveLength(10);
    expect(itemTexts()[0]).toBe('Todo 12');
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Next/ }));

    await waitFor(() => expect(itemTexts()).toEqual(['Todo 2', 'Todo 1']));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Previous/ }));

    await waitFor(() => expect(itemTexts()[0]).toBe('Todo 12'));
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });

  it('goes back a page when the last todo of the last page is deleted', async () => {
    for (let i = 1; i <= 11; i += 1) seedTodo(session, `Todo ${i}`);
    const { user } = renderApp('/', { session });
    await todoList();
    await user.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(itemTexts()).toEqual(['Todo 1']));

    await user.click(screen.getByRole('button', { name: 'Delete "Todo 1"' }));

    await waitFor(() => expect(screen.getByText('Page 1 of 1')).toBeInTheDocument());
    expect(itemTexts()).toHaveLength(10);
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

  it('keeps focus in the list when a todo leaves the current filter', async () => {
    seedTodo(session, 'Second');
    seedTodo(session, 'First');
    const { user } = renderApp('/', { session });
    await todoList();
    await user.click(screen.getByRole('button', { name: 'Active' }));
    await waitFor(() =>
      expect(screen.getByRole('list', { name: 'Todos' })).toHaveAttribute('aria-busy', 'false'),
    );

    // Space on the focused checkbox: "First" is completed and leaves the Active filter.
    screen.getByRole('checkbox', { name: 'First' }).focus();
    await user.keyboard(' ');

    expect(screen.queryByRole('checkbox', { name: 'First' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Second' })).toHaveFocus();
  });

  describe('attachments', () => {
    const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('attaches a file and downloads it with the token', async () => {
      seedTodo(session, 'Pay the bill');
      const { user } = renderApp('/', { session });
      await screen.findByText('Pay the bill');

      const invoice = new File(['Invoice #42'], 'invoice.txt', { type: 'text/plain' });
      await user.upload(fileInput(), invoice);

      const link = await screen.findByRole('button', { name: /invoice\.txt/ });
      expect(link).toHaveTextContent('11 B');
      expect(await storedFile(findStoredTodo('Pay the bill')!.id)?.text()).toBe('Invoice #42');
      expect(
        screen.getByRole('button', { name: 'Replace the file of "Pay the bill"' }),
      ).toBeInTheDocument();

      const createObjectURL = vi.fn((_blob: Blob) => 'blob:invoice');
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = vi.fn();
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      await user.click(link);

      await waitFor(() => expect(click).toHaveBeenCalledOnce());
      const anchor = click.mock.contexts[0] as HTMLAnchorElement;
      expect(anchor.download).toBe('invoice.txt');
      expect(anchor.href).toBe('blob:invoice');
      expect(await createObjectURL.mock.calls[0]![0].text()).toBe('Invoice #42');
      expect(apiRequests()).toContain(
        `GET /todos/${findStoredTodo('Pay the bill')!.id}/attachment`,
      );
    });

    it('refuses files over 5 MB without uploading them', async () => {
      seedTodo(session, 'Pay the bill');
      const { user } = renderApp('/', { session });
      await screen.findByText('Pay the bill');

      const huge = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.bin');
      await user.upload(fileInput(), huge);

      expect(await screen.findByRole('alert')).toHaveTextContent('"huge.bin" is larger than 5 MB.');
      expect(apiRequests().some((request) => request.startsWith('POST /todos/'))).toBe(false);
    });
  });
});
