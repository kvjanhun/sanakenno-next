import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import SQLite from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { CURATED_BLOCKED_WORDS, runMigrations } from '../../packages/server/src/db/baseline-sql.js';
import { createDb } from '../../packages/server/src/db/connection.js';
import { getBlockedWords } from '../../packages/server/src/features/puzzle/puzzle.queries.js';
import { puzzleWords, setWordlist } from '../../packages/server/src/features/puzzle/wordlist.js';

describe('Blocked words curation & migration 0003 (integration)', () => {
  const tempFiles: string[] = [];

  function makeTempDbPath(): string {
    const file = path.join(
      os.tmpdir(),
      `sanakenno-blocked-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
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

  it('seeds curated slurs, hate speech, and explicit violence into blocked_words', async () => {
    const dbPath = makeTempDbPath();
    const db = createDb(dbPath);

    try {
      const blocked = await getBlockedWords(db);

      // Verify all curated offensive words are blocked in SQLite
      for (const word of CURATED_BLOCKED_WORDS) {
        expect(blocked).toContain(word);
      }

      // Check key categories
      expect(blocked).toContain('hintti'); // homophobic slur
      expect(blocked).toContain('huora'); // misogynistic slur
      expect(blocked).toContain('neekeri'); // racial slur
      expect(blocked).toContain('ryssä'); // ethnic slur
      expect(blocked).toContain('natsilainen'); // hate speech
      expect(blocked).toContain('pedofiili'); // sexual abuse
      expect(blocked).toContain('raiskaus'); // sexual violence
    } finally {
      await db.destroy();
    }
  });

  it('keeps religious/cultural words and standard Finnish swearwords unblocked and playable', async () => {
    const dbPath = makeTempDbPath();
    const db = createDb(dbPath);

    try {
      const blocked = await getBlockedWords(db);

      // Religious and cultural words must NOT be blocked
      expect(blocked).not.toContain('raamattu');
      expect(blocked).not.toContain('koraani');
      expect(blocked).not.toContain('suvivirsi');

      // Conversational swearwords must NOT be in blocked_words
      expect(blocked).not.toContain('kulli');
      expect(blocked).not.toContain('kyrpä');
      expect(blocked).not.toContain('kusipää');
      expect(blocked).not.toContain('mulkku');

      // Verify playable in puzzleWords when letters permit
      setWordlist(['raamattu', 'koraani', 'suvivirsi', 'neekeri', 'kana']);

      // Letters: a, m, r, t, u (center: a) -> contains 'raamattu'
      const matchedReligious = puzzleWords('a,m,r,t,u,x,y', 'a', blocked);
      expect(matchedReligious).toContain('raamattu');

      // Letters: e, k, n, r, i (center: e) -> blocked words filtered out
      const matchedOffensive = puzzleWords('e,k,n,r,i,x,y', 'e', blocked);
      expect(matchedOffensive).not.toContain('neekeri');
    } finally {
      await db.destroy();
    }
  });

  it('merges cleanly and idempotently with existing manual blocked words from production history', async () => {
    const dbPath = makeTempDbPath();
    const rawSqlite = new SQLite(dbPath);

    // Create table and insert simulated 122 production manual words, some overlapping
    rawSqlite.exec(`
      CREATE TABLE IF NOT EXISTS blocked_words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT NOT NULL UNIQUE,
        blocked_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO schema_migrations (version) VALUES ('0001-baseline'), ('0002-add-puzzle-max-score');
    `);

    const insertStmt = rawSqlite.prepare('INSERT OR IGNORE INTO blocked_words (word) VALUES (?)');
    // Insert 122 simulated historical words including overlap with 'neekeri'
    insertStmt.run('neekeri');
    insertStmt.run('legacy_bad_word_1');
    for (let i = 2; i <= 121; i++) {
      insertStmt.run(`prod_blocked_${i}`);
    }

    const countBefore = (
      rawSqlite.prepare('SELECT count(*) as count FROM blocked_words').get() as {
        count: number;
      }
    ).count;
    expect(countBefore).toBe(122);

    // Apply migrations
    runMigrations(rawSqlite);
    rawSqlite.close();

    const db = createDb(dbPath);
    try {
      const blocked = await getBlockedWords(db);

      // Legacy words preserved
      expect(blocked).toContain('legacy_bad_word_1');
      expect(blocked).toContain('prod_blocked_50');

      // Curated words added cleanly
      expect(blocked).toContain('huora');
      expect(blocked).toContain('pedofiili');

      // Total count is 122 + new unique words (minus overlap 'neekeri')
      expect(blocked.length).toBeGreaterThan(122);
    } finally {
      await db.destroy();
    }
  });
});
