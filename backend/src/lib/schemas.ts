import { z } from 'zod';
import { isValidTimezone } from './dates.js';

export const STATUSES = ['todo', 'in_progress', 'done'] as const;
export const PRIORITIES = ['low', 'medium', 'high'] as const;

export const statusSchema = z.enum(STATUSES);
export const prioritySchema = z.enum(PRIORITIES);
export const dueDateSchema = z.iso.date();
export const timezoneSchema = z.string().refine(isValidTimezone, 'Invalid IANA timezone');
export const idParams = z.object({ id: z.string().min(1) });

export const taskSchema = z.object({
  id: z.string(),
  listId: z.string(),
  title: z.string(),
  description: z.string(),
  status: statusSchema,
  priority: prioritySchema,
  dueDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});

export function serializeTask(t: {
  id: string;
  listId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  dueDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: t.id,
    listId: t.listId,
    title: t.title,
    description: t.description,
    status: t.status as (typeof STATUSES)[number],
    priority: t.priority as (typeof PRIORITIES)[number],
    dueDate: t.dueDate,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
