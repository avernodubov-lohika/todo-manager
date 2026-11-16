import type { WebSocket } from 'ws';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_URL, closeTestApp, createTestApp, loginAlice, loginBob, type TestCtx } from './helpers.js';

// Clock: 2026-06-15 12:00 UTC => today = 2026-06-15, due_soon window ends 2026-06-18
let ctx: TestCtx;
let alice: string;
let bob: string;
let listId: string;
const sockets: WebSocket[] = [];

type Msg = { type: string; [k: string]: any };

/** Buffers every message so tests can await them in order without races. */
function client(ws: WebSocket) {
  const buffer: Msg[] = [];
  const waiters: (() => void)[] = [];
  ws.on('message', (raw) => {
    buffer.push(JSON.parse(raw.toString()));
    waiters.splice(0).forEach((w) => w());
  });
  const next = async (pred: (m: Msg) => boolean = () => true): Promise<Msg> => {
    for (;;) {
      const i = buffer.findIndex(pred);
      if (i >= 0) return buffer.splice(i, 1)[0];
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
  };
  return {
    ws,
    next,
    nextBatch: () => next((m) => m.type === 'notifications'),
    send: (m: unknown) => ws.send(JSON.stringify(m)),
    pending: () => buffer.length,
  };
}

async function connect(cookie?: string, origin: string | undefined = APP_URL) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  const ws = await ctx.app.injectWS('/ws', { headers });
  sockets.push(ws);
  return client(ws);
}

const closeCode = (ws: WebSocket) => new Promise<number>((res) => ws.on('close', (code) => res(code)));

async function addTask(cookie: string, title: string, dueDate: string | null, status = 'todo') {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/tasks',
    headers: { cookie },
    payload: { listId, title, dueDate, status },
  });
  return res.json() as { id: string };
}

beforeAll(async () => {
  ctx = await createTestApp();
  alice = await loginAlice(ctx.app);
  bob = await loginBob(ctx.app);
  listId = (await ctx.app.inject({ method: 'POST', url: '/api/lists', headers: { cookie: alice }, payload: { name: 'L' } })).json().id;
});
afterAll(() => closeTestApp(ctx));

beforeEach(async () => {
  await ctx.prisma.notificationAck.deleteMany();
  await ctx.prisma.task.deleteMany();
  await addTask(alice, 'overdue', '2026-06-10');
  await addTask(alice, 'soon', '2026-06-17');
  await addTask(alice, 'boundary', '2026-06-18');
  await addTask(alice, 'far', '2026-06-19');
  await addTask(alice, 'done-overdue', '2026-06-01', 'done');
  await addTask(alice, 'no-date', null);
});
afterEach(() => {
  vi.useRealTimers();
  sockets.splice(0).forEach((s) => s.terminate());
});

const titles = (m: Msg) => (m.items as { title: string }[]).map((i) => i.title);

describe('websocket auth', () => {
  it('closes unauthenticated connections with 4401', async () => {
    const ws = await ctx.app.injectWS('/ws', { headers: { origin: APP_URL } });
    sockets.push(ws);
    expect(await closeCode(ws)).toBe(4401);
  });

  it('closes connections with a foreign Origin', async () => {
    const ws = await ctx.app.injectWS('/ws', { headers: { origin: 'https://evil.example', cookie: alice } });
    sockets.push(ws);
    expect(await closeCode(ws)).toBe(4403);
  });
});

describe('websocket protocol', () => {
  it('sends hello and an initial batch with overdue and due_soon items only', async () => {
    const c = await connect(alice);
    const hello = await c.next();
    expect(hello).toMatchObject({ type: 'hello', user: { displayName: 'Alice' }, settings: { intervalSec: 60, timezone: 'UTC' } });
    const batch = await c.nextBatch();
    expect(batch.reason).toBe('initial');
    expect(titles(batch)).toEqual(['overdue', 'soon', 'boundary']);
    expect(batch.items[0]).toMatchObject({ type: 'overdue', dueDate: '2026-06-10' });
    expect(batch.items[1].id).toBe(`due_soon:${batch.items[1].taskId}:2026-06-17`);
  });

  it('does not show other users\' tasks', async () => {
    const c = await connect(bob);
    await c.next();
    expect((await c.nextBatch()).items).toEqual([]);
  });

  it('subscribe filters types and replies with a fresh batch', async () => {
    const c = await connect(alice);
    await c.nextBatch();
    c.send({ type: 'subscribe', types: ['overdue'], intervalSec: 30, timezone: 'Europe/Berlin' });
    expect(await c.next((m) => m.type === 'subscribed')).toMatchObject({
      settings: { types: ['overdue'], intervalSec: 30, timezone: 'Europe/Berlin' },
    });
    expect(titles(await c.nextBatch())).toEqual(['overdue']);
  });

  it('subscribe timezone shifts "today"', async () => {
    const c = await connect(alice);
    await c.nextBatch();
    // 12:00 UTC is 2026-06-16 in Auckland => 'far' (06-19) is now within +3
    c.send({ type: 'subscribe', timezone: 'Pacific/Auckland' });
    expect(titles(await c.nextBatch())).toEqual(['overdue', 'soon', 'boundary', 'far']);
  });

  it('ack removes the item from future batches and persists', async () => {
    const c = await connect(alice);
    const first = await c.nextBatch();
    const id = first.items[0].id;
    c.send({ type: 'ack', ids: [id, 'garbage', 'overdue:someone-elses-task:2026-06-10'] });
    expect(await c.next((m) => m.type === 'ack_ok')).toEqual({ type: 'ack_ok', ids: [id] });
    expect(await ctx.prisma.notificationAck.count()).toBe(1);

    c.send({ type: 'subscribe' });
    expect(titles(await c.nextBatch())).toEqual(['soon', 'boundary']);

    // survives reconnects
    const c2 = await connect(alice);
    expect(titles(await c2.nextBatch())).toEqual(['soon', 'boundary']);
  });

  it('ack of another user\'s notification is ignored', async () => {
    const c = await connect(alice);
    const id = (await c.nextBatch()).items[0].id;
    const b = await connect(bob);
    await b.nextBatch();
    b.send({ type: 'ack', ids: [id] });
    expect(await b.next((m) => m.type === 'ack_ok')).toEqual({ type: 'ack_ok', ids: [] });
    expect(await ctx.prisma.notificationAck.count()).toBe(0);
  });

  it('changing the due date invalidates an ack', async () => {
    const c = await connect(alice);
    const first = await c.nextBatch();
    const { taskId, id } = first.items[0];
    c.send({ type: 'ack', ids: [id] });
    await c.next((m) => m.type === 'ack_ok');
    await ctx.app.inject({ method: 'PATCH', url: `/api/tasks/${taskId}`, headers: { cookie: alice }, payload: { dueDate: '2026-06-11' } });
    const change = await c.nextBatch(); // reason: change
    expect(change.reason).toBe('change');
    expect(titles(change)).toContain('overdue');
  });

  it('pushes a "change" batch when a task is completed', async () => {
    const c = await connect(alice);
    const first = await c.nextBatch();
    await ctx.app.inject({ method: 'PATCH', url: `/api/tasks/${first.items[0].taskId}`, headers: { cookie: alice }, payload: { status: 'done' } });
    const change = await c.nextBatch();
    expect(change.reason).toBe('change');
    expect(titles(change)).toEqual(['soon', 'boundary']);
  });

  it('returns errors for invalid messages and keeps the socket open', async () => {
    const c = await connect(alice);
    await c.nextBatch();
    c.ws.send('not json');
    expect(await c.next((m) => m.type === 'error')).toMatchObject({ code: 'invalid_json' });
    c.send({ type: 'nope' });
    expect(await c.next((m) => m.type === 'error')).toMatchObject({ code: 'invalid_message' });
    c.send({ type: 'subscribe', intervalSec: 1 });
    expect(await c.next((m) => m.type === 'error')).toMatchObject({ code: 'invalid_message' });
    c.send({ type: 'subscribe', timezone: 'Mars/Base' });
    expect(await c.next((m) => m.type === 'error')).toMatchObject({ code: 'invalid_message' });
    c.send({ type: 'subscribe' });
    await c.next((m) => m.type === 'subscribed');
  });

  it('sends interval batches on the configured schedule', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const c = await connect(alice);
    await c.next((m) => m.type === 'hello');
    await c.nextBatch(); // initial
    c.send({ type: 'subscribe', intervalSec: 10 });
    await c.next((m) => m.type === 'subscribed');
    await c.nextBatch();

    expect(c.pending()).toBe(0);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(c.pending()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect((await c.nextBatch()).reason).toBe('interval');
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await c.nextBatch()).reason).toBe('interval');
  });

  it('stops timers when the socket closes', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const baseline = vi.getTimerCount();
    const c = await connect(alice);
    await c.nextBatch();
    expect(vi.getTimerCount()).toBe(baseline + 1);
    c.ws.terminate();
    for (let i = 0; i < 100 && vi.getTimerCount() > baseline; i++) await new Promise((r) => setTimeout(r, 10));
    expect(vi.getTimerCount()).toBe(baseline);
  });
});
