import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import SQLite from 'better-sqlite3';
import { sql } from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ASYNC_MIGRATIONS,
  runMigrationsAsync,
} from '../../packages/server/src/db/async-migrations.js';
import { CURATED_BLOCKED_WORDS } from '../../packages/server/src/db/baseline-sql.js';
import { createDb } from '../../packages/server/src/db/connection.js';
import { fetchPlayerData } from '../../packages/server/src/features/player-sync/player-sync.queries.js';
import { getEpochDate } from '../../packages/server/src/features/puzzle/puzzle.queries.js';

describe('Database Schema & Async Migrations (integration)', () => {
  const tempFiles: string[] = [];

  function makeTempDbPath(): string {
    const file = path.join(
      os.tmpdir(),
      `sanakenno-migrations-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
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

  it('initializes all active tables with FK cascades, seeds curated blocked words, and hits the fast-path on re-run', async () => {
    const db = await createDb(':memory:');
    try {
      const applied = await db.selectFrom('schema_migrations').select('version').execute();
      expect(applied.map((r) => r.version)).toEqual(ASYNC_MIGRATIONS.map((m) => m.version));

      const tables = await sql<{ name: string }>`
        SELECT name FROM sqlite_master WHERE type = 'table'
      `.execute(db);
      const tableNames = new Set(tables.rows.map((r) => r.name));
      expect(tableNames.has('page_views')).toBe(false);
      expect(tableNames.has('player_transfer_tokens')).toBe(false);
      expect(tableNames.has('player_stats')).toBe(false);
      expect(tableNames.has('puzzles')).toBe(true);
      expect(tableNames.has('players')).toBe(true);
      expect(tableNames.has('player_puzzle_states')).toBe(true);

      const blocked = await db.selectFrom('blocked_words').select('word').execute();
      const blockedSet = new Set(blocked.map((b) => b.word));
      for (const word of CURATED_BLOCKED_WORDS) {
        expect(blockedSet.has(word)).toBe(true);
      }

      const player = await db
        .insertInto('players')
        .values({ player_key_hash: 'cascade-test-hash' })
        .returning('id')
        .executeTakeFirstOrThrow();

      await db
        .insertInto('player_sessions')
        .values({ id: 'sess-1', player_id: player.id, expires_at: '2027-01-01T00:00:00Z' })
        .execute();
      await db
        .insertInto('player_puzzle_states')
        .values({
          player_id: player.id,
          puzzle_number: 1,
          found_words: '["sana"]',
          score: 1,
          date: '2026-03-01',
          is_daily: 1,
        })
        .execute();

      await db.deleteFrom('players').where('id', '=', player.id).execute();

      const remainingSessions = await db
        .selectFrom('player_sessions')
        .selectAll()
        .where('player_id', '=', player.id)
        .execute();
      const remainingStates = await db
        .selectFrom('player_puzzle_states')
        .selectAll()
        .where('player_id', '=', player.id)
        .execute();

      expect(remainingSessions).toEqual([]);
      expect(remainingStates).toEqual([]);

      // Fast-path returns false when all migrations are already recorded
      const ranAgain = await runMigrationsAsync(db);
      expect(ranAgain).toBe(false);
    } finally {
      await db.destroy();
    }
  });

  it('migration 0007 drops pre-existing page_views and normalizes config.rotation_epoch into epoch_date without clobbering', async () => {
    const dbPath = makeTempDbPath();
    const raw = new SQLite(dbPath);
    raw.exec(`
      CREATE TABLE page_views (id INTEGER PRIMARY KEY, visitor_id TEXT NOT NULL, path TEXT NOT NULL);
      CREATE TABLE player_transfer_tokens (id TEXT PRIMARY KEY);
      CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO config (key, value) VALUES ('rotation_epoch', '2025-11-15');
      INSERT INTO schema_migrations (version) VALUES
        ('0001-baseline'),
        ('0002-add-puzzle-max-score'),
        ('0003-seed-curated-blocked-words'),
        ('0004-add-player-stats-long-words-and-streak-integrity'),
        ('0005-add-player-transfer-tickets'),
        ('0006-add-player-puzzle-state-revealed');
    `);
    raw.close();

    const db = await createDb(dbPath);
    try {
      const tables = await sql<{ name: string }>`
        SELECT name FROM sqlite_master WHERE type = 'table'
      `.execute(db);
      const tableNames = new Set(tables.rows.map((r) => r.name));
      expect(tableNames.has('page_views')).toBe(false);
      expect(tableNames.has('player_transfer_tokens')).toBe(false);

      const configRows = await db.selectFrom('config').selectAll().execute();
      expect(configRows).toEqual([{ key: 'epoch_date', value: '2025-11-15' }]);
      expect(await getEpochDate(db)).toBe('2025-11-15');
    } finally {
      await db.destroy();
    }

    // Second scenario: existing epoch_date must not be overwritten by rotation_epoch
    const dbPath2 = makeTempDbPath();
    const raw2 = new SQLite(dbPath2);
    raw2.exec(`
      CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO config (key, value) VALUES ('epoch_date', '2026-02-24'), ('rotation_epoch', '2025-01-01');
      INSERT INTO schema_migrations (version) VALUES
        ('0001-baseline'),
        ('0002-add-puzzle-max-score'),
        ('0003-seed-curated-blocked-words'),
        ('0004-add-player-stats-long-words-and-streak-integrity'),
        ('0005-add-player-transfer-tickets'),
        ('0006-add-player-puzzle-state-revealed');
    `);
    raw2.close();

    const db2 = await createDb(dbPath2);
    try {
      const configRows = await db2.selectFrom('config').selectAll().execute();
      expect(configRows).toEqual([{ key: 'epoch_date', value: '2026-02-24' }]);
    } finally {
      await db2.destroy();
    }
  });

  it('migration 0009 consolidates matched, orphan, and revealed player_stats rows into player_puzzle_states and drops player_stats', async () => {
    const dbPath = makeTempDbPath();
    const raw = new SQLite(dbPath);
    raw.exec(`
      CREATE TABLE puzzles (slot INTEGER PRIMARY KEY, letters TEXT NOT NULL, center TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, max_score INTEGER, computed_data TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE players (id INTEGER PRIMARY KEY AUTOINCREMENT, player_key_hash TEXT NOT NULL UNIQUE, preferences TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE player_puzzle_states (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE, puzzle_number INTEGER NOT NULL, found_words TEXT NOT NULL DEFAULT '[]', score INTEGER NOT NULL DEFAULT 0, hints_unlocked TEXT NOT NULL DEFAULT '[]', started_at INTEGER NOT NULL DEFAULT 0, total_paused_ms INTEGER NOT NULL DEFAULT 0, score_before_hints INTEGER, revealed INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(player_id, puzzle_number));
      CREATE TABLE player_stats (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE, puzzle_number INTEGER NOT NULL, date TEXT NOT NULL, best_rank TEXT NOT NULL, best_score INTEGER NOT NULL DEFAULT 0, max_score INTEGER NOT NULL DEFAULT 0, words_found INTEGER NOT NULL DEFAULT 0, hints_used INTEGER NOT NULL DEFAULT 0, elapsed_ms INTEGER NOT NULL DEFAULT 0, longest_word TEXT DEFAULT NULL, pangrams_found INTEGER NOT NULL DEFAULT 0, best_no_hint_score INTEGER NOT NULL DEFAULT 0, long_words_count INTEGER NOT NULL DEFAULT 0, is_daily INTEGER NOT NULL DEFAULT 0, played_at_date TEXT DEFAULT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(player_id, puzzle_number));
      CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO schema_migrations (version) VALUES
        ('0001-baseline'), ('0002-add-puzzle-max-score'), ('0003-seed-curated-blocked-words'),
        ('0004-add-player-stats-long-words-and-streak-integrity'), ('0005-add-player-transfer-tickets'),
        ('0006-add-player-puzzle-state-revealed'), ('0007-cleanup-legacy-schema'), ('0008-add-puzzle-computed-data');

      INSERT INTO puzzles (slot, letters, center, is_active, max_score) VALUES (1, 'a,e,i,k,l,n,s', 'a', 1, 27);
      INSERT INTO puzzles (slot, letters, center, is_active, max_score) VALUES (2, 'a,e,i,k,l,n,s', 'a', 1, 27);
      INSERT INTO players (id, player_key_hash) VALUES (1, 'hash-0009');

      -- Matched row (slot 1): normal live state
      INSERT INTO player_puzzle_states (player_id, puzzle_number, found_words, score, revealed) VALUES (1, 1, '["kana","kansa"]', 6, 0);
      INSERT INTO player_stats (player_id, puzzle_number, date, best_rank, best_score, max_score, words_found, hints_used, elapsed_ms, longest_word, pangrams_found, best_no_hint_score, is_daily, played_at_date)
      VALUES (1, 1, '2026-04-01', 'Hyvä', 6, 27, 2, 0, 12000, 'kansa', 0, 6, 1, '2026-04-01');

      -- Revealed row (slot 2): pre-reveal stats must stay frozen in frozen_stats_json
      INSERT INTO player_puzzle_states (player_id, puzzle_number, found_words, score, revealed) VALUES (1, 2, '["kana","kansa","kansallinen"]', 24, 1);
      INSERT INTO player_stats (player_id, puzzle_number, date, best_rank, best_score, max_score, words_found, hints_used, elapsed_ms, longest_word, pangrams_found, best_no_hint_score, is_daily, played_at_date)
      VALUES (1, 2, '2026-04-02', 'Hyvä alku', 1, 27, 1, 0, 5000, 'kana', 0, 1, 1, '2026-04-02');

      -- Orphan historical player_stats row (slot 99): no state row exists
      INSERT INTO player_stats (player_id, puzzle_number, date, best_rank, best_score, max_score, words_found, hints_used, elapsed_ms, longest_word, pangrams_found, best_no_hint_score, is_daily, played_at_date)
      VALUES (1, 99, '2026-01-15', 'Nerokas', 80, 100, 15, 0, 45000, 'kansallinen', 1, 80, 1, '2026-01-15');
    `);
    raw.close();

    const db = await createDb(dbPath);
    try {
      const tables = await sql<{ name: string }>`
        SELECT name FROM sqlite_master WHERE type = 'table'
      `.execute(db);
      expect(tables.rows.some((r) => r.name === 'player_stats')).toBe(false);

      const sync = await fetchPlayerData(db, 1);
      expect(sync.stats.records).toHaveLength(3);

      const rec1 = sync.stats.records.find((r) => r.puzzle_number === 1);
      expect(rec1?.best_score).toBe(6);
      expect(rec1?.is_daily).toBe(true);
      expect(rec1?.elapsed_ms).toBe(12000);

      // Revealed slot 2 keeps frozen pre-reveal score (1), NOT post-reveal score (24)
      const rec2 = sync.stats.records.find((r) => r.puzzle_number === 2);
      expect(rec2?.best_score).toBe(1);
      expect(rec2?.words_found).toBe(1);

      // Orphan slot 99 preserved in stats without fabricating a bogus puzzle_state entry
      const rec99 = sync.stats.records.find((r) => r.puzzle_number === 99);
      expect(rec99?.best_score).toBe(80);
      expect(rec99?.longest_word).toBe('kansallinen');
      expect(sync.puzzle_states.find((s) => s.puzzle_number === 99)).toBeUndefined();
    } finally {
      await db.destroy();
    }
  });
});
