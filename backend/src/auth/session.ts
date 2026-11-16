import { createHmac, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { HttpError } from '../lib/errors.js';

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  provider: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

export function hashToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

export async function createSession(
  prisma: PrismaClient,
  userId: string,
  secret: string,
  now: Date,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { tokenHash: hashToken(token, secret), userId, expiresAt },
  });
  return { token, expiresAt };
}

export async function getUserFromToken(
  prisma: PrismaClient,
  token: string | undefined,
  secret: string,
  now: Date,
): Promise<AuthUser | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token, secret) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= now) return null;
  const u = session.user;
  return {
    id: u.id,
    displayName: u.displayName,
    email: u.email,
    avatarUrl: u.avatarUrl,
    provider: u.provider,
  };
}

export async function requireUser(this: unknown, request: FastifyRequest, _reply: FastifyReply) {
  const app = request.server;
  const user = await getUserFromToken(
    app.prisma,
    request.cookies[SESSION_COOKIE],
    app.config.SESSION_SECRET,
    app.now(),
  );
  if (!user) throw new HttpError(401, 'unauthorized', 'Authentication required');
  request.user = user;
}
