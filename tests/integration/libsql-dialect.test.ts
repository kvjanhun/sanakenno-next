import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient, type TransactionMode } from '@libsql/client';
import { Kysely } from 'kysely';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../packages/server/src/app.js';
import {
  ASYNC_MIGRATIONS,
  runMigrationsAsync,
} from '../../packages/server/src/db/async-migrations.js';
import {
  checkpointAndDestroyDb,
  initDb,
  runImmediateTransactionWithRetry,
} from '../../packages/server/src/db/connection.js';
import { LibsqlConnection, LibsqlDialect } from '../../packages/server/src/db/libsql-dialect.js';
import type { Database } from '../../packages/server/src/db/schema.js';
import { seedDatabase } from '../../packages/server/src/db/seed.js';

const tempDirs: string[] = [];

function createTempFileUrl(name: string): { dir: string; filePath: string; url: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanakenno-libsql-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, name);
  return { dir, filePath, url: `file:${filePath}` };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('LibsqlDialect & Async Migrations Integration', () => {
  it('applies baseline schema and migrations idempotently with a single-query fast path on re-run', async () => {
    const client = createClient({ url: ':memory:' });
    const db = new Kysely<Database>({
      dialect: new LibsqlDialect({ client }),
    });

    try {
      const firstRunApplied = await runMigrationsAsync(db);
      expect(firstRunApplied).toBe(true);

      const appliedRows = await db
        .selectFrom('schema_migrations')
        .select('version')
        .orderBy('version', 'asc')
        .execute();
      expect(appliedRows.map((r) => r.version)).toEqual(ASYNC_MIGRATIONS.map((m) => m.version));

      // Second run must execute only the single schema_migrations check and return false
      const executeSpy = vi.spyOn(client, 'execute');
      const secondRunApplied = await runMigrationsAsync(db);
      expect(secondRunApplied).toBe(false);
      expect(executeSpy).toHaveBeenCalledTimes(1);
    } finally {
      await checkpointAndDestroyDb(db, 'kysely-libsql');
    }
  });

  it('returns plain JS objects, supports .returning("id"), and reports numDeletedRows', async () => {
    const client = createClient({ url: ':memory:' });
    const db = new Kysely<Database>({
      dialect: new LibsqlDialect({ client }),
    });

    try {
      await runMigrationsAsync(db);

      const inserted = await db
        .insertInto('players')
        .values({ player_key_hash: 'hash-plain-test', preferences: '{"theme":"dark"}' })
        .returning('id')
        .executeTakeFirstOrThrow();

      expect(typeof inserted.id).toBe('number');
      expect(inserted.id).toBeGreaterThan(0);

      const fetched = await db
        .selectFrom('players')
        .select(['id', 'player_key_hash', 'preferences'])
        .where('id', '=', inserted.id)
        .executeTakeFirstOrThrow();

      expect(Object.getPrototypeOf(fetched)).toBe(Object.prototype);
      expect(Object.keys(fetched).sort()).toEqual(['id', 'player_key_hash', 'preferences']);
      expect(fetched).toEqual({
        id: inserted.id,
        player_key_hash: 'hash-plain-test',
        preferences: '{"theme":"dark"}',
      });

      const deleted = await db
        .deleteFrom('players')
        .where('id', '=', inserted.id)
        .executeTakeFirst();
      expect(deleted.numDeletedRows).toBe(1n);
    } finally {
      await db.destroy();
    }
  });

  it('commits interactive write transactions and rolls back on thrown errors', async () => {
    const { url } = createTempFileUrl('tx.db');
    const { db, engine } = await initDb({ TURSO_DATABASE_URL: url });
    expect(engine).toBe('kysely-libsql');

    try {
      await db.transaction().execute(async (trx) => {
        await trx.insertInto('config').values({ key: 'tx_committed', value: 'yes' }).execute();
      });

      const committed = await db
        .selectFrom('config')
        .select('value')
        .where('key', '=', 'tx_committed')
        .executeTakeFirst();
      expect(committed?.value).toBe('yes');

      await expect(
        db.transaction().execute(async (trx) => {
          await trx.insertInto('config').values({ key: 'tx_rolled_back', value: 'no' }).execute();
          throw new Error('force rollback');
        }),
      ).rejects.toThrow('force rollback');

      const rolledBack = await db
        .selectFrom('config')
        .select('value')
        .where('key', '=', 'tx_rolled_back')
        .executeTakeFirst();
      expect(rolledBack).toBeUndefined();
    } finally {
      await checkpointAndDestroyDb(db, engine);
    }
  });

  it('enforces PRAGMA foreign_keys = ON with ON DELETE CASCADE across player tables', async () => {
    const { url } = createTempFileUrl('cascade.db');
    const { db, engine } = await initDb({ TURSO_DATABASE_URL: url });

    try {
      const player = await db
        .insertInto('players')
        .values({ player_key_hash: 'hash-cascade-test', preferences: null })
        .returning('id')
        .executeTakeFirstOrThrow();

      await db
        .insertInto('player_sessions')
        .values({
          id: 'sess-cascade-1',
          player_id: player.id,
          expires_at: '2099-01-01T00:00:00.000Z',
        })
        .execute();

      await db
        .insertInto('player_puzzle_states')
        .values({
          player_id: player.id,
          puzzle_number: 1,
          found_words: '["sanakenno"]',
          score: 42,
          date: '2026-01-01',
          max_score: 100,
          elapsed_ms: 5000,
          is_daily: 1,
        })
        .execute();

      await db.deleteFrom('players').where('id', '=', player.id).execute();

      const remainingSessions = await db
        .selectFrom('player_sessions')
        .select('id')
        .where('player_id', '=', player.id)
        .execute();
      const remainingStates = await db
        .selectFrom('player_puzzle_states')
        .select('id')
        .where('player_id', '=', player.id)
        .execute();

      expect(remainingSessions).toEqual([]);
      expect(remainingStates).toEqual([]);
    } finally {
      await checkpointAndDestroyDb(db, engine);
    }
  });

  it('serves end-to-end Hono health, player auth init, and progress sync over libSQL', async () => {
    const { url } = createTempFileUrl('smoke.db');
    const { db, engine } = await initDb({ TURSO_DATABASE_URL: url });

    try {
      await seedDatabase(db);
      const app = createApp(db, engine);

      const healthRes = await app.request('/api/health');
      expect(healthRes.status).toBe(200);
      const healthBody = (await healthRes.json()) as {
        status: string;
        engine: string;
        total_puzzles: number;
      };
      expect(healthBody.status).toBe('ok');
      expect(healthBody.engine).toBe('kysely-libsql');
      expect(healthBody.total_puzzles).toBeGreaterThan(0);

      const initRes = await app.request('/api/player/auth/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(initRes.status).toBe(200);
      const initBody = (await initRes.json()) as { token: string; player_key: string };
      expect(initBody.token).toBeTruthy();

      const progressRes = await app.request('/api/player/sync/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${initBody.token}`,
        },
        body: JSON.stringify({
          puzzle_number: 1,
          date: '2026-01-01',
          found_words: ['kissa', 'kassi'],
          score: 10,
          max_score: 100,
          best_rank: 'Hyvä',
          hints_unlocked: [],
          hints_used: 0,
          started_at: 1700000000000,
          total_paused_ms: 0,
          elapsed_ms: 12000,
          longest_word: 'kissa',
          pangrams_found: 0,
          best_no_hint_score: 10,
          score_before_hints: null,
        }),
      });
      expect(progressRes.status).toBe(200);

      const syncRes = await app.request('/api/player/sync', {
        headers: {
          Authorization: `Bearer ${initBody.token}`,
        },
      });
      expect(syncRes.status).toBe(200);
      const syncBody = (await syncRes.json()) as {
        stats: { version: number; records: Array<{ puzzle_number: number; best_score: number }> };
        puzzle_states: Array<{ puzzle_number: number; found_words: string[] }>;
      };
      expect(syncBody.stats.records).toHaveLength(1);
      expect(syncBody.stats.records[0]?.puzzle_number).toBe(1);
      expect(syncBody.puzzle_states).toHaveLength(1);
      expect(syncBody.puzzle_states[0]?.puzzle_number).toBe(1);
    } finally {
      await checkpointAndDestroyDb(db, engine);
    }
  });

  it('omits no-op PRAGMA inside write transactions and always calls tx.close() on commit, rollback, and abnormal release', async () => {
    const client = createClient({ url: ':memory:' });
    const executedTxSql: string[] = [];
    const closeSpies: Array<ReturnType<typeof vi.spyOn>> = [];

    const origTransaction = client.transaction.bind(client);
    vi.spyOn(client, 'transaction').mockImplementation(async (mode?: TransactionMode) => {
      const tx = await origTransaction(mode);
      const origExecute = tx.execute.bind(tx);
      vi.spyOn(tx, 'execute').mockImplementation((stmt) => {
        const sqlText = typeof stmt === 'string' ? stmt : stmt.sql;
        executedTxSql.push(sqlText);
        return origExecute(stmt);
      });
      closeSpies.push(vi.spyOn(tx, 'close'));
      return tx;
    });

    const dialect = new LibsqlDialect({ client });
    const db = new Kysely<Database>({ dialect });

    try {
      await runMigrationsAsync(db);
      executedTxSql.length = 0;
      closeSpies.length = 0;

      // 1. Committed transaction
      await db.transaction().execute(async (trx) => {
        await trx.insertInto('config').values({ key: 'k1', value: 'v1' }).execute();
      });

      // 2. Rolled-back transaction
      await expect(
        db.transaction().execute(async (trx) => {
          await trx.insertInto('config').values({ key: 'k2', value: 'v2' }).execute();
          throw new Error('rollback-check');
        }),
      ).rejects.toThrow('rollback-check');

      expect(executedTxSql.some((s) => /PRAGMA\s+foreign_keys/i.test(s))).toBe(false);
      expect(closeSpies).toHaveLength(2);
      expect(closeSpies[0]).toHaveBeenCalledTimes(1);
      expect(closeSpies[1]).toHaveBeenCalledTimes(1);

      // 3. Abnormal connection release with an open lingering transaction
      const driver = dialect.createDriver();
      const conn = (await driver.acquireConnection()) as LibsqlConnection;
      await driver.beginTransaction(conn, {});
      await driver.releaseConnection(conn);
      expect(closeSpies).toHaveLength(3);
      expect(closeSpies[2]).toHaveBeenCalledTimes(1);

      // 4. Remote libsql:// URLs skip no-op per-request PRAGMA foreign_keys = ON during driver.init()
      const remoteClient = createClient({ url: ':memory:' });
      const remoteExecuteSpy = vi.spyOn(remoteClient, 'execute');
      const remoteDriver = new LibsqlDialect({
        url: 'libsql://example.turso.io',
        client: remoteClient,
      }).createDriver();
      await remoteDriver.init();
      expect(remoteExecuteSpy).not.toHaveBeenCalled();
      remoteClient.close();
    } finally {
      await checkpointAndDestroyDb(db, 'kysely-libsql');
    }
  });

  it('retries pre-commit transient libSQL error codes but never retries HRANA_CLOSED_ERROR', async () => {
    const { url } = createTempFileUrl('retry.db');
    const { db, engine } = await initDb({ TURSO_DATABASE_URL: url });

    try {
      for (const code of ['SQLITE_BUSY_TIMEOUT', 'SQLITE_LOCKED', 'HRANA_STREAM_EXPIRED']) {
        let attempts = 0;
        const result = await runImmediateTransactionWithRetry(
          db,
          async (trx) => {
            attempts += 1;
            if (attempts === 1) {
              const err = new Error(`simulated ${code}`) as Error & { code: string };
              err.code = code;
              throw err;
            }
            await trx
              .insertInto('config')
              .values({ key: `retry_${code}`, value: 'ok' })
              .execute();
            return 'committed';
          },
          { maxRetries: 3, retryDelayMs: 1 },
        );

        expect(result).toBe('committed');
        expect(attempts).toBe(2);
        const row = await db
          .selectFrom('config')
          .select('value')
          .where('key', '=', `retry_${code}`)
          .executeTakeFirst();
        expect(row?.value).toBe('ok');
      }

      let closedAttempts = 0;
      await expect(
        runImmediateTransactionWithRetry(
          db,
          async () => {
            closedAttempts += 1;
            const err = new Error('Hrana connection closed') as Error & { code: string };
            err.code = 'HRANA_CLOSED_ERROR';
            throw err;
          },
          { maxRetries: 3, retryDelayMs: 1 },
        ),
      ).rejects.toThrow('Hrana connection closed');
      expect(closedAttempts).toBe(1);
    } finally {
      await checkpointAndDestroyDb(db, engine);
    }
  });
});
