import type { PrismaClient } from '@prisma/client';
import { addDays, todayIn } from './dates.js';

type Seed = [title: string, status: string, priority: string, dueOffset: number | null, description?: string];

const LISTS: { name: string; tasks: Seed[] }[] = [
  {
    name: 'Work',
    tasks: [
      ['Submit quarterly report', 'in_progress', 'high', -2, 'Numbers from finance are in the shared drive.'],
      ['Prepare sprint demo', 'todo', 'high', 0],
      ['Review pull requests', 'todo', 'medium', 2],
      ['Update onboarding docs', 'todo', 'low', 14],
      ['Send meeting notes', 'done', 'low', -1],
    ],
  },
  {
    name: 'Personal',
    tasks: [
      ['Renew passport', 'todo', 'high', -5],
      ['Book dentist appointment', 'todo', 'medium', 3],
      ['Plan weekend hike', 'in_progress', 'low', 5],
      ['Read "Designing Data-Intensive Applications"', 'in_progress', 'medium', null],
    ],
  },
  {
    name: 'Home',
    tasks: [
      ['Pay electricity bill', 'todo', 'high', 1],
      ['Fix leaking kitchen tap', 'todo', 'medium', -1],
      ['Buy groceries', 'done', 'medium', 0],
      ['Declutter garage', 'todo', 'low', 30],
    ],
  },
];

/** Creates 3 lists with tasks covering all statuses/priorities and overdue/today/soon/later dates. */
export async function createSampleData(prisma: PrismaClient, userId: string, now: Date, tz = 'UTC') {
  const today = todayIn(tz, now);
  let tasks = 0;
  for (const l of LISTS) {
    const list = await prisma.list.create({ data: { userId, name: l.name } });
    for (const [title, status, priority, offset, description] of l.tasks) {
      await prisma.task.create({
        data: {
          userId,
          listId: list.id,
          title,
          status,
          priority,
          description: description ?? '',
          dueDate: offset === null ? null : addDays(today, offset),
        },
      });
      tasks++;
    }
  }
  return { lists: LISTS.length, tasks };
}
