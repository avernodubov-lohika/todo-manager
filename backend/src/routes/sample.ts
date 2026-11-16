import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireUser } from '../auth/session.js';
import { createSampleData } from '../lib/sample.js';
import { timezoneSchema } from '../lib/schemas.js';

export const sampleRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireUser);
  app.post(
    '/api/sample-data',
    {
      schema: {
        tags: ['tasks'],
        summary: 'Create 3 sample lists with tasks (dates relative to today)',
        querystring: z.object({ tz: timezoneSchema.default('UTC') }),
        response: { 201: z.object({ lists: z.number(), tasks: z.number() }) },
      },
    },
    async (req, reply) => {
      const result = await createSampleData(app.prisma, req.user.id, app.now(), req.query.tz);
      app.hub.notifyChange(req.user.id);
      return reply.code(201).send(result);
    },
  );
};
