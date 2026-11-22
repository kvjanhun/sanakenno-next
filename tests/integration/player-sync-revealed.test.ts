import Database from 'better-sqlite3';
import { Kysely, SqliteDialect, sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrationsAsync } from '../../packages/server/src/db/async-migrations.js';
import type { Database as DbSchema } from '../../packages/server/src/db/schema.js';
import {
  DEFAULT_SEED_WORDS,
  setWordlist,
} from '../../packages/server/src/features/puzzle/wordlist.js';
import { createTestHarness, type TestHarness } from '../../packages/server/src/testing.js';

describe('Cross-device revealed puzzle sync (Spec 43)', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    setWordlist(DEFAULT_SEED_WORDS);
    harness = await createTestHarness();
    await harness.db
      .insertInto('puzzles')
      .values({
        slot: 1,
        letters: 'a,e,i,k,l,n,s',
        center: 'a',
        is_active: 1,
      })
      .execute();
  });

  afterEach(async () => {
    await harness.destroy();
  });

  it('migration 0006 adds revealed column cleanly on legacy player_puzzle_states table', async () => {
    const raw = new Database(':memory:');
    raw.exec(`
      CREATE TABLE schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO schema_migrations (version) VALUES
        ('0001-baseline'),
        ('0002-add-puzzle-max-score'),
        ('0003-seed-curated-blocked-words'),
        ('0004-add-player-stats-long-words-and-streak-integrity'),
        ('0005-add-player-transfer-tickets');
      CREATE TABLE player_puzzle_states (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL,
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
    `);

    const db = new Kysely<DbSchema>({ dialect: new SqliteDialect({ database: raw }) });
    try {
      const applied = await runMigrationsAsync(db);
      expect(applied).toBe(true);

      const cols = await sql<{ name: string }>`PRAGMA table_info(player_puzzle_states)`.execute(db);
      expect(cols.rows.some((c) => c.name === 'revealed')).toBe(true);

      const migs = await db.selectFrom('schema_migrations').select('version').execute();
      expect(migs.map((m) => m.version)).toContain('0006-add-player-puzzle-state-revealed');
    } finally {
      await db.destroy();
    }
  });

  it('persists revealed=true without creating 0-word stats and freezes subsequent stats updates', async () => {
    const initRes = await harness.client.api.player.auth.init.$post();
    const player = (await initRes.json()) as { token: string; player_id: number };
    const headers = { Authorization: `Bearer ${player.token}` };

    // Reveal an unplayed puzzle
    const revealRes = await harness.client.api.player.sync.progress.$post(
      {
        json: {
          puzzle_number: 1,
          date: '2026-11-21',
          found_words: [],
          score: 0,
          max_score: 0,
          hints_unlocked: [],
          started_at: 0,
          total_paused_ms: 0,
          score_before_hints: null,
          revealed: true,
        },
      },
      { headers },
    );
    expect(revealRes.status).toBe(200);

    const pull1 = await harness.client.api.player.sync.$get({}, { headers });
    const data1 = (await pull1.json()) as {
      stats: { records: unknown[] };
      puzzle_states: Array<{ puzzle_number: number; revealed?: boolean }>;
    };
    expect(data1.stats.records).toHaveLength(0);
    expect(data1.puzzle_states).toHaveLength(1);
    expect(data1.puzzle_states[0]?.revealed).toBe(true);

    // Subsequent push with words and revealed=false must stay revealed=true and not create stats
    const afterRes = await harness.client.api.player.sync.progress.$post(
      {
        json: {
          puzzle_number: 1,
          date: '2026-11-21',
          found_words: ['kana'],
          score: 1,
          max_score: 100,
          hints_unlocked: [],
          started_at: 1000,
          total_paused_ms: 0,
          score_before_hints: null,
          revealed: false,
        },
      },
      { headers },
    );
    expect(afterRes.status).toBe(200);

    const pull2 = await harness.client.api.player.sync.$get({}, { headers });
    const data2 = (await pull2.json()) as {
      stats: { records: unknown[] };
      puzzle_states: Array<{ puzzle_number: number; revealed?: boolean }>;
    };
    expect(data2.stats.records).toHaveLength(0);
    expect(data2.puzzle_states[0]?.revealed).toBe(true);
  });

  it('preserves revealed=true across /api/player/auth/transfer/use bulk upsert', async () => {
    const initRes = await harness.client.api.player.auth.init.$post();
    const player = (await initRes.json()) as {
      token: string;
      player_key: string;
      player_id: number;
    };

    const transferRes = await harness.client.api.player.auth.transfer.use.$post({
      json: {
        token: player.player_key,
        stats: { version: 1, records: [] },
        puzzle_states: [
          {
            puzzle_number: 1,
            found_words: [],
            score: 0,
            hints_unlocked: [],
            started_at: 0,
            total_paused_ms: 0,
            score_before_hints: null,
            revealed: true,
          },
        ],
      },
    });
    expect(transferRes.status).toBe(200);
    const body = (await transferRes.json()) as {
      puzzle_states: Array<{ puzzle_number: number; revealed?: boolean }>;
    };
    expect(body.puzzle_states).toHaveLength(1);
    expect(body.puzzle_states[0]?.revealed).toBe(true);
  });

  it('freezes pre-reveal derived stats permanently when transitioning revealed false -> true after finding words', async () => {
    const initRes = await harness.client.api.player.auth.init.$post();
    const player = (await initRes.json()) as { token: string };
    const headers = { Authorization: `Bearer ${player.token}` };

    // 1. Find 1 word ('kana', 1 pt) before revealing
    await harness.client.api.player.sync.progress.$post(
      {
        json: {
          puzzle_number: 1,
          date: '2026-04-12',
          found_words: ['kana'],
          score: 1,
          max_score: 27,
          hints_unlocked: [],
          started_at: 1000,
          total_paused_ms: 0,
          score_before_hints: null,
          is_daily: true,
          played_at_date: '2026-04-12',
        },
      },
      { headers },
    );

    // 2. Reveal answers -> snapshots pre-reveal stats (1 word, 1 pt)
    await harness.client.api.player.sync.progress.$post(
      {
        json: {
          puzzle_number: 1,
          date: '2026-04-12',
          found_words: ['kana'],
          score: 1,
          max_score: 27,
          hints_unlocked: [],
          started_at: 1000,
          total_paused_ms: 0,
          score_before_hints: null,
          revealed: true,
        },
      },
      { headers },
    );

    // 3. Push additional words after reveal -> frozen stats must NOT increase
    await harness.client.api.player.sync.progress.$post(
      {
        json: {
          puzzle_number: 1,
          date: '2026-04-12',
          found_words: ['kana', 'kansa', 'kansallinen'],
          score: 24,
          max_score: 27,
          hints_unlocked: [],
          started_at: 1000,
          total_paused_ms: 0,
          score_before_hints: null,
          revealed: true,
        },
      },
      { headers },
    );

    const pull = await harness.client.api.player.sync.$get({}, { headers });
    const data = (await pull.json()) as {
      stats: { records: Array<{ puzzle_number: number; best_score: number; words_found: number }> };
      puzzle_states: Array<{ puzzle_number: number; revealed?: boolean; found_words: string[] }>;
    };
    expect(data.stats.records).toHaveLength(1);
    expect(data.stats.records[0]?.best_score).toBe(1);
    expect(data.stats.records[0]?.words_found).toBe(1);
    expect(data.puzzle_states[0]?.revealed).toBe(true);
  });

  it('preserves pre-reveal stats during /api/player/auth/transfer/use when pairing a locally revealed puzzle', async () => {
    const initRes = await harness.client.api.player.auth.init.$post();
    const player = (await initRes.json()) as { token: string; player_key: string };

    const transferRes = await harness.client.api.player.auth.transfer.use.$post({
      json: {
        token: player.player_key,
        stats: {
          version: 1,
          records: [
            {
              puzzle_number: 1,
              date: '2026-04-12',
              best_rank: 'Hyvä alku',
              best_score: 6,
              max_score: 27,
              words_found: 2,
              hints_used: 0,
              elapsed_ms: 8000,
              longest_word: 'kansa',
              pangrams_found: 0,
              best_no_hint_score: 6,
              is_daily: true,
              played_at_date: '2026-04-12',
            },
          ],
        },
        puzzle_states: [
          {
            puzzle_number: 1,
            found_words: ['kana', 'kansa', 'kansallinen'],
            score: 24,
            hints_unlocked: [],
            started_at: 1000,
            total_paused_ms: 0,
            score_before_hints: null,
            revealed: true,
          },
        ],
      },
    });
    expect(transferRes.status).toBe(200);
    const body = (await transferRes.json()) as {
      stats: { records: Array<{ puzzle_number: number; best_score: number; is_daily?: boolean }> };
      puzzle_states: Array<{ puzzle_number: number; revealed?: boolean }>;
    };
    expect(body.puzzle_states[0]?.revealed).toBe(true);
    expect(body.stats.records).toHaveLength(1);
    expect(body.stats.records[0]?.best_score).toBe(6);
    expect(body.stats.records[0]?.is_daily).toBe(true);
  });
});
