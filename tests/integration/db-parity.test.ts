import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import SQLite from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDb,
  runImmediateTransactionWithRetry,
} from '../../packages/server/src/db/connection.js';
import { BASELINE_SQL } from '../../packages/server/src/db/baseline-sql.js';

const V1_SCHEMA_PATH = '/Users/erezac/Projects/sanakenno/server/db/schema.sql';

describe('Sanakenno 1.0 -> 2.0 SQLite Schema & Kysely Parity', () => {
  const tempFiles: string[] = [];

  function makeTempDbPath(): string {
    const file = path.join(
      os.tmpdir(),
      `sanakenno-parity-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    tempFiles.push(file);
    return file;
  }

  afterEach(() => {
    for (const file of tempFiles.splice(0)) {
      for (const suffix of ['', '-wal', '-shm']) {
        if (fs.existsSync(file + suffix)) {
          fs.unlinkSync(file + suffix);
        }
      }
    }
  });

  it('opens a database initialized from Sanakenno 1.0 schema.sql and queries all 16 tables with foreign-key cascades', async () => {
    const dbPath = makeTempDbPath();
    const rawV1Sql = fs.existsSync(V1_SCHEMA_PATH)
      ? fs.readFileSync(V1_SCHEMA_PATH, 'utf8')
      : BASELINE_SQL;

    const rawSqlite = new SQLite(dbPath);
    rawSqlite.exec(rawV1Sql);
    rawSqlite.close();

    const db = createDb(dbPath);

    try {
      const appliedMigrations = await db.selectFrom('schema_migrations').selectAll().execute();
      expect(appliedMigrations.map((m) => m.version)).toContain('0001-baseline');
      expect(appliedMigrations.map((m) => m.version)).toContain('0002-add-puzzle-max-score');

      await db
        .insertInto('puzzles')
        .values({ slot: 1, letters: 'a,e,i,k,l,n,s', center: 'a', is_active: 1 })
        .execute();
      await db.insertInto('blocked_words').values({ word: 'testisana' }).execute();
      await db
        .insertInto('achievements')
        .values({
          puzzle_number: 1,
          rank: 'Ällistyttävä',
          score: 70,
          max_score: 100,
          words_found: 15,
          elapsed_ms: 5000,
          session_id: 'sess-1',
        })
        .execute();
      await db
        .insertInto('page_views')
        .values({ visitor_id: 'vis-1', puzzle_number: 1, path: '/' })
        .execute();
      await db
        .insertInto('combinations')
        .values({
          letters: 'aeiklns',
          total_pangrams: 1,
          min_word_count: 20,
          max_word_count: 40,
          min_max_score: 80,
          max_max_score: 120,
          variations: '[]',
          in_rotation: 1,
        })
        .execute();
      await db
        .insertInto('suggestion_rejections')
        .values({ letters_key: 'aeiklns', center: 'e' })
        .execute();

      const admin = await db
        .insertInto('admins')
        .values({ username: 'admin', password_hash: 'hash' })
        .returning('id')
        .executeTakeFirstOrThrow();

      await db
        .insertInto('sessions')
        .values({
          id: 'admin-sess-1',
          admin_id: admin.id,
          csrf_token: 'csrf-1',
          expires_at: '2027-01-01T00:00:00Z',
        })
        .execute();
      await db
        .insertInto('admin_log')
        .values({ admin_id: admin.id, action: 'create_puzzle', detail: 'slot 1' })
        .execute();
      await db.insertInto('config').values({ key: 'epoch_date', value: '2026-01-01' }).execute();
      await db
        .insertInto('failed_guesses')
        .values({ word: 'epäsana', puzzle_date: '2026-10-27' })
        .execute();
      await db.insertInto('word_finds').values({ word: 'kana', puzzle_number: 1 }).execute();

      const player = await db
        .insertInto('players')
        .values({ player_key_hash: 'sha256-key-hash', preferences: '{"updated_at":"2026-10-27"}' })
        .returning('id')
        .executeTakeFirstOrThrow();

      await db
        .insertInto('player_sessions')
        .values({
          id: 'player-token-1',
          player_id: player.id,
          expires_at: '2027-01-01T00:00:00Z',
        })
        .execute();
      await db
        .insertInto('player_stats')
        .values({
          player_id: player.id,
          puzzle_number: 1,
          date: '2026-10-27',
          best_rank: 'Hyvä alku',
          best_score: 10,
          max_score: 100,
          words_found: 3,
          hints_used: 0,
          elapsed_ms: 1000,
          longest_word: 'kana',
          pangrams_found: 0,
          best_no_hint_score: 10,
        })
        .execute();
      await db
        .insertInto('player_puzzle_states')
        .values({
          player_id: player.id,
          puzzle_number: 1,
          found_words: '["kana"]',
          score: 1,
          hints_unlocked: '[]',
          started_at: 1000,
          total_paused_ms: 0,
          score_before_hints: null,
        })
        .execute();

      // Verify ON DELETE CASCADE from players -> player_sessions, player_stats, player_puzzle_states
      await db.deleteFrom('players').where('id', '=', player.id).execute();

      const remainingSessions = await db.selectFrom('player_sessions').selectAll().execute();
      const remainingStats = await db.selectFrom('player_stats').selectAll().execute();
      const remainingStates = await db.selectFrom('player_puzzle_states').selectAll().execute();

      expect(remainingSessions).toHaveLength(0);
      expect(remainingStats).toHaveLength(0);
      expect(remainingStates).toHaveLength(0);
    } finally {
      await db.destroy();
    }
  });

  it('upgrades a pre-migration legacy database via 0001-baseline and supports retryable transactions', async () => {
    const dbPath = makeTempDbPath();
    const legacySqlite = new SQLite(dbPath);
    legacySqlite.exec(`
      CREATE TABLE puzzles (
        slot INTEGER PRIMARY KEY,
        letters TEXT NOT NULL,
        center TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_key_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE player_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        puzzle_number INTEGER NOT NULL,
        date TEXT NOT NULL,
        best_rank TEXT NOT NULL,
        best_score INTEGER NOT NULL DEFAULT 0,
        max_score INTEGER NOT NULL DEFAULT 0,
        words_found INTEGER NOT NULL DEFAULT 0,
        hints_used INTEGER NOT NULL DEFAULT 0,
        elapsed_ms INTEGER NOT NULL DEFAULT 0,
        longest_word TEXT DEFAULT NULL,
        pangrams_found INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(player_id, puzzle_number)
      );
      CREATE TABLE player_transfer_tokens (
        token TEXT PRIMARY KEY
      );
      INSERT INTO puzzles (slot, letters, center) VALUES (1, 'a,e,i,k,l,n,s', 'a');
    `);
    legacySqlite.close();

    const db = createDb(dbPath);
    try {
      const migrated = await db
        .selectFrom('puzzles')
        .select(['slot', 'is_active', 'max_score'])
        .where('slot', '=', 1)
        .executeTakeFirstOrThrow();
      expect(migrated.is_active).toBe(1);
      expect(migrated.max_score).toBeGreaterThan(0);

      let attempts = 0;
      const insertedSlot = await runImmediateTransactionWithRetry(
        db,
        async (trx) => {
          attempts += 1;
          if (attempts === 1) {
            const busyErr = Object.assign(new Error('database is locked'), {
              code: 'SQLITE_BUSY',
            });
            throw busyErr;
          }
          const row = await trx
            .insertInto('puzzles')
            .values({ slot: 7, letters: 'a,e,i,k,l,n,s', center: 'a', is_active: 1 })
            .returning('slot')
            .executeTakeFirstOrThrow();
          return row.slot;
        },
        { retryDelayMs: 1 },
      );

      expect(attempts).toBe(2);
      expect(insertedSlot).toBe(7);
    } finally {
      await db.destroy();
    }
  });
});
