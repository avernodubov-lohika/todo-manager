import { describe, expect, it } from 'vitest';
import { computeNotifications, parseNotificationId } from '../src/ws/notifications.js';

const today = '2026-06-15';
const task = (id: string, dueDate: string | null, status = 'todo') => ({
  id,
  listId: 'l1',
  title: `Task ${id}`,
  status,
  dueDate,
});

describe('computeNotifications', () => {
  it('classifies overdue / due_soon with inclusive boundaries', () => {
    const items = computeNotifications(
      [
        task('yesterday', '2026-06-14'),
        task('today', '2026-06-15'),
        task('plus3', '2026-06-18'),
        task('plus4', '2026-06-19'),
        task('none', null),
      ],
      [],
      today,
    );
    expect(items.map((i) => [i.taskId, i.type])).toEqual([
      ['yesterday', 'overdue'],
      ['today', 'due_soon'],
      ['plus3', 'due_soon'],
    ]);
  });

  it('excludes done tasks', () => {
    expect(computeNotifications([task('a', '2026-06-01', 'done'), task('b', '2026-06-16', 'done')], [], today)).toEqual([]);
  });

  it('includes in_progress tasks', () => {
    expect(computeNotifications([task('a', '2026-06-01', 'in_progress')], [], today)).toHaveLength(1);
  });

  it('builds ids as type:taskId:dueDate', () => {
    const [item] = computeNotifications([task('abc', '2026-06-01')], [], today);
    expect(item.id).toBe('overdue:abc:2026-06-01');
  });

  it('excludes acknowledged items, but a changed due date invalidates the ack', () => {
    const acks = [{ taskId: 'a', type: 'overdue', dueDate: '2026-06-01' }];
    expect(computeNotifications([task('a', '2026-06-01')], acks, today)).toEqual([]);
    expect(computeNotifications([task('a', '2026-06-02')], acks, today)).toHaveLength(1);
  });

  it('filters by requested types', () => {
    const tasks = [task('o', '2026-06-01'), task('s', '2026-06-16')];
    expect(computeNotifications(tasks, [], today, ['overdue']).map((i) => i.taskId)).toEqual(['o']);
    expect(computeNotifications(tasks, [], today, ['due_soon']).map((i) => i.taskId)).toEqual(['s']);
    expect(computeNotifications(tasks, [], today, [])).toEqual([]);
  });

  it('handles month/year rollover', () => {
    const items = computeNotifications([task('a', '2027-01-02')], [], '2026-12-30');
    expect(items[0]?.type).toBe('due_soon');
  });
});

describe('parseNotificationId', () => {
  it('parses valid ids and rejects malformed ones', () => {
    expect(parseNotificationId('overdue:t1:2026-06-01')).toEqual({ type: 'overdue', taskId: 't1', dueDate: '2026-06-01' });
    expect(parseNotificationId('bogus:t1:2026-06-01')).toBeNull();
    expect(parseNotificationId('overdue:t1')).toBeNull();
    expect(parseNotificationId('overdue:t1:2026-06-01:x')).toBeNull();
  });
});
