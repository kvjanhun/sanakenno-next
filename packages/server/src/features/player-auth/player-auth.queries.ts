import { createHash, randomBytes } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';

/** Player session lifetime: 90 days in milliseconds. */
export const PLAYER_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface PlayerSessionData {
  playerId: number;
}

/**
 * Compute SHA-256 hex digest of a raw player key or token.
 */
export function hashPlayerKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Create a new 90-day Bearer session token for the given player.
 */
export async function createPlayerSession(
  db: Kysely<Database>,
  playerId: number,
  ttlMs: number = PLAYER_SESSION_TTL_MS,
): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  await db
    .insertInto('player_sessions')
    .values({
      id: token,
      player_id: playerId,
      expires_at: expiresAt,
    })
    .execute();

  return token;
}

/**
 * Create a new player identity (64-hex player_key, SHA-256 hash stored in DB) and initial Bearer session.
 */
export async function createPlayerIdentity(db: Kysely<Database>): Promise<{
  playerId: number;
  playerKey: string;
  token: string;
}> {
  const playerKey = randomBytes(32).toString('hex');
  const playerKeyHash = hashPlayerKey(playerKey);

  try {
    await db
      .insertInto('players')
      .values({
        player_key_hash: playerKeyHash,
      })
      .execute();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('players.email')) {
      await db
        .insertInto('players')
        .values({
          player_key_hash: playerKeyHash,
          email: `legacy-${playerKeyHash}@invalid.local`,
        })
        .execute();
    } else {
      throw err;
    }
  }

  const row = await db
    .selectFrom('players')
    .select('id')
    .where('player_key_hash', '=', playerKeyHash)
    .executeTakeFirstOrThrow();

  const playerId = Number(row.id);
  const token = await createPlayerSession(db, playerId);

  return { playerId, playerKey, token };
}

/**
 * Validate a Bearer session token. Returns player session data if found and not expired.
 */
export async function validatePlayerToken(
  db: Kysely<Database>,
  token: string,
): Promise<PlayerSessionData | null> {
  const row = await db
    .selectFrom('player_sessions')
    .select(['id', 'player_id', 'expires_at'])
    .where('id', '=', token)
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  const expiresMs = Date.parse(row.expires_at);
  if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
    return null;
  }

  return { playerId: Number(row.player_id) };
}

/**
 * Delete a single player session by token.
 */
export async function deletePlayerSession(db: Kysely<Database>, token: string): Promise<void> {
  await db.deleteFrom('player_sessions').where('id', '=', token).execute();
}

/**
 * Remove all expired player sessions from the database.
 */
export async function cleanupExpiredPlayerSessions(db: Kysely<Database>): Promise<void> {
  const nowIso = new Date().toISOString();
  await db
    .deleteFrom('player_sessions')
    .where((eb) =>
      eb.or([eb('expires_at', '<=', nowIso), eb('expires_at', '<=', sql<string>`datetime('now')`)]),
    )
    .execute();
}

/**
 * Count active (non-expired) sessions for a given player ID.
 */
export async function countActivePlayerSessions(
  db: Kysely<Database>,
  playerId: number,
): Promise<number> {
  const nowIso = new Date().toISOString();
  const row = await db
    .selectFrom('player_sessions')
    .select(db.fn.count<number>('id').as('count'))
    .where('player_id', '=', playerId)
    .where((eb) =>
      eb.and([eb('expires_at', '>', nowIso), eb('expires_at', '>', sql<string>`datetime('now')`)]),
    )
    .executeTakeFirst();

  return row ? Number(row.count) : 0;
}

/**
 * Fetch a player's ID and key hash by player ID.
 */
export async function getPlayerById(
  db: Kysely<Database>,
  playerId: number,
): Promise<{ id: number; player_key_hash: string } | undefined> {
  const row = await db
    .selectFrom('players')
    .select(['id', 'player_key_hash'])
    .where('id', '=', playerId)
    .executeTakeFirst();

  if (!row) return undefined;
  return { id: Number(row.id), player_key_hash: row.player_key_hash };
}

/**
 * Fetch a player's ID and key hash by SHA-256 key hash.
 */
export async function getPlayerByKeyHash(
  db: Kysely<Database>,
  playerKeyHash: string,
): Promise<{ id: number; player_key_hash: string } | undefined> {
  const row = await db
    .selectFrom('players')
    .select(['id', 'player_key_hash'])
    .where('player_key_hash', '=', playerKeyHash)
    .executeTakeFirst();

  if (!row) return undefined;
  return { id: Number(row.id), player_key_hash: row.player_key_hash };
}

/**
 * Rotate a player's pairing code (`player_key`), update the stored SHA-256 hash,
 * and delete all other sessions for this player while keeping `currentToken` active.
 */
export async function rotatePlayerKeyAndInvalidateOtherSessions(
  db: Kysely<Database>,
  playerId: number,
  currentToken: string,
): Promise<string> {
  const newKey = randomBytes(32).toString('hex');
  const newHash = hashPlayerKey(newKey);

  await db
    .updateTable('players')
    .set({
      player_key_hash: newHash,
      updated_at: sql<string>`datetime('now')`,
    })
    .where('id', '=', playerId)
    .execute();

  await db
    .deleteFrom('player_sessions')
    .where('player_id', '=', playerId)
    .where('id', '!=', currentToken)
    .execute();

  return newKey;
}

/** 15-minute transfer ticket lifetime. */
export const TRANSFER_TICKET_TTL_MS = 15 * 60 * 1000;

function generatePairingCode(): string {
  const num = Math.floor(100000 + Math.random() * 900000).toString();
  return `${num.slice(0, 3)}-${num.slice(3)}`;
}

export function normalizePairingCode(code: string): string {
  const digits = code.replace(/\D/g, '');
  if (digits.length === 6) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return code.trim();
}

/**
 * Mint a new single-use 15-minute transfer ticket and 6-digit pairing code for a player.
 */
export async function createTransferTicket(
  db: Kysely<Database>,
  playerId: number,
  ttlMs = TRANSFER_TICKET_TTL_MS,
): Promise<{ ticket: string; code: string; expiresAt: string }> {
  const ticket = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  // Clean up expired tickets
  const nowIso = new Date().toISOString();
  await db
    .deleteFrom('player_transfer_tickets')
    .where('expires_at', '<=', nowIso)
    .execute()
    .catch(() => undefined);

  let code = generatePairingCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db
        .insertInto('player_transfer_tickets')
        .values({
          id: ticket,
          player_id: playerId,
          code,
          expires_at: expiresAt,
        })
        .execute();
      return { ticket, code, expiresAt };
    } catch {
      code = generatePairingCode();
    }
  }

  throw new Error('Yhdistämiskoodin luominen epäonnistui');
}

export interface TransferTicketRow {
  id: string;
  player_id: number;
  code: string;
  expires_at: string;
  used_at: string | null;
}

/**
 * Find a transfer ticket by 32-hex ID or 6-digit pairing code (with or without hyphen).
 */
export async function getTransferTicket(
  db: Kysely<Database>,
  tokenOrCode: string,
): Promise<TransferTicketRow | undefined> {
  const trimmed = tokenOrCode.trim();
  const normalizedCode = normalizePairingCode(trimmed);
  const unhyphenatedCode = trimmed.replace(/\D/g, '');

  const row = await db
    .selectFrom('player_transfer_tickets')
    .select(['id', 'player_id', 'code', 'expires_at', 'used_at'])
    .where((eb) =>
      eb.or([
        eb('id', '=', trimmed),
        eb('code', '=', trimmed),
        eb('code', '=', normalizedCode),
        ...(unhyphenatedCode.length === 6 ? [eb('code', '=', unhyphenatedCode)] : []),
      ]),
    )
    .executeTakeFirst();

  if (!row) return undefined;
  return {
    id: row.id,
    player_id: Number(row.player_id),
    code: row.code,
    expires_at: row.expires_at,
    used_at: row.used_at,
  };
}

/**
 * Mark a transfer ticket as consumed.
 */
export async function markTransferTicketUsed(
  db: Kysely<Database>,
  ticketId: string,
): Promise<void> {
  await db
    .updateTable('player_transfer_tickets')
    .set({
      used_at: sql<string>`datetime('now')`,
    })
    .where('id', '=', ticketId)
    .execute();
}
