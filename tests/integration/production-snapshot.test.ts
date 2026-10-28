import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../packages/server/src/app.js';
import { createDb } from '../../packages/server/src/db/connection.js';

const PROD_DB_SOURCE = process.env.PROD_DB_SNAPSHOT;

const hasProdDbSnapshot = Boolean(PROD_DB_SOURCE && fs.existsSync(PROD_DB_SOURCE));

const KOTUS_WORDS_PATH =
  process.env.WORDLIST_PATH ??
  path.resolve(import.meta.dirname, '../../packages/server/assets/kotus_words.txt');

describe('Kotus Wordlist Snapshot Verification', () => {
  it('loads real Finnish Kotus dictionary snapshot and validates word counts', async () => {
    expect(
      fs.existsSync(KOTUS_WORDS_PATH),
      `kotus_words.txt must exist at ${KOTUS_WORDS_PATH}`,
    ).toBe(true);

    const { loadWordlist, computePuzzle } =
      await import('../../packages/server/src/features/puzzle/wordlist.js');
    const words = loadWordlist(KOTUS_WORDS_PATH);
    expect(words.size).toBeGreaterThan(90000);
    expect(words.has('aurinko')).toBe(true);
    expect(words.has('suomi')).toBe(true);
    expect(words.has('sana')).toBe(true);
    expect(words.has('kenno')).toBe(true);

    const puzzle = computePuzzle(['a', 'e', 'i', 'k', 'l', 'n', 's'], 'a', []);
    expect(puzzle.hint_data.word_count).toBeGreaterThan(30);
    expect(puzzle.hint_data.pangram_count).toBeGreaterThanOrEqual(1);
    expect(puzzle.max_score).toBeGreaterThan(50);
  });
});

describe.skipIf(!hasProdDbSnapshot)('Production 1.0 Snapshot Verification', () => {
  let tempDir: string;
  let tempDbPath: string;
  let db: ReturnType<typeof createDb>;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    if (!hasProdDbSnapshot || !PROD_DB_SOURCE) return;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanakenno-snapshot-'));
    tempDbPath = path.join(tempDir, 'snapshot.db');
    fs.copyFileSync(PROD_DB_SOURCE, tempDbPath);

    db = createDb(tempDbPath);
    app = createApp(db);
  });

  afterAll(async () => {
    if (db) {
      await db.destroy();
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('runs migrations cleanly and verifies puzzle catalogue integrity', async () => {
    const allPuzzles = await db.selectFrom('puzzles').select('slot').execute();
    expect(allPuzzles.length).toBeGreaterThanOrEqual(190);

    const activePuzzles = await db
      .selectFrom('puzzles')
      .where('is_active', '=', 1)
      .select(['slot', 'letters', 'center'])
      .execute();

    expect(activePuzzles.length).toBeGreaterThan(0);
    for (const p of activePuzzles) {
      const cleanLetters = p.letters.replace(/,/g, '');
      expect(cleanLetters.length).toBe(7);
      expect(cleanLetters).toContain(p.center);
    }
  });

  it('serves /api/health with rotation headroom from production cycle', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      total_puzzles: number;
      days_remaining: number;
    };

    expect(body.status).toBe('ok');
    expect(body.total_puzzles).toBeGreaterThanOrEqual(190);
    expect(body.days_remaining).toBeGreaterThan(0);
  });

  it('serves /api/puzzle with valid daily puzzle from production catalogue', async () => {
    const res = await app.request('/api/puzzle');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      center: string;
      letters: string[];
      word_hashes: string[];
      hint_data: {
        word_count: number;
        pangram_count: number;
      };
      display_number: number;
    };

    expect(typeof body.center).toBe('string');
    expect(body.letters.length).toBe(6);
    expect(body.word_hashes.length).toBeGreaterThan(0);
    expect(body.hint_data.word_count).toBe(body.word_hashes.length);
    expect(body.hint_data.pangram_count).toBeGreaterThanOrEqual(1);
    expect(body.display_number).toBeGreaterThanOrEqual(1);
  });

  it('serves /api/archive without SQL errors on real production data', async () => {
    const res = await app.request('/api/archive');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{
      date: string;
      puzzle_number: number;
      display_number: number;
      center: string;
      letters: string[];
    }>;

    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(7);
    for (const item of body) {
      expect(item.letters.length).toBe(7);
      expect(typeof item.center).toBe('string');
    }
  });

  it('allows player session initialization, state push, and telemetry records', async () => {
    const initRes = await app.request('/api/player/auth/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(initRes.status).toBe(200);
    const initData = (await initRes.json()) as { token: string; playerId: string };
    expect(initData.token).toBeTruthy();

    const authHeaders = {
      Authorization: `Bearer ${initData.token}`,
      'Content-Type': 'application/json',
    };

    const stateRes = await app.request('/api/player/sync/state', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        puzzle_number: 1,
        found_words: ['sana', 'kenno'],
        score: 42,
        hints_unlocked: [],
      }),
    });
    expect(stateRes.status).toBe(200);

    const failGuessRes = await app.request('/api/failed-guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word: 'höpöhöpö',
        date: '2026-10-28',
      }),
    });
    expect(failGuessRes.status).toBe(200);

    const wordFindRes = await app.request('/api/word-find', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word: 'sana',
        puzzle_number: 1,
      }),
    });
    expect(wordFindRes.status).toBe(200);
  });

  it('serves admin schedule and analytics on real production snapshot history', async () => {
    const { createAdminSession } =
      await import('../../packages/server/src/features/admin-auth/admin-auth.queries.js');
    const admin = await db.selectFrom('admins').selectAll().limit(1).executeTakeFirstOrThrow();

    const session = await createAdminSession(db, admin.id);
    const adminHeaders = {
      Cookie: `sanakenno_session=${session.sessionId}`,
      'X-CSRF-Token': session.csrfToken,
    };

    const scheduleRes = await app.request('/api/admin/schedule?days=7', {
      headers: adminHeaders,
    });
    expect(scheduleRes.status).toBe(200);
    const scheduleData = (await scheduleRes.json()) as {
      start: string;
      days: number;
      schedule: Array<{
        date: string;
        slot: number;
        display_number: number;
        letters: string[] | null;
        center: string | null;
      }>;
      total_puzzles: number;
    };
    expect(scheduleData.total_puzzles).toBeGreaterThanOrEqual(190);
    expect(Array.isArray(scheduleData.schedule)).toBe(true);
    expect(scheduleData.schedule.length).toBe(7);

    const slotsRes = await app.request('/api/admin/puzzle/slots', {
      headers: adminHeaders,
    });
    expect(slotsRes.status).toBe(200);
    const slotsData = (await slotsRes.json()) as {
      slots: Array<{ slot: number; display_number: number }>;
    };
    expect(slotsData.slots.length).toBeGreaterThanOrEqual(190);

    const achievementsRes = await app.request('/api/admin/achievements?mode=all', {
      headers: adminHeaders,
    });
    expect(achievementsRes.status).toBe(200);
    const achievements = (await achievementsRes.json()) as {
      days: number;
      daily: Array<{ date: string; ranks: Record<string, number> }>;
      totals: Record<string, number>;
      mode: string;
    };
    expect(achievements.mode).toBe('all');
    expect(Array.isArray(achievements.daily)).toBe(true);
    expect(achievements.totals).toBeDefined();
  });
});
