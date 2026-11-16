import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireUser } from '../auth/session.js';
import { notFound } from '../lib/errors.js';
import { idParams } from '../lib/schemas.js';

const listSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  taskCount: z.number(),
});
const body = z.object({ name: z.string().trim().min(1).max(100) });

export const listRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireUser);
  const tags = ['lists'];

  const toDto = (l: { id: string; name: string; createdAt: Date; _count: { tasks: number } }) => ({
    id: l.id,
    name: l.name,
    createdAt: l.createdAt.toISOString(),
    taskCount: l._count.tasks,
  });

  app.get(
    '/api/lists',
    { schema: { tags, summary: 'List all lists with task counts', response: { 200: z.array(listSchema) } } },
    async (req) => {
      const lists = await app.prisma.list.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { tasks: true } } },
      });
      return lists.map(toDto);
    },
  );

  app.post(
    '/api/lists',
    { schema: { tags, summary: 'Create a list', body, response: { 201: listSchema } } },
    async (req, reply) => {
      const list = await app.prisma.list.create({
        data: { userId: req.user.id, name: req.body.name },
        include: { _count: { select: { tasks: true } } },
      });
      return reply.code(201).send(toDto(list));
    },
  );

  app.patch(
    '/api/lists/:id',
    { schema: { tags, summary: 'Rename a list', params: idParams, body, response: { 200: listSchema } } },
    async (req) => {
      const existing = await app.prisma.list.findFirst({ where: { id: req.params.id, userId: req.user.id } });
      if (!existing) throw notFound('List');
      return toDto(
        await app.prisma.list.update({
          where: { id: existing.id },
          data: { name: req.body.name },
          include: { _count: { select: { tasks: true } } },
        }),
      );
    },
  );

  app.delete(
    '/api/lists/:id',
    {
      schema: {
        tags,
        summary: 'Delete a list and (cascade) all of its tasks',
        params: idParams,
        response: { 200: z.object({ id: z.string(), deletedTasks: z.number() }) },
      },
    },
    async (req) => {
      const existing = await app.prisma.list.findFirst({
        where: { id: req.params.id, userId: req.user.id },
        include: { _count: { select: { tasks: true } } },
      });
      if (!existing) throw notFound('List');
      await app.prisma.list.delete({ where: { id: existing.id } });
      app.hub.notifyChange(req.user.id);
      return { id: existing.id, deletedTasks: existing._count.tasks };
    },
  );
};
