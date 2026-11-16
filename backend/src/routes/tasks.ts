import type { Prisma } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireUser } from '../auth/session.js';
import { addDays, todayIn } from '../lib/dates.js';
import { notFound } from '../lib/errors.js';
import {
  dueDateSchema,
  idParams,
  prioritySchema,
  serializeTask,
  statusSchema,
  taskSchema,
  timezoneSchema,
} from '../lib/schemas.js';

const query = z.object({
  listId: z.string().optional(),
  q: z.string().trim().max(200).optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  due: z.enum(['overdue', 'today', 'week', 'all']).default('all'),
  tz: timezoneSchema.default('UTC'),
});

const title = z.string().trim().min(1, 'Title is required').max(200);
const description = z.string().max(5000);

const createBody = z.object({
  listId: z.string().min(1),
  title,
  description: description.default(''),
  status: statusSchema.default('todo'),
  priority: prioritySchema.default('medium'),
  dueDate: dueDateSchema.nullable().default(null),
});

const updateBody = z
  .object({
    listId: z.string().min(1),
    title,
    description,
    status: statusSchema,
    priority: prioritySchema,
    dueDate: dueDateSchema.nullable(),
  })
  .partial();

export const taskRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireUser);
  const tags = ['tasks'];

  const assertOwnsList = async (listId: string, userId: string) => {
    const list = await app.prisma.list.findFirst({ where: { id: listId, userId }, select: { id: true } });
    if (!list) throw notFound('List');
  };

  app.get(
    '/api/tasks',
    {
      schema: {
        tags,
        summary: 'Search and filter tasks',
        description:
          'Due categories are relative to "today" in the IANA timezone given by `tz`: ' +
          '`overdue` = before today and not done, `today`, `week` = today through +6 days.',
        querystring: query,
        response: { 200: z.array(taskSchema) },
      },
    },
    async (req) => {
      const { listId, q, status, priority, due, tz } = req.query;
      const today = todayIn(tz, app.now());
      const where: Prisma.TaskWhereInput = { userId: req.user.id };
      if (listId) where.listId = listId;
      if (status) where.status = status;
      if (priority) where.priority = priority;
      if (q) where.OR = [{ title: { contains: q } }, { description: { contains: q } }];
      if (due === 'overdue') {
        where.dueDate = { lt: today };
        where.status = status ?? { not: 'done' };
      } else if (due === 'today') where.dueDate = today;
      else if (due === 'week') where.dueDate = { gte: today, lte: addDays(today, 6) };
      const tasks = await app.prisma.task.findMany({
        where,
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      });
      return tasks.map(serializeTask);
    },
  );

  app.post(
    '/api/tasks',
    { schema: { tags, summary: 'Create a task', body: createBody, response: { 201: taskSchema } } },
    async (req, reply) => {
      await assertOwnsList(req.body.listId, req.user.id);
      const task = await app.prisma.task.create({ data: { ...req.body, userId: req.user.id } });
      app.hub.notifyChange(req.user.id);
      return reply.code(201).send(serializeTask(task));
    },
  );

  app.patch(
    '/api/tasks/:id',
    {
      schema: {
        tags,
        summary: 'Partially update a task (also used for quick status change)',
        params: idParams,
        body: updateBody,
        response: { 200: taskSchema },
      },
    },
    async (req) => {
      const existing = await app.prisma.task.findFirst({ where: { id: req.params.id, userId: req.user.id } });
      if (!existing) throw notFound('Task');
      if (req.body.listId && req.body.listId !== existing.listId) {
        await assertOwnsList(req.body.listId, req.user.id);
      }
      const task = await app.prisma.task.update({ where: { id: existing.id }, data: req.body });
      app.hub.notifyChange(req.user.id);
      return serializeTask(task);
    },
  );

  app.delete(
    '/api/tasks/:id',
    { schema: { tags, summary: 'Delete a task', params: idParams, response: { 204: z.null() } } },
    async (req, reply) => {
      const { count } = await app.prisma.task.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
      if (!count) throw notFound('Task');
      app.hub.notifyChange(req.user.id);
      return reply.code(204).send(null);
    },
  );
};
