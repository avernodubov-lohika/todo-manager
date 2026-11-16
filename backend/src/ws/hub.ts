import type { PrismaClient } from '@prisma/client';
import type { WebSocket } from 'ws';
import { addDays, todayIn } from '../lib/dates.js';
import type { AuthUser } from '../auth/session.js';
import {
  computeNotifications,
  DUE_SOON_DAYS,
  NOTIFICATION_TYPES,
  parseNotificationId,
  type NotificationType,
} from './notifications.js';

export interface Settings {
  types: NotificationType[];
  intervalSec: number;
  timezone: string;
}

export type BatchReason = 'initial' | 'interval' | 'change';

export interface Conn {
  socket: WebSocket;
  user: AuthUser;
  settings: Settings;
  timer?: ReturnType<typeof setInterval>;
}

export class NotificationHub {
  private conns = new Map<string, Set<Conn>>();

  constructor(
    private prisma: PrismaClient,
    private now: () => Date,
    readonly defaultIntervalSec: number,
  ) {}

  add(conn: Conn) {
    let set = this.conns.get(conn.user.id);
    if (!set) this.conns.set(conn.user.id, (set = new Set()));
    set.add(conn);
    this.schedule(conn);
  }

  remove(conn: Conn) {
    if (conn.timer) clearInterval(conn.timer);
    const set = this.conns.get(conn.user.id);
    set?.delete(conn);
    if (set && set.size === 0) this.conns.delete(conn.user.id);
  }

  /** (Re)start the periodic batch timer using the connection's current interval. */
  schedule(conn: Conn) {
    if (conn.timer) clearInterval(conn.timer);
    conn.timer = setInterval(() => {
      void this.sendBatch(conn, 'interval').catch(() => undefined);
    }, conn.settings.intervalSec * 1000);
  }

  send(conn: Conn, message: unknown) {
    if (conn.socket.readyState === conn.socket.OPEN) conn.socket.send(JSON.stringify(message));
  }

  async sendBatch(conn: Conn, reason: BatchReason) {
    const today = todayIn(conn.settings.timezone, this.now());
    const limit = addDays(today, DUE_SOON_DAYS);
    const tasks = await this.prisma.task.findMany({
      where: { userId: conn.user.id, status: { not: 'done' }, dueDate: { not: null, lte: limit } },
      select: { id: true, listId: true, title: true, status: true, dueDate: true },
    });
    const acks = await this.prisma.notificationAck.findMany({
      where: { userId: conn.user.id, taskId: { in: tasks.map((t) => t.id) } },
      select: { taskId: true, type: true, dueDate: true },
    });
    const items = computeNotifications(tasks, acks, today, conn.settings.types);
    this.send(conn, {
      type: 'notifications',
      reason,
      generatedAt: this.now().toISOString(),
      items,
    });
  }

  /** Called after any task mutation: push a fresh batch to all of the user's sockets. */
  notifyChange(userId: string) {
    for (const conn of this.conns.get(userId) ?? []) {
      void this.sendBatch(conn, 'change').catch(() => undefined);
    }
  }

  /** Persist acknowledgements; returns the ids that were accepted. */
  async ack(userId: string, ids: string[]): Promise<string[]> {
    const parsed = ids
      .map((id) => ({ id, p: parseNotificationId(id) }))
      .filter((x): x is { id: string; p: NonNullable<ReturnType<typeof parseNotificationId>> } => !!x.p);
    const owned = await this.prisma.task.findMany({
      where: { userId, id: { in: parsed.map((x) => x.p.taskId) } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((t) => t.id));
    const valid = parsed.filter((x) => ownedIds.has(x.p.taskId));
    await this.prisma.$transaction(
      valid.map(({ p }) =>
        this.prisma.notificationAck.upsert({
          where: {
            userId_taskId_type_dueDate: { userId, taskId: p.taskId, type: p.type, dueDate: p.dueDate },
          },
          create: { userId, taskId: p.taskId, type: p.type, dueDate: p.dueDate },
          update: {},
        }),
      ),
    );
    return valid.map((x) => x.id);
  }

  closeAll() {
    for (const set of this.conns.values()) for (const c of set) if (c.timer) clearInterval(c.timer);
    this.conns.clear();
  }
}

export const defaultSettings = (intervalSec: number): Settings => ({
  types: [...NOTIFICATION_TYPES],
  intervalSec,
  timezone: 'UTC',
});
