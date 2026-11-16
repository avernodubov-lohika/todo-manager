import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, loginAlice, loginBob, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let alice: string;
let bob: string;
let listId: string;
let taskId: string;

const call = (cookie: string | undefined, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  ctx.app.inject({ method, url, headers: cookie ? { cookie } : {}, payload });

beforeAll(async () => {
  ctx = await createTestApp();
  alice = await loginAlice(ctx.app);
  bob = await loginBob(ctx.app);
  listId = (await call(alice, 'POST', '/api/lists', { name: 'Private' })).json().id;
  taskId = (await call(alice, 'POST', '/api/tasks', { listId, title: 'Secret' })).json().id;
});
afterAll(() => closeTestApp(ctx));

describe('per-user scoping', () => {
  it('returns 404 for another user\'s list', async () => {
    expect((await call(bob, 'PATCH', `/api/lists/${listId}`, { name: 'Hacked' })).statusCode).toBe(404);
    expect((await call(bob, 'DELETE', `/api/lists/${listId}`)).statusCode).toBe(404);
  });

  it('returns 404 for another user\'s task on PATCH/DELETE', async () => {
    expect((await call(bob, 'PATCH', `/api/tasks/${taskId}`, { title: 'Hacked' })).statusCode).toBe(404);
    expect((await call(bob, 'DELETE', `/api/tasks/${taskId}`)).statusCode).toBe(404);
    expect((await ctx.prisma.task.findUniqueOrThrow({ where: { id: taskId } })).title).toBe('Secret');
  });

  it('cannot create a task in another user\'s list', async () => {
    const res = await call(bob, 'POST', '/api/tasks', { listId, title: 'Injected' });
    expect(res.statusCode).toBe(404);
    expect(await ctx.prisma.task.count({ where: { title: 'Injected' } })).toBe(0);
  });

  it('cannot move own task into another user\'s list', async () => {
    const bobList = (await call(bob, 'POST', '/api/lists', { name: 'Bob' })).json().id;
    const bobTask = (await call(bob, 'POST', '/api/tasks', { listId: bobList, title: 'Mine' })).json().id;
    expect((await call(bob, 'PATCH', `/api/tasks/${bobTask}`, { listId })).statusCode).toBe(404);
  });

  it('never leaks tasks or lists in listings', async () => {
    const tasks = (await call(bob, 'GET', '/api/tasks')).json();
    expect(tasks.map((t: { title: string }) => t.title)).toEqual(['Mine']);
    expect((await call(bob, 'GET', `/api/tasks?listId=${listId}`)).json()).toEqual([]);
    expect((await call(bob, 'GET', '/api/tasks?q=Secret')).json()).toEqual([]);
    const lists = (await call(bob, 'GET', '/api/lists')).json();
    expect(lists.map((l: { name: string }) => l.name)).toEqual(['Bob']);
  });

  it('requires authentication on every API route', async () => {
    const routes: [string, string][] = [
      ['GET', '/api/me'],
      ['GET', '/api/lists'],
      ['POST', '/api/lists'],
      ['PATCH', `/api/lists/${listId}`],
      ['DELETE', `/api/lists/${listId}`],
      ['GET', '/api/tasks'],
      ['POST', '/api/tasks'],
      ['PATCH', `/api/tasks/${taskId}`],
      ['DELETE', `/api/tasks/${taskId}`],
      ['POST', '/api/sample-data'],
    ];
    for (const [method, url] of routes) {
      const res = await call(undefined, method as 'GET', url, method === 'GET' ? undefined : {});
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });
});
