import type { Kysely } from 'kysely';
import type { Database } from './schema.js';

export interface ImmediateTransactionOptions {
  maxRetries?: number;
  retryDelayMs?: number;
}

const RETRYABLE_ERROR_CODES = new Set([
  'SQLITE_BUSY',
  'SQLITE_BUSY_SNAPSHOT',
  'SQLITE_BUSY_TIMEOUT',
  'SQLITE_LOCKED',
  'STREAM_EXPIRED',
  'HRANA_STREAM_EXPIRED',
]);

/**
 * Return true for definite pre-commit SQLite/libSQL contention or Hrana stream-expiry errors
 * that are safe to retry. Intentionally excludes `HRANA_CLOSED_ERROR` because a post-commit
 * transport drop could double-apply non-idempotent writes.
 */
export function isSqliteBusyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: unknown }).code;
  if (typeof code === 'string' && RETRYABLE_ERROR_CODES.has(code)) {
    return true;
  }

  return (
    error.message.includes('SQLITE_BUSY') ||
    error.message.includes('SQLITE_LOCKED') ||
    error.message.includes('STREAM_EXPIRED') ||
    error.message.includes('database is locked')
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a Kysely `BEGIN IMMEDIATE` transaction with transient contention/stream-expiry retry backoff.
 */
export async function runImmediateTransactionWithRetry<T>(
  db: Kysely<Database>,
  work: (trx: Kysely<Database>) => Promise<T>,
  options: ImmediateTransactionOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 4;
  const retryDelayMs = options.retryDelayMs ?? 50;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await db.transaction().execute((trx) => work(trx));
    } catch (error) {
      if (!isSqliteBusyError(error) || attempt >= maxRetries) {
        throw error;
      }
      const jitterMs = Math.floor(Math.random() * retryDelayMs);
      await delay(retryDelayMs * (attempt + 1) + jitterMs);
    }
  }
}
