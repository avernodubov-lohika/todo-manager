import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, cookiesFrom, createTestApp, login, profiles, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => (ctx = await createTestApp()));
afterAll(() => closeTestApp(ctx));

describe.each([
  ['google', 'google-alice', 'g-1'],
  ['github', 'github-bob', '42'],
] as const)('SSO via %s', (provider, code, providerUserId) => {
  it('creates the user and a session, and /api/me returns the profile', async () => {
    const cookie = await login(ctx.app, provider, code);

    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { provider_providerUserId: { provider, providerUserId } },
    });
    const p = profiles[code];
    expect(user).toMatchObject({ email: p.email, displayName: p.displayName, avatarUrl: p.avatarUrl });

    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ provider, email: p.email, displayName: p.displayName });
  });

  it('logging in again reuses the same user row', async () => {
    await login(ctx.app, provider, code);
    expect(await ctx.prisma.user.count({ where: { provider, providerUserId } })).toBe(1);
  });
});

describe('SSO safety', () => {
  it('start sets httpOnly state + verifier cookies and redirects to the IdP', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/auth/google/start' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('https://idp.example/google/authorize');
    for (const c of res.cookies) expect(c.httpOnly).toBe(true);
    expect(Object.keys(cookiesFrom(res)).sort()).toEqual(['oauth_state', 'oauth_verifier']);
  });

  it('rejects a callback with a mismatching state', async () => {
    const start = await ctx.app.inject({ method: 'GET', url: '/auth/google/start' });
    const c = cookiesFrom(start);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/auth/google/callback?code=google-alice&state=forged',
      headers: { cookie: `oauth_state=${c.oauth_state}; oauth_verifier=${c.oauth_verifier}` },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/login?error=invalid_state');
    expect(cookiesFrom(res).sid).toBeUndefined();
  });

  it('rejects a callback without cookies', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/auth/github/callback?code=github-bob&state=x' });
    expect(res.headers.location).toBe('/login?error=invalid_state');
  });

  it('redirects with an error when the code exchange fails', async () => {
    const start = await ctx.app.inject({ method: 'GET', url: '/auth/google/start' });
    const c = cookiesFrom(start);
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/auth/google/callback?code=nope&state=${c.oauth_state}`,
      headers: { cookie: `oauth_state=${c.oauth_state}; oauth_verifier=${c.oauth_verifier}` },
    });
    expect(res.headers.location).toBe('/login?error=oauth_failed');
  });

  it('unknown provider redirects to login with an error', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/auth/twitter/start' });
    expect(res.headers.location).toBe('/login?error=provider_not_configured');
  });

  it('logout invalidates the session', async () => {
    const cookie = await login(ctx.app, 'google', 'google-alice');
    const out = await ctx.app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(204);
    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
    expect(me.json().error.code).toBe('unauthorized');
  });

  it('expired sessions are rejected', async () => {
    const cookie = await login(ctx.app, 'google', 'google-alice');
    ctx.clock.set('2026-08-01T00:00:00Z'); // > 30 days later
    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
    ctx.clock.set('2026-06-15T12:00:00Z');
  });
});
