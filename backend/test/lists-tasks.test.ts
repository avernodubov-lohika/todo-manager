import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, loginAlice, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let cookie: string;
// Clock: 2026-06-15 12:00 UTC  => today = 2026-06-15

beforeAll(async () => {
  ctx = await createTestApp();
  cookie = await loginAlice(ctx.app);
});
afterAll(() => closeTestApp(ctx));

const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  ctx.app.inject({ method, url, headers: { cookie }, payload });

async function createList(name = 'Work') {
  const res = await call('POST', '/api/lists', { name });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; name: string; taskCount: number };
}

describe('lists and tasks', () => {
  it('creates a list and a task, edits it and quick-changes the status', async () => {
    const list = await createList();
    const created = await call('POST', '/api/tasks', {
      listId: list.id,
      title: 'Write report',
      priority: 'high',
      dueDate: '2026-06-20',
    });
    expect(created.statusCode).toBe(201);
    const task = created.json();
    expect(task).toMatchObject({ title: 'Write report', status: 'todo', priority: 'high', dueDate: '2026-06-20' });

    const edited = await call('PATCH', `/api/tasks/${task.id}`, { title: 'Write final report', description: 'v2' });
    expect(edited.json()).toMatchObject({ title: 'Write final report', description: 'v2', priority: 'high' });

    const status = await call('PATCH', `/api/tasks/${task.id}`, { status: 'done' });
    expect(status.json().status).toBe('done');

    const cleared = await call('PATCH', `/api/tasks/${task.id}`, { dueDate: null });
    expect(cleared.json().dueDate).toBeNull();

    const lists = await call('GET', '/api/lists');
    expect(lists.json()).toEqual([expect.objectContaining({ id: list.id, taskCount: 1 })]);
  });

  it('renames a list', async () => {
    const list = await createList('Old');
    const res = await call('PATCH', `/api/lists/${list.id}`, { name: 'New' });
    expect(res.json().name).toBe('New');
  });

  it('returns uniform validation errors', async () => {
    const list = await createList();
    const res = await call('POST', '/api/tasks', { listId: list.id, title: '   ', dueDate: '2026-13-45' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(['dueDate', 'title']);

    expect((await call('POST', '/api/lists', { name: 'x'.repeat(101) })).statusCode).toBe(400);
  });

  describe('search and filters', () => {
    beforeAll(async () => {
      await ctx.prisma.task.deleteMany();
      await ctx.prisma.list.deleteMany();
      const a = await createList('A');
      const b = await createList('B');
      const mk = (listId: string, title: string, extra: object = {}) =>
        call('POST', '/api/tasks', { listId, title, ...extra });
      await mk(a.id, 'Overdue high', { dueDate: '2026-06-10', priority: 'high' });
      await mk(a.id, 'Overdue but done', { dueDate: '2026-06-10', status: 'done' });
      await mk(a.id, 'Due today', { dueDate: '2026-06-15', status: 'in_progress' });
      await mk(a.id, 'Due in a week', { dueDate: '2026-06-21' });
      await mk(a.id, 'Due later', { dueDate: '2026-06-22' });
      await mk(b.id, 'No date', { description: 'Contains the word Banana' });
    });

    const titles = async (qs: string) =>
      ((await call('GET', `/api/tasks?${qs}`)).json() as { title: string }[]).map((t) => t.title);

    it('searches title and description case-insensitively', async () => {
      expect(await titles('q=overdue')).toEqual(expect.arrayContaining(['Overdue high', 'Overdue but done']));
      expect(await titles('q=banana')).toEqual(['No date']);
    });

    it('filters by status and priority', async () => {
      expect(await titles('status=in_progress')).toEqual(['Due today']);
      expect(await titles('priority=high')).toEqual(['Overdue high']);
    });

    it('filters by due category using the client timezone', async () => {
      expect(await titles('due=overdue')).toEqual(['Overdue high']);
      expect(await titles('due=today')).toEqual(['Due today']);
      expect(await titles('due=week')).toEqual(['Due today', 'Due in a week']);
      // 12:00 UTC is already the next day in Pacific/Auckland => "today" is 2026-06-16
      expect(await titles('due=today&tz=Pacific/Auckland')).toEqual([]);
      expect(await titles('due=overdue&tz=Pacific/Auckland')).toContain('Due today');
    });

    it('filters by list and sorts by due date with undated last', async () => {
      const lists = (await call('GET', '/api/lists')).json() as { id: string; name: string }[];
      const b = lists.find((l) => l.name === 'B')!;
      expect(await titles(`listId=${b.id}`)).toEqual(['No date']);
      const all = await titles('');
      expect(all.at(-1)).toBe('No date');
    });

    it('rejects an invalid timezone', async () => {
      expect((await call('GET', '/api/tasks?tz=Mars/Base')).statusCode).toBe(400);
    });
  });

  it('cascade-deletes tasks (and acks) when a list is deleted', async () => {
    const list = await createList('Doomed');
    const t = (await call('POST', '/api/tasks', { listId: list.id, title: 'T1', dueDate: '2026-06-01' })).json();
    await call('POST', '/api/tasks', { listId: list.id, title: 'T2' });
    const user = await ctx.prisma.user.findFirstOrThrow();
    await ctx.prisma.notificationAck.create({
      data: { userId: user.id, taskId: t.id, type: 'overdue', dueDate: '2026-06-01' },
    });

    const res = await call('DELETE', `/api/lists/${list.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: list.id, deletedTasks: 2 });
    expect(await ctx.prisma.task.count({ where: { listId: list.id } })).toBe(0);
    expect(await ctx.prisma.notificationAck.count({ where: { taskId: t.id } })).toBe(0);
  });

  it('deletes a task', async () => {
    const list = await createList();
    const t = (await call('POST', '/api/tasks', { listId: list.id, title: 'bye' })).json();
    expect((await call('DELETE', `/api/tasks/${t.id}`)).statusCode).toBe(204);
    expect((await call('DELETE', `/api/tasks/${t.id}`)).statusCode).toBe(404);
  });

  it('creates sample data', async () => {
    const before = await ctx.prisma.list.count();
    const res = await ctx.app.inject({ method: 'POST', url: '/api/sample-data', headers: { cookie } });
    expect(res.statusCode).toBe(201);
    expect(res.json().lists).toBe(3);
    expect(await ctx.prisma.list.count()).toBe(before + 3);
  });
});
