import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeStreak, evaluateAchievements } from '@sanakenno/shared';
import SQLite from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../packages/server/src/app.js';
import {
  createDb,
  runImmediateTransactionWithRetry,
} from '../../packages/server/src/db/connection.js';
import { BASELINE_SQL } from '../../packages/server/src/db/baseline-sql.js';
import { migrateV1DatabaseFile } from '../../packages/server/src/db/migrate-v1.js';

const V1_SCHEMA_PATH = process.env.V1_SCHEMA_PATH;

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
    const rawV1Sql =
      V1_SCHEMA_PATH && fs.existsSync(V1_SCHEMA_PATH)
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
      expect(appliedMigrations.map((m) => m.version)).toContain('0003-seed-curated-blocked-words');

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

  it('migrates a 1.0 database file via migrateV1DatabaseFile without mutating source and preserves player streaks and long-word counts on sync', async () => {
    const sourcePath = makeTempDbPath();
    const outputPath = makeTempDbPath();

    const v1Db = new SQLite(sourcePath);
    v1Db.exec(`
      CREATE TABLE puzzles (
        slot INTEGER PRIMARY KEY,
        letters TEXT NOT NULL,
        center TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE blocked_words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT NOT NULL UNIQUE,
        blocked_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_key_hash TEXT NOT NULL UNIQUE,
        preferences TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE player_sessions (
        id TEXT PRIMARY KEY,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
        best_no_hint_score INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(player_id, puzzle_number)
      );
      CREATE TABLE player_puzzle_states (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        puzzle_number INTEGER NOT NULL,
        found_words TEXT NOT NULL DEFAULT '[]',
        score INTEGER NOT NULL DEFAULT 0,
        hints_unlocked TEXT NOT NULL DEFAULT '[]',
        started_at INTEGER NOT NULL DEFAULT 0,
        total_paused_ms INTEGER NOT NULL DEFAULT 0,
        score_before_hints INTEGER,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(player_id, puzzle_number)
      );

      INSERT INTO puzzles (slot, letters, center, is_active) VALUES (1, 'a,e,i,k,l,n,s', 'a', 1);
      INSERT INTO puzzles (slot, letters, center, is_active) VALUES (2, 'a,e,i,k,l,n,t', 'e', 1);
      INSERT INTO puzzles (slot, letters, center, is_active) VALUES (3, 'a,i,k,l,n,o,s', 'o', 1);

      INSERT INTO players (id, player_key_hash) VALUES (1, 'hash-player-1');
      INSERT INTO player_sessions (id, player_id, expires_at) VALUES ('valid-session-token', 1, '2099-01-01T00:00:00Z');

      -- Puzzle 1 & 2 played on their scheduled daily dates (2-day streak)
      INSERT INTO player_stats (player_id, puzzle_number, date, best_rank, best_score, max_score, words_found, updated_at)
        VALUES (1, 1, '2026-11-07', 'Ällistyttävä', 80, 100, 3, '2026-11-07 18:30:00');
      INSERT INTO player_stats (player_id, puzzle_number, date, best_rank, best_score, max_score, words_found, updated_at)
        VALUES (1, 2, '2026-11-08', 'Ällistyttävä', 90, 100, 2, '2026-11-08 09:15:00');
      -- Puzzle 3 played from the archive 10 days after its scheduled date
      INSERT INTO player_stats (player_id, puzzle_number, date, best_rank, best_score, max_score, words_found, updated_at)
        VALUES (1, 3, '2026-10-20', 'Hyvä alku', 20, 100, 1, '2026-10-30 12:00:00');

      INSERT INTO player_puzzle_states (player_id, puzzle_number, found_words, score, started_at)
        VALUES (1, 1, '["kansalainen","liikennelaitos","kana"]', 80, 1794060000000);
      INSERT INTO player_puzzle_states (player_id, puzzle_number, found_words, score, started_at)
        VALUES (1, 2, '["kielitieteilijä","kieli"]', 90, 1794130000000);
    `);
    v1Db.close();

    const result = migrateV1DatabaseFile(sourcePath, outputPath);

    expect(result.integrityCheck).toBe('ok');
    expect(result.totalPuzzles).toBe(3);
    expect(result.puzzlesRecomputed).toBe(3);
    expect(result.blockedWordsCount).toBeGreaterThanOrEqual(26);
    expect(result.statsBackfilled).toBe(3);
    expect(result.dailyStatsCount).toBe(2);
    expect(result.longWordsBackfilledCount).toBe(2);

    // Verify source file was NOT mutated (still has no player_stats.is_daily column)
    const checkSource = new SQLite(sourcePath, { readonly: true });
    const sourceCols = checkSource.prepare('PRAGMA table_info(player_stats)').all() as Array<{
      name: string;
    }>;
    checkSource.close();
    expect(sourceCols.some((c) => c.name === 'is_daily')).toBe(false);

    // Open migrated DB in 2.0 server and verify GET /api/player/sync preserves streak & long words
    const db = createDb(outputPath);
    try {
      const app = createApp(db);
      const syncRes = await app.request('/api/player/sync', {
        headers: { Authorization: 'Bearer valid-session-token' },
      });
      expect(syncRes.status).toBe(200);
      const syncPayload = (await syncRes.json()) as {
        stats: {
          records: Array<{
            puzzle_number: number;
            date: string;
            best_rank: string;
            best_score: number;
            max_score: number;
            words_found: number;
            hints_used: number;
            elapsed_ms: number;
            is_daily?: boolean;
            played_at_date?: string;
            long_words_count?: number;
          }>;
          version: 1;
        };
      };

      const p1 = syncPayload.stats.records.find((r) => r.puzzle_number === 1);
      const p2 = syncPayload.stats.records.find((r) => r.puzzle_number === 2);
      const p3 = syncPayload.stats.records.find((r) => r.puzzle_number === 3);

      expect(p1?.is_daily).toBe(true);
      expect(p1?.played_at_date).toBe('2026-11-07');
      expect(p1?.long_words_count).toBe(2);

      expect(p2?.is_daily).toBe(true);
      expect(p2?.played_at_date).toBe('2026-11-08');
      expect(p2?.long_words_count).toBe(1);

      expect(p3?.is_daily).toBe(false);
      expect(p3?.played_at_date).toBe('2026-10-30');
      expect(p3?.long_words_count).toBe(0);

      const streak = computeStreak(syncPayload.stats.records, '2026-11-08');
      expect(streak).toEqual({ current: 2, best: 2 });

      const achievements = evaluateAchievements(syncPayload.stats, streak);
      const longWordAch = achievements.find((a) => a.id === 'long_word');
      expect(longWordAch?.currentValue).toBe(3);
    } finally {
      await db.destroy();
    }
  });
});
