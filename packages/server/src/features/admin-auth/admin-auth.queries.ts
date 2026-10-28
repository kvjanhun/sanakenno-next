import { randomBytes } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';

export const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AdminSessionData {
  adminId: number;
  username: string;
  csrfToken: string;
}

export async function getAdminByUsername(db: Kysely<Database>, username: string) {
  return db.selectFrom('admins').selectAll().where('username', '=', username).executeTakeFirst();
}

export async function getAdminById(db: Kysely<Database>, id: number) {
  return db.selectFrom('admins').selectAll().where('id', '=', id).executeTakeFirst();
}

export async function createAdminUser(
  db: Kysely<Database>,
  username: string,
  passwordHash: string,
): Promise<number> {
  const result = await db
    .insertInto('admins')
    .values({
      username,
      password_hash: passwordHash,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return Number(result.id);
}

export async function updateAdminPassword(
  db: Kysely<Database>,
  adminId: number,
  passwordHash: string,
): Promise<void> {
  await db
    .updateTable('admins')
    .set({ password_hash: passwordHash })
    .where('id', '=', adminId)
    .execute();
}

export async function createAdminSession(
  db: Kysely<Database>,
  adminId: number,
): Promise<{ sessionId: string; csrfToken: string }> {
  const sessionId = randomBytes(32).toString('hex');
  const csrfToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS).toISOString();

  await db
    .insertInto('sessions')
    .values({
      id: sessionId,
      admin_id: adminId,
      csrf_token: csrfToken,
      expires_at: expiresAt,
    })
    .execute();

  return { sessionId, csrfToken };
}

export async function validateAdminSession(
  db: Kysely<Database>,
  sessionId: string,
): Promise<AdminSessionData | null> {
  const row = await db
    .selectFrom('sessions as s')
    .innerJoin('admins as a', 'a.id', 's.admin_id')
    .select(['s.id', 's.admin_id', 's.csrf_token', 's.expires_at', 'a.username'])
    .where('s.id', '=', sessionId)
    .executeTakeFirst();

  if (!row) return null;

  const expiresMs = Date.parse(row.expires_at);
  if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
    return null;
  }

  return {
    adminId: Number(row.admin_id),
    username: row.username,
    csrfToken: row.csrf_token,
  };
}

export async function deleteAdminSession(db: Kysely<Database>, sessionId: string): Promise<void> {
  await db.deleteFrom('sessions').where('id', '=', sessionId).execute();
}

export async function deleteSessionsForAdmin(
  db: Kysely<Database>,
  adminId: number,
  exceptSessionId?: string,
): Promise<void> {
  let query = db.deleteFrom('sessions').where('admin_id', '=', adminId);
  if (exceptSessionId) {
    query = query.where('id', '!=', exceptSessionId);
  }
  await query.execute();
}

export async function cleanupExpiredAdminSessions(db: Kysely<Database>): Promise<void> {
  const nowIso = new Date().toISOString();
  await db.deleteFrom('sessions').where('expires_at', '<=', nowIso).execute();
}

export async function insertAdminLog(
  db: Kysely<Database>,
  adminId: number,
  action: string,
  detail?: string | null,
): Promise<void> {
  await db
    .insertInto('admin_log')
    .values({
      admin_id: adminId,
      action,
      detail: detail ?? null,
    })
    .execute();
}
