import argon2 from 'argon2';
import { Hono, type Context, type Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Kysely } from 'kysely';
import { runImmediateTransactionWithRetry } from '../../db/connection.js';
import type { Database } from '../../db/schema.js';
import {
  requireAdminAuth,
  requireCsrf,
  securityHeaders,
  SESSION_COOKIE,
  type AdminVariables,
} from './admin-auth.middleware.js';
import {
  cleanupExpiredAdminSessions,
  createAdminSession,
  deleteAdminSession,
  deleteSessionsForAdmin,
  getAdminById,
  getAdminByUsername,
  insertAdminLog,
  updateAdminPassword,
} from './admin-auth.queries.js';

const loginRateLimitMap = new Map<string, number>();
const LOGIN_RATE_LIMIT = 5;

export function resetLoginRateLimit(): void {
  loginRateLimitMap.clear();
}

function getClientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown'
  );
}

function loginRateLimiter(c: Context, next: Next) {
  const ip = getClientIp(c);
  const count = loginRateLimitMap.get(ip) || 0;
  if (count >= LOGIN_RATE_LIMIT) {
    return c.json({ error: 'Liian monta yritystä, odota hetki' }, 429);
  }
  loginRateLimitMap.set(ip, count + 1);
  return next();
}

const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$dW5rbm93bg$dW5rbm93bg';

function setSessionCookie(c: Context, sessionId: string): void {
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
}

export function createAdminAuthRoutes(db: Kysely<Database>) {
  const authMiddleware = requireAdminAuth(db);

  return new Hono<{ Variables: AdminVariables }>()
    .use('*', securityHeaders)
    .post('/login', loginRateLimiter, async (c) => {
      let body: Record<string, unknown> = {};
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Virheellinen pyyntö' }, 400);
      }

      const username = typeof body['username'] === 'string' ? body['username'].trim() : '';
      const password = typeof body['password'] === 'string' ? body['password'] : '';

      if (!username || !password) {
        return c.json({ error: 'Käyttäjätunnus ja salasana vaaditaan' }, 400);
      }

      const admin = await getAdminByUsername(db, username);
      const hash = admin?.password_hash ?? DUMMY_HASH;
      const valid = await argon2.verify(hash, password).catch(() => false);

      if (!admin || !valid) {
        return c.json({ error: 'Virheellinen käyttäjätunnus tai salasana' }, 401);
      }

      const { sessionId, csrfToken } = await runImmediateTransactionWithRetry(db, async (trx) => {
        await cleanupExpiredAdminSessions(trx);
        const session = await createAdminSession(trx, Number(admin.id));
        await insertAdminLog(trx, Number(admin.id), 'login');
        return session;
      });

      setSessionCookie(c, sessionId);
      return c.json({ status: 'ok' as const, csrfToken, username: admin.username }, 200);
    })
    .post('/logout', async (c) => {
      const sessionId = getCookie(c, SESSION_COOKIE);
      if (sessionId) {
        await deleteAdminSession(db, sessionId);
      }
      deleteCookie(c, SESSION_COOKIE, { path: '/' });
      return c.json({ status: 'ok' as const }, 200);
    })
    .get('/session', authMiddleware, (c) => {
      const admin = c.get('admin');
      return c.json(
        {
          authenticated: true as const,
          username: admin.username,
          csrfToken: admin.csrfToken,
        },
        200,
      );
    })
    .post('/change-password', authMiddleware, requireCsrf, async (c) => {
      const admin = c.get('admin');
      const sessionId = c.get('sessionId');

      let body: Record<string, unknown> = {};
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Virheellinen pyyntö' }, 400);
      }

      const currentPassword =
        typeof body['currentPassword'] === 'string' ? body['currentPassword'] : '';
      const newPassword = typeof body['newPassword'] === 'string' ? body['newPassword'] : '';

      if (!currentPassword || !newPassword) {
        return c.json({ error: 'Molemmat salasanat vaaditaan' }, 400);
      }

      if (newPassword.length < 12) {
        return c.json({ error: 'Uuden salasanan on oltava vähintään 12 merkkiä' }, 400);
      }

      const adminRow = await getAdminById(db, admin.adminId);
      if (!adminRow) {
        return c.json({ error: 'Käyttäjää ei löydy' }, 404);
      }

      const valid = await argon2.verify(adminRow.password_hash, currentPassword).catch(() => false);
      if (!valid) {
        return c.json({ error: 'Nykyinen salasana on väärin' }, 400);
      }

      const newHash = await argon2.hash(newPassword);
      await runImmediateTransactionWithRetry(db, async (trx) => {
        await updateAdminPassword(trx, admin.adminId, newHash);
        await deleteSessionsForAdmin(trx, admin.adminId, sessionId);
        await insertAdminLog(trx, admin.adminId, 'change_password');
      });

      return c.json({ status: 'ok' as const }, 200);
    });
}
