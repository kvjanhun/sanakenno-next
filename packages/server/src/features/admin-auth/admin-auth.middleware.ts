import { timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import { validateAdminSession, type AdminSessionData } from './admin-auth.queries.js';

export const SESSION_COOKIE = 'sanakenno_session';

export type AdminVariables = {
  admin: AdminSessionData;
  sessionId: string;
};

export async function securityHeaders(c: Context, next: Next): Promise<void> {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Cache-Control', 'no-store');
}

export function requireAdminAuth(
  db: Kysely<Database>,
): MiddlewareHandler<{ Variables: AdminVariables }> {
  return async (c: Context, next: Next) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const session = await validateAdminSession(db, sessionId);
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    c.set('admin', session);
    c.set('sessionId', sessionId);
    await next();
  };
}

export async function requireCsrf(c: Context, next: Next) {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    return next();
  }

  const admin = c.get('admin') as AdminSessionData | undefined;
  if (!admin) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = c.req.header('X-CSRF-Token');
  if (!token) {
    return c.json({ error: 'CSRF token required' }, 403);
  }

  const expected = Buffer.from(admin.csrfToken, 'utf-8');
  const received = Buffer.from(token, 'utf-8');

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return c.json({ error: 'CSRF token mismatch' }, 403);
  }

  return next();
}
