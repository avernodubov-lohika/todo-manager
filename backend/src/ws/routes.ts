import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getUserFromToken, SESSION_COOKIE } from '../auth/session.js';
import { isValidTimezone } from '../lib/dates.js';
import { defaultSettings, type Conn } from './hub.js';
import { NOTIFICATION_TYPES } from './notifications.js';

const clientMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('subscribe'),
    types: z.array(z.enum(NOTIFICATION_TYPES)).max(NOTIFICATION_TYPES.length).optional(),
    intervalSec: z.number().int().min(10).max(3600).optional(),
    timezone: z.string().refine(isValidTimezone, 'Invalid IANA timezone').optional(),
  }),
  z.object({ type: z.literal('ack'), ids: z.array(z.string()).max(500) }),
]);

export const wsRoutes: FastifyPluginAsync = async (app) => {
  const allowedOrigin = new URL(app.config.APP_URL).origin;

  app.get('/ws', { websocket: true, schema: { hide: true } }, (socket, request) => {
    const authenticate = async (): Promise<Conn | null> => {
      if (request.headers.origin !== allowedOrigin) {
        socket.close(4403, 'Forbidden origin');
        return null;
      }
      const user = await getUserFromToken(
        app.prisma,
        request.cookies[SESSION_COOKIE],
        app.config.SESSION_SECRET,
        app.now(),
      );
      if (!user) {
        socket.close(4401, 'Unauthorized');
        return null;
      }
      const conn: Conn = { socket, user, settings: defaultSettings(app.hub.defaultIntervalSec) };
      app.hub.add(conn);
      app.hub.send(conn, {
        type: 'hello',
        user: { id: user.id, displayName: user.displayName },
        settings: conn.settings,
      });
      await app.hub.sendBatch(conn, 'initial');
      return conn;
    };

    // Listeners must be attached synchronously; work is serialised through `queue`.
    let queue: Promise<unknown> = Promise.resolve();
    const ready = authenticate().catch((err) => {
      request.log.error({ err }, 'ws auth failed');
      socket.close(1011, 'Internal error');
      return null;
    });
    let conn: Conn | null = null;
    queue = queue.then(() => ready).then((c) => (conn = c));

    socket.on('message', (raw: Buffer) => {
      queue = queue.then(async () => {
        const c = conn;
        if (!c) return;
        try {
          const msg = clientMessage.safeParse(JSON.parse(raw.toString()));
          if (!msg.success) {
            app.hub.send(c, {
              type: 'error',
              code: 'invalid_message',
              message: msg.error.issues.map((i) => `${i.path.join('.') || 'message'}: ${i.message}`).join('; '),
            });
            return;
          }
          const m = msg.data;
          if (m.type === 'subscribe') {
            c.settings = {
              types: m.types ?? c.settings.types,
              intervalSec: m.intervalSec ?? c.settings.intervalSec,
              timezone: m.timezone ?? c.settings.timezone,
            };
            app.hub.schedule(c);
            app.hub.send(c, { type: 'subscribed', settings: c.settings });
            await app.hub.sendBatch(c, 'initial');
          } else {
            const ids = await app.hub.ack(c.user.id, m.ids);
            app.hub.send(c, { type: 'ack_ok', ids });
          }
        } catch (err) {
          const isJson = err instanceof SyntaxError;
          if (!isJson) request.log.error({ err }, 'ws message failed');
          app.hub.send(c, {
            type: 'error',
            code: isJson ? 'invalid_json' : 'internal',
            message: isJson ? 'Message must be valid JSON' : 'Internal error',
          });
        }
      });
    });

    socket.on('close', () => {
      void ready.then((c) => c && app.hub.remove(c));
    });
  });
};
