import { addDays } from '../lib/dates.js';

export const NOTIFICATION_TYPES = ['overdue', 'due_soon'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Number of days ahead (inclusive) in which a task counts as "due soon". */
export const DUE_SOON_DAYS = 3;

export interface TaskLike {
  id: string;
  listId: string;
  title: string;
  status: string;
  dueDate: string | null;
}

export interface AckLike {
  taskId: string;
  type: string;
  dueDate: string;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  taskId: string;
  listId: string;
  title: string;
  dueDate: string;
}

export const notificationId = (type: string, taskId: string, dueDate: string) =>
  `${type}:${taskId}:${dueDate}`;

export function parseNotificationId(id: string) {
  const [type, taskId, dueDate, ...rest] = id.split(':');
  if (!type || !taskId || !dueDate || rest.length) return null;
  if (!(NOTIFICATION_TYPES as readonly string[]).includes(type)) return null;
  return { type: type as NotificationType, taskId, dueDate };
}

/**
 * Pure rule evaluation.
 *  - overdue:  status != done && dueDate <  today
 *  - due_soon: status != done && today <= dueDate <= today + 3
 * Acknowledged (taskId, type, dueDate) triples are excluded.
 */
export function computeNotifications(
  tasks: TaskLike[],
  acks: AckLike[],
  today: string,
  types: readonly NotificationType[] = NOTIFICATION_TYPES,
): NotificationItem[] {
  const acked = new Set(acks.map((a) => notificationId(a.type, a.taskId, a.dueDate)));
  const soonLimit = addDays(today, DUE_SOON_DAYS);
  const items: NotificationItem[] = [];
  for (const t of tasks) {
    if (t.status === 'done' || !t.dueDate) continue;
    let type: NotificationType | null = null;
    if (t.dueDate < today) type = 'overdue';
    else if (t.dueDate <= soonLimit) type = 'due_soon';
    if (!type || !types.includes(type)) continue;
    const id = notificationId(type, t.id, t.dueDate);
    if (acked.has(id)) continue;
    items.push({ id, type, taskId: t.id, listId: t.listId, title: t.title, dueDate: t.dueDate });
  }
  // overdue first, then by due date
  return items.sort((a, b) =>
    a.type === b.type ? a.dueDate.localeCompare(b.dueDate) : a.type === 'overdue' ? -1 : 1,
  );
}
