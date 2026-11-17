import { zValidator } from '@hono/zod-validator';
import { AdminChangePasswordPayloadSchema, AdminLoginPayloadSchema } from '@sanakenno/shared';
import argon2 from 'argon2';
import { Hono, type Context, type Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Kysely } from 'kysely';
import { runImmediateTransactionWithRetry } from '../../db/connection.js';
import type { Database } from '../../db/schema.js';
import { zodErrorHook } from '../../lib/zod-validator.js';
import { getClientIp, SlidingWindowRateLimiter } from '../player-auth/rate-limiter.js';
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

const LOGIN_RATE_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const loginLimiter = new SlidingWindowRateLimiter({
  windowMs: LOGIN_WINDOW_MS,
  maxRequests: LOGIN_RATE_LIMIT,
});

export function resetLoginRateLimit(): void {
  loginLimiter.reset();
}

function loginRateLimiter(c: Context, next: Next) {
  const ip = getClientIp(c);
  if (!loginLimiter.isAllowed(ip)) {
    return c.json({ error: 'Liian monta yritystä, odota hetki' }, 429);
  }
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
    .post(
      '/login',
      loginRateLimiter,
      zValidator(
        'json',
        AdminLoginPayloadSchema,
        zodErrorHook('Käyttäjätunnus ja salasana vaaditaan'),
      ),
      async (c) => {
        const { username, password } = c.req.valid('json');

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
      },
    )
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
    .post(
      '/change-password',
      authMiddleware,
      requireCsrf,
      zValidator(
        'json',
        AdminChangePasswordPayloadSchema,
        zodErrorHook((err) => {
          const issue = err.issues[0];
          if (
            issue?.path[0] === 'newPassword' &&
            issue.code === 'too_small' &&
            issue.minimum === 12
          ) {
            return { error: 'Uuden salasanan on oltava vähintään 12 merkkiä' };
          }
          return { error: 'Molemmat salasanat vaaditaan' };
        }),
      ),
      async (c) => {
        const admin = c.get('admin');
        const sessionId = c.get('sessionId');
        const { currentPassword, newPassword } = c.req.valid('json');

        const adminRow = await getAdminById(db, admin.adminId);
        if (!adminRow) {
          return c.json({ error: 'Käyttäjää ei löydy' }, 404);
        }

        const valid = await argon2
          .verify(adminRow.password_hash, currentPassword)
          .catch(() => false);
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
      },
    );
}
