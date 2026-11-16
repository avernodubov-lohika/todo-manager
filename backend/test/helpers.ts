import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { inject } from 'vitest';
import { buildApp } from '../src/app.js';
import type { OAuthProvider, Profile, Providers } from '../src/auth/providers.js';
import { configSchema } from '../src/config.js';

export const APP_URL = 'http://localhost:5173';

export const profiles: Record<string, Profile> = {
  'google-alice': { providerUserId: 'g-1', email: 'alice@example.com', displayName: 'Alice', avatarUrl: 'https://img/alice.png' },
  'github-bob': { providerUserId: '42', email: 'bob@example.com', displayName: 'Bob', avatarUrl: 'https://img/bob.png' },
  'google-carol': { providerUserId: 'g-2', email: 'carol@example.com', displayName: 'Carol', avatarUrl: null },
};

function stubProvider(name: string): OAuthProvider {
  return {
    createAuthUrl: (state) => new URL(`https://idp.example/${name}/authorize?state=${state}`),
    async exchange(code) {
      const p = profiles[code];
      if (!p) throw new Error('bad code');
      return p;
    },
  };
}

export const stubProviders: Providers = { google: stubProvider('google'), github: stubProvider('github') };

export class Clock {
  constructor(public current: Date) {}
  now = () => this.current;
  set(iso: string) {
    this.current = new Date(iso);
  }
}

export interface TestCtx {
  app: FastifyInstance;
  prisma: PrismaClient;
  clock: Clock;
}

export async function createTestApp(nowIso = '2026-06-15T12:00:00Z', env: Record<string, string> = {}): Promise<TestCtx> {
  const prisma = new PrismaClient({ datasourceUrl: inject('dbUrl') });
  for (const m of ['notificationAck', 'task', 'list', 'session', 'user'] as const) {
    await (prisma[m] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  const clock = new Clock(new Date(nowIso));
  const config = configSchema.parse({ SESSION_SECRET: 'test-secret-test-secret', APP_URL, ...env });
  const app = await buildApp({ prisma, config, providers: stubProviders, now: clock.now });
  await app.ready();
  return { app, prisma, clock };
}

export async function closeTestApp({ app, prisma }: TestCtx) {
  await app.close();
  await prisma.$disconnect();
}

function cookiesFrom(res: { cookies: { name: string; value: string }[] }) {
  return Object.fromEntries(res.cookies.map((c) => [c.name, c.value]));
}

/** Runs the full SSO flow against the stub provider and returns the `sid` cookie header. */
export async function login(app: FastifyInstance, provider: 'google' | 'github', code: string): Promise<string> {
  const start = await app.inject({ method: 'GET', url: `/auth/${provider}/start` });
  const c = cookiesFrom(start);
  const state = new URL(start.headers.location as string).searchParams.get('state')!;
  const cb = await app.inject({
    method: 'GET',
    url: `/auth/${provider}/callback?code=${code}&state=${state}`,
    headers: { cookie: `oauth_state=${c.oauth_state}; oauth_verifier=${c.oauth_verifier}` },
  });
  const sid = cookiesFrom(cb).sid;
  if (!sid) throw new Error(`login failed: ${cb.statusCode} ${cb.headers.location}`);
  return `sid=${sid}`;
}

export const loginAlice = (app: FastifyInstance) => login(app, 'google', 'google-alice');
export const loginBob = (app: FastifyInstance) => login(app, 'github', 'github-bob');

export { cookiesFrom };
