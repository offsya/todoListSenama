import { MAX_ATTACHMENT_SIZE, type Todo } from '@todo/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createMemoryStorage } from '../src/lib/file-storage.js';
import { TodoModel } from '../src/modules/todos/todo.model.js';
import { createTodo, createUser, missingId, type TestUser } from './helpers.js';

let storage: ReturnType<typeof createMemoryStorage>;
let app: ReturnType<typeof createApp>;
let alice: TestUser;
let bob: TestUser;
let todo: Todo;

beforeEach(async () => {
  storage = createMemoryStorage();
  app = createApp({ storage });
  alice = await createUser();
  bob = await createUser();
  todo = await createTodo(alice, 'Pay the bill');
});

const auth = { type: 'bearer' } as const;
const path = (id = todo.id) => `/todos/${id}/attachment`;

function upload(
  user: TestUser,
  content: string | Buffer = 'Invoice #42',
  filename = 'invoice.txt',
  id = todo.id,
) {
  return request(app)
    .post(path(id))
    .auth(user.token, auth)
    .attach('file', Buffer.from(content), { filename, contentType: 'text/plain' });
}

function download(user: TestUser, id = todo.id) {
  return request(app)
    .get(path(id))
    .auth(user.token, auth)
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
}

describe('POST /todos/:id/attachment', () => {
  it('stores the file privately and keeps only its storage key in MongoDB', async () => {
    const res = await upload(alice).expect(200);

    expect(res.body).toMatchObject({
      id: todo.id,
      text: 'Pay the bill',
      attachment: { name: 'invoice.txt', size: 11, contentType: 'text/plain' },
    });
    const stored = await TodoModel.findById(todo.id).lean();
    const key = stored?.attachment?.key;
    expect(key).toMatch(new RegExp(`^attachments/${alice.id}/${todo.id}/[\\w-]+$`));
    expect(key).not.toMatch(/https?:/);
    expect(storage.files.get(key!)?.toString()).toBe('Invoice #42');
    // The key never leaves the server.
    expect(JSON.stringify(res.body)).not.toContain(key);
  });

  it('shows the attachment in the list', async () => {
    await upload(alice).expect(200);

    const res = await request(app).get('/todos').auth(alice.token, auth).expect(200);

    expect(res.body.items[0].attachment).toEqual({
      name: 'invoice.txt',
      size: 11,
      contentType: 'text/plain',
    });
  });

  it('replaces the previous file and deletes it from the storage', async () => {
    await upload(alice, 'first', 'a.txt').expect(200);
    const [firstKey] = storage.files.keys();

    const res = await upload(alice, 'second', 'b.txt').expect(200);

    expect(res.body.attachment.name).toBe('b.txt');
    expect(storage.files.has(firstKey!)).toBe(false);
    expect([...storage.files.values()].map(String)).toEqual(['second']);
  });

  it('keeps non-ASCII file names and strips paths', async () => {
    const unicode = await upload(alice, 'x', 'Счёт за май.txt').expect(200);
    expect(unicode.body.attachment.name).toBe('Счёт за май.txt');

    const withPath = await upload(alice, 'x', '..\\..\\secret/../evil.txt').expect(200);
    expect(withPath.body.attachment.name).toBe('evil.txt');
  });

  it("does not let another user attach a file to someone else's todo", async () => {
    const res = await upload(bob).expect(404);

    expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'Todo not found' });
    expect(storage.files.size).toBe(0);
    await expect(TodoModel.findById(todo.id).lean()).resolves.toMatchObject({ attachment: null });
  });

  it('requires a token', async () => {
    await request(app).post(path()).attach('file', Buffer.from('x'), 'x.txt').expect(401);
    expect(storage.files.size).toBe(0);
  });

  it('responds with 404 for a missing todo and 400 for a malformed id', async () => {
    await upload(alice, 'x', 'x.txt', missingId).expect(404);
    await upload(alice, 'x', 'x.txt', 'not-an-id').expect(400);
  });

  it.each([
    ['no file', () => request(app).post(path()).auth(alice.token, auth).field('note', 'hi')],
    [
      'a file in another field',
      () =>
        request(app)
          .post(path())
          .auth(alice.token, auth)
          .attach('upload', Buffer.from('x'), 'x.txt'),
    ],
    [
      'two files',
      () =>
        request(app)
          .post(path())
          .auth(alice.token, auth)
          .attach('file', Buffer.from('a'), 'a.txt')
          .attach('file', Buffer.from('b'), 'b.txt'),
    ],
    ['a JSON body', () => request(app).post(path()).auth(alice.token, auth).send({ file: 'x' })],
  ])('rejects %s', async (_, send) => {
    const res = await send().expect(400);

    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(storage.files.size).toBe(0);
  });

  it('rejects files over the size limit', async () => {
    const res = await upload(alice, Buffer.alloc(MAX_ATTACHMENT_SIZE + 1)).expect(413);

    expect(res.body.error).toEqual({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'The file is larger than 5 MB',
    });
    expect(storage.files.size).toBe(0);
  });

  it('answers 503 when no file storage is configured', async () => {
    const res = await request(createApp({ storage: null }))
      .post(path())
      .auth(alice.token, auth)
      .attach('file', Buffer.from('x'), 'x.txt')
      .expect(503);

    expect(res.body.error).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'File storage is not configured',
    });
  });
});

describe('GET /todos/:id/attachment', () => {
  it('sends the file to the owner as a download', async () => {
    await upload(alice, 'Invoice #42', 'Счёт.txt').expect(200);

    const res = await download(alice).expect(200);

    expect((res.body as Buffer).toString()).toBe('Invoice #42');
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.headers['content-length']).toBe('11');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="????.txt"; filename*=UTF-8''%D0%A1%D1%87%D1%91%D1%82.txt`,
    );
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it("does not open someone else's file", async () => {
    await upload(alice).expect(200);

    const res = await request(app).get(path()).auth(bob.token, auth).expect(404);

    expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'Todo not found' });
  });

  it('requires a token', async () => {
    await upload(alice).expect(200);

    await request(app).get(path()).expect(401);
  });

  it('responds with 404 when the todo has no attachment', async () => {
    const res = await request(app).get(path()).auth(alice.token, auth).expect(404);

    expect(res.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'This todo has no attachment',
    });
  });
});

describe('DELETE /todos/:id', () => {
  it('deletes the attachment from the storage too', async () => {
    await upload(alice).expect(200);
    expect(storage.files.size).toBe(1);

    await request(app).delete(`/todos/${todo.id}`).auth(alice.token, auth).expect(204);

    expect(storage.files.size).toBe(0);
  });
});
