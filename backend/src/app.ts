import { existsSync } from 'node:fs';
import path from 'node:path';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import type { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { authRoutes } from './auth/routes.js';
import type { Providers } from './auth/providers.js';
import type { Config } from './config.js';
import { HttpError } from './lib/errors.js';
import { listRoutes } from './routes/lists.js';
import { sampleRoutes } from './routes/sample.js';
import { taskRoutes } from './routes/tasks.js';
import { NotificationHub } from './ws/hub.js';
import { wsRoutes } from './ws/routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    config: Config;
    providers: Providers;
    now: () => Date;
    hub: NotificationHub;
  }
}

export interface AppDeps {
  prisma: PrismaClient;
  config: Config;
  providers: Providers;
  now?: () => Date;
  logger?: boolean;
}

export async function buildApp({ prisma, config, providers, now = () => new Date(), logger = false }: AppDeps) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('prisma', prisma);
  app.decorate('config', config);
  app.decorate('providers', providers);
  app.decorate('now', now);
  app.decorate('hub', new NotificationHub(prisma, now, config.NOTIFY_INTERVAL_SEC));
  app.addHook('onClose', async () => app.hub.closeAll());

  app.setErrorHandler((err, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Request validation failed',
          details: err.validation.map((v) => ({
            field: (v.instancePath || '').replace(/^\//, '').replace(/\//g, '.') || undefined,
            message: v.message,
          })),
        },
      });
    }
    if (err instanceof HttpError) {
      return reply
        .code(err.statusCode)
        .send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) request.log.error({ err }, 'Unhandled error');
    return reply.code(status).send({
      error: {
        code: status >= 500 ? 'internal_error' : 'bad_request',
        message: status >= 500 ? 'Internal server error' : (err as Error).message,
      },
    });
  });

  await app.register(cookie);
  await app.register(swagger, {
    openapi: {
      info: { title: 'Todo Manager API', version: '0.1.0' },
      components: { securitySchemes: { sid: { type: 'apiKey', in: 'cookie', name: 'sid' } } },
      security: [{ sid: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  await app.register(websocket);

  await app.register(authRoutes);
  await app.register(listRoutes);
  await app.register(taskRoutes);
  await app.register(sampleRoutes);
  await app.register(wsRoutes);

  app.get('/healthz', { schema: { hide: true } }, async () => ({ ok: true }));

  if (config.STATIC_DIR && existsSync(config.STATIC_DIR)) {
    const root = path.resolve(config.STATIC_DIR);
    await app.register(fastifyStatic, { root });
    app.setNotFoundHandler((request, reply) => {
      const url = request.url;
      if (request.method === 'GET' && !url.startsWith('/api/') && !url.startsWith('/auth/') && !url.startsWith('/ws')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: { code: 'not_found', message: 'Route not found' } });
    });
  }

  return app;
}
