import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '../../packages/server/src/db/connection.js';
import {
  DEFAULT_SEED_WORDS,
  getWordlist,
  setWordlist,
} from '../../packages/server/src/features/puzzle/wordlist.js';
import { ensureBootSeed, shutdownServer } from '../../packages/server/src/index.js';

describe('Server Lifecycle (auto-seed & graceful shutdown)', () => {
  const tempFiles: string[] = [];

  afterEach(() => {
    setWordlist(DEFAULT_SEED_WORDS);
    for (const file of tempFiles.splice(0)) {
      for (const suffix of ['', '-wal', '-shm']) {
        const target = `${file}${suffix}`;
        if (fs.existsSync(target)) {
          fs.rmSync(target, { force: true });
        }
      }
    }
  });

  it('auto-seeds empty development database and skips once puzzles exist or in production', async () => {
    setWordlist(DEFAULT_SEED_WORDS);
    const db = await createDb(':memory:');
    try {
      const prodSkipped = await ensureBootSeed(db, { NODE_ENV: 'production' });
      expect(prodSkipped).toBe(false);

      const devSeeded = await ensureBootSeed(db, { NODE_ENV: 'development' });
      expect(devSeeded).toBe(true);
      expect(getWordlist().size).toBe(DEFAULT_SEED_WORDS.length);

      const countRow = await db
        .selectFrom('puzzles')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();
      expect(Number(countRow.count)).toBeGreaterThan(0);

      const secondRun = await ensureBootSeed(db, { NODE_ENV: 'development' });
      expect(secondRun).toBe(false);
    } finally {
      await db.destroy();
    }
  });

  it('never auto-seeds an empty kysely-libsql database in development unless SEED_ON_BOOT=true', async () => {
    setWordlist(DEFAULT_SEED_WORDS);
    const db = await createDb(':memory:');
    try {
      const libsqlSkipped = await ensureBootSeed(db, { NODE_ENV: 'development' }, 'kysely-libsql');
      expect(libsqlSkipped).toBe(false);

      const emptyCount = await db
        .selectFrom('puzzles')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();
      expect(Number(emptyCount.count)).toBe(0);

      const explicitSeeded = await ensureBootSeed(
        db,
        { NODE_ENV: 'development', SEED_ON_BOOT: 'true' },
        'kysely-libsql',
      );
      expect(explicitSeeded).toBe(true);

      const seededCount = await db
        .selectFrom('puzzles')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();
      expect(Number(seededCount.count)).toBeGreaterThan(0);
    } finally {
      await db.destroy();
    }
  });

  it('closes HTTP server, checkpoints SQLite WAL, and destroys database connection cleanly', async () => {
    const dbFile = path.join(
      os.tmpdir(),
      `sanakenno-lifecycle-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    tempFiles.push(dbFile);

    const db = await createDb(dbFile);
    await db
      .insertInto('puzzles')
      .values({ slot: 1, letters: 'a,e,i,k,l,n,s', center: 'a', is_active: 1 })
      .execute();

    const closeIdleSpy = vi.fn();
    const closeSpy = vi.fn((cb?: (err?: Error) => void) => {
      cb?.();
    });

    await shutdownServer({ close: closeSpy, closeIdleConnections: closeIdleSpy }, db);

    expect(closeIdleSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
    await expect(db.selectFrom('puzzles').select('slot').execute()).rejects.toThrow();

    // Verify WAL checkpoint truncated frames cleanly into the main DB file
    const reopened = await createDb(dbFile);
    try {
      const row = await reopened.selectFrom('puzzles').select('slot').executeTakeFirst();
      expect(row?.slot).toBe(1);
    } finally {
      await reopened.destroy();
    }

    // Also verify bounded drain timeout when server.close hangs on keep-alive connections
    const stalledDb = await createDb(':memory:');
    const stalledClose = vi.fn(() => {
      // Never invokes callback
    });
    await shutdownServer({ close: stalledClose }, stalledDb, 'kysely-sqlite', 25);
    expect(stalledClose).toHaveBeenCalledTimes(1);
  });
});
