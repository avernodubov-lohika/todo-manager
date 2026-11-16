import { timingSafeEqual } from 'node:crypto';
import { generateCodeVerifier, generateState } from 'arctic';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { createSession, hashToken, requireUser, SESSION_COOKIE, SESSION_TTL_MS } from './session.js';

const STATE_COOKIE = 'oauth_state';
const VERIFIER_COOKIE = 'oauth_verifier';
const OAUTH_COOKIE_TTL_SEC = 10 * 60;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const secure = app.config.APP_URL.startsWith('https://');
  const cookieBase = { httpOnly: true, sameSite: 'lax' as const, secure };

  const fail = (reply: FastifyReply, error: string) => {
    reply.clearCookie(STATE_COOKIE, { path: '/auth' });
    reply.clearCookie(VERIFIER_COOKIE, { path: '/auth' });
    return reply.redirect(`/login?error=${encodeURIComponent(error)}`);
  };

  app.get(
    '/auth/:provider/start',
    {
      schema: {
        tags: ['auth'],
        summary: 'Begin SSO login (redirects to the identity provider)',
        params: z.object({ provider: z.string() }),
      },
    },
    async (request, reply) => {
      const provider = app.providers[request.params.provider as 'google' | 'github'];
      if (!provider) return fail(reply, 'provider_not_configured');
      const state = generateState();
      const verifier = generateCodeVerifier();
      const opts = { ...cookieBase, path: '/auth', maxAge: OAUTH_COOKIE_TTL_SEC };
      reply.setCookie(STATE_COOKIE, state, opts);
      reply.setCookie(VERIFIER_COOKIE, verifier, opts);
      return reply.redirect(provider.createAuthUrl(state, verifier).toString());
    },
  );

  app.get(
    '/auth/:provider/callback',
    {
      schema: {
        tags: ['auth'],
        summary: 'SSO callback: validates state, creates the session',
        params: z.object({ provider: z.string() }),
        querystring: z.object({
          code: z.string().optional(),
          state: z.string().optional(),
          error: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const name = request.params.provider as 'google' | 'github';
      const provider = app.providers[name];
      if (!provider) return fail(reply, 'provider_not_configured');
      const { code, state, error } = request.query;
      const cookieState = request.cookies[STATE_COOKIE];
      const verifier = request.cookies[VERIFIER_COOKIE];
      if (error) return fail(reply, 'access_denied');
      if (!code || !state || !cookieState || !verifier || !safeEqual(state, cookieState)) {
        return fail(reply, 'invalid_state');
      }
      try {
        const profile = await provider.exchange(code, verifier);
        const user = await app.prisma.user.upsert({
          where: { provider_providerUserId: { provider: name, providerUserId: profile.providerUserId } },
          create: { provider: name, ...profile },
          update: {
            email: profile.email,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
          },
        });
        const now = app.now();
        const { token } = await createSession(app.prisma, user.id, app.config.SESSION_SECRET, now);
        reply.clearCookie(STATE_COOKIE, { path: '/auth' });
        reply.clearCookie(VERIFIER_COOKIE, { path: '/auth' });
        reply.setCookie(SESSION_COOKIE, token, {
          ...cookieBase,
          path: '/',
          maxAge: SESSION_TTL_MS / 1000,
        });
        return reply.redirect('/');
      } catch (err) {
        request.log.warn({ err }, 'OAuth exchange failed');
        return fail(reply, 'oauth_failed');
      }
    },
  );

  app.post(
    '/auth/logout',
    { schema: { tags: ['auth'], summary: 'Log out (invalidates the session)' } },
    async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE];
      if (token) {
        await app.prisma.session.deleteMany({
          where: { tokenHash: hashToken(token, app.config.SESSION_SECRET) },
        });
      }
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return reply.code(204).send();
    },
  );

  app.get(
    '/api/me',
    {
      onRequest: requireUser,
      schema: {
        tags: ['auth'],
        summary: 'Current user',
        response: {
          200: z.object({
            id: z.string(),
            displayName: z.string(),
            email: z.string().nullable(),
            avatarUrl: z.string().nullable(),
            provider: z.string(),
          }),
        },
      },
    },
    async (request) => request.user,
  );
};
