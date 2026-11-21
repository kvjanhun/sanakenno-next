import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { createDb } from '../../packages/server/src/db/connection.js';
import { verifyDatabaseParity } from '../../scripts/verify-turso-parity.js';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanakenno-parity-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

async function seedFixtureSqlite(dbPath: string): Promise<void> {
  const db = await createDb(dbPath);
  try {
    await db
      .insertInto('puzzles')
      .values([
        { slot: 1, letters: 'aeilnst', center: 'a', is_active: 1, max_score: 250 },
        { slot: 2, letters: 'aeikrst', center: 'e', is_active: 0, max_score: 180 },
      ])
      .execute();

    await db.insertInto('config').values({ key: 'epoch_date', value: '2026-01-01' }).execute();

    await db
      .insertInto('admins')
      .values({ username: 'curator', password_hash: 'argon2-hash' })
      .execute();

    const player = await db
      .insertInto('players')
      .values({ player_key_hash: 'player-hash-1', preferences: null })
      .returning('id')
      .executeTakeFirstOrThrow();

    await db
      .insertInto('player_stats')
      .values({
        player_id: player.id,
        puzzle_number: 1,
        date: '2026-01-01',
        best_rank: 'Erinomainen',
        best_score: 120,
        max_score: 250,
        words_found: 24,
        hints_used: 0,
        elapsed_ms: 45000,
        longest_word: 'sanakenno',
        pangrams_found: 1,
        best_no_hint_score: 120,
      })
      .execute();

    await db
      .insertInto('player_puzzle_states')
      .values({
        player_id: player.id,
        puzzle_number: 1,
        found_words: '["sanakenno"]',
        score: 120,
        hints_unlocked: '[]',
        started_at: 1700000000000,
        total_paused_ms: 0,
        score_before_hints: null,
      })
      .execute();

    await db
      .insertInto('word_finds')
      .values({ word: 'sanakenno', puzzle_number: 1, count: 7 })
      .execute();
  } finally {
    await db.destroy();
  }
}

describe('verifyDatabaseParity', () => {
  it('passes 100% when local SQLite and remote libSQL databases are identical', async () => {
    const dir = createTempDir();
    const localPath = path.join(dir, 'local.db');
    const remotePath = path.join(dir, 'remote.db');

    await seedFixtureSqlite(localPath);
    fs.copyFileSync(localPath, remotePath);

    const remoteClient = createClient({ url: `file:${remotePath}` });
    try {
      const report = await verifyDatabaseParity(localPath, remoteClient);
      expect(report.ok).toBe(true);
      expect(report.localIntegrity).toBe('ok');
      expect(report.mismatches).toEqual([]);
      expect(report.tableCounts).toHaveLength(18);
      expect(report.tableCounts.every((row) => row.match)).toBe(true);
      expect(report.invariants.every((inv) => inv.match)).toBe(true);
    } finally {
      remoteClient.close();
    }
  });

  it('fails with explicit metric diffs when a player_stats score is altered or row is missing', async () => {
    const dir = createTempDir();
    const localPath = path.join(dir, 'local.db');
    const remotePath = path.join(dir, 'remote.db');

    await seedFixtureSqlite(localPath);
    fs.copyFileSync(localPath, remotePath);

    const remoteClient = createClient({ url: `file:${remotePath}` });
    try {
      await remoteClient.execute('UPDATE player_stats SET best_score = 99 WHERE puzzle_number = 1');

      const alteredReport = await verifyDatabaseParity(localPath, remoteClient);
      expect(alteredReport.ok).toBe(false);
      expect(alteredReport.mismatches.some((m) => m.includes('player_stats.sum_best_score'))).toBe(
        true,
      );

      await remoteClient.execute('DELETE FROM player_stats WHERE puzzle_number = 1');

      const missingReport = await verifyDatabaseParity(localPath, remoteClient);
      expect(missingReport.ok).toBe(false);
      expect(missingReport.mismatches.some((m) => m.includes('table player_stats'))).toBe(true);
      expect(missingReport.mismatches.some((m) => m.includes('player_stats.count'))).toBe(true);
    } finally {
      remoteClient.close();
    }
  });

  it('accepts legacy rotation_epoch config key when epoch_date is absent', async () => {
    const dir = createTempDir();
    const localPath = path.join(dir, 'local-legacy.db');
    const remotePath = path.join(dir, 'remote-legacy.db');

    await seedFixtureSqlite(localPath);
    const localDb = await createDb(localPath);
    await localDb
      .updateTable('config')
      .set({ key: 'rotation_epoch' })
      .where('key', '=', 'epoch_date')
      .execute();
    await localDb.destroy();

    fs.copyFileSync(localPath, remotePath);
    const remoteClient = createClient({ url: `file:${remotePath}` });
    try {
      const report = await verifyDatabaseParity(localPath, remoteClient);
      expect(report.ok).toBe(true);
      const epochInv = report.invariants.find((i) => i.name === 'config.epoch_date');
      expect(epochInv?.localValue).toBe('2026-01-01');
      expect(epochInv?.remoteValue).toBe('2026-01-01');
    } finally {
      remoteClient.close();
    }
  });
});
