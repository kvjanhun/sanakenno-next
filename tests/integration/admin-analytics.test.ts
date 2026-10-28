import argon2 from 'argon2';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAdminUser } from '../../packages/server/src/features/admin-auth/admin-auth.queries.js';
import { resetLoginRateLimit } from '../../packages/server/src/features/admin-auth/admin-auth.routes.js';
import {
  DEFAULT_SEED_WORDS,
  setWordlist,
} from '../../packages/server/src/features/puzzle/wordlist.js';
import { createTestHarness } from '../../packages/server/src/testing.js';

describe('Admin Analytics & Word Data (Kysely + Hono integration)', () => {
  let harness: ReturnType<typeof createTestHarness>;
  let sessionCookie: string;
  let csrfToken: string;

  beforeEach(async () => {
    resetLoginRateLimit();
    harness = createTestHarness();
    setWordlist(DEFAULT_SEED_WORDS);

    const hash = await argon2.hash('admin-analytics-secret');
    await createAdminUser(harness.db, 'admin', hash);

    // Seed puzzle 1
    await harness.db
      .insertInto('puzzles')
      .values([{ slot: 1, letters: 'a,e,i,k,l,n,s', center: 'a', is_active: 1 }])
      .execute();

    await harness.db
      .insertInto('config')
      .values({ key: 'epoch_date', value: '2026-01-01' })
      .execute();

    // Login as admin
    const loginRes = await harness.client.api.auth.login.$post({
      json: { username: 'admin', password: 'admin-analytics-secret' },
    });
    expect(loginRes.status).toBe(200);

    const rawCookies = loginRes.headers.get('set-cookie');
    sessionCookie = rawCookies?.split(';')[0] ?? '';

    const data = (await loginRes.json()) as { csrfToken: string };
    csrfToken = data.csrfToken;
  });

  afterEach(async () => {
    resetLoginRateLimit();
    await harness.destroy();
  });

  function adminHeaders() {
    return {
      Cookie: sessionCookie,
      'X-CSRF-Token': csrfToken,
    };
  }

  describe('GET /api/admin/achievements', () => {
    it('refuses unauthenticated requests with 401', async () => {
      const res = await harness.app.request('/api/admin/achievements');
      expect(res.status).toBe(401);
    });

    it('aggregates achievements: unique users mode vs raw events mode', async () => {
      const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');

      // Insert achievements for same session: 'Hyvä alku' and higher 'Onnistuja'
      await harness.db
        .insertInto('achievements')
        .values([
          {
            puzzle_number: 1,
            rank: 'Hyvä alku',
            score: 10,
            max_score: 100,
            words_found: 2,
            session_id: 'player-session-1',
            achieved_at: nowIso,
          },
          {
            puzzle_number: 1,
            rank: 'Onnistuja',
            score: 30,
            max_score: 100,
            words_found: 6,
            session_id: 'player-session-1',
            achieved_at: nowIso,
          },
        ])
        .execute();

      // Query mode=users
      const usersRes = await harness.app.request('/api/admin/achievements?days=7&mode=users', {
        headers: adminHeaders(),
      });
      expect(usersRes.status).toBe(200);
      const usersData = (await usersRes.json()) as {
        totals: Record<string, number>;
        daily: Array<{ total: number; counts: Record<string, number> }>;
      };

      // In users mode, only highest rank 'Onnistuja' is counted for the user
      expect(usersData.totals['Onnistuja']).toBe(1);
      expect(usersData.totals['Hyvä alku']).toBe(0);

      // Query mode=all
      const allRes = await harness.app.request('/api/admin/achievements?days=7&mode=all', {
        headers: adminHeaders(),
      });
      expect(allRes.status).toBe(200);
      const allData = (await allRes.json()) as {
        totals: Record<string, number>;
        daily: Array<{ total: number; counts: Record<string, number> }>;
      };

      // In all mode, both events are counted
      expect(allData.totals['Onnistuja']).toBe(1);
      expect(allData.totals['Hyvä alku']).toBe(1);
    });
  });

  describe('GET /api/admin/failed-guesses', () => {
    it('returns daily failed guess counts and top words per day', async () => {
      const todayStr = new Date().toISOString().slice(0, 10);

      await harness.db
        .insertInto('failed_guesses')
        .values([
          { puzzle_date: todayStr, word: 'kissa', count: 12 },
          { puzzle_date: todayStr, word: 'koira', count: 5 },
        ])
        .execute();

      const res = await harness.app.request('/api/admin/failed-guesses?days=7', {
        headers: adminHeaders(),
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        days: number;
        grand_total: number;
        daily: Array<{
          date: string;
          total_count: number;
          words: Array<{ word: string; count: number }>;
        }>;
      };

      expect(body.grand_total).toBe(17);
      const todayEntry = body.daily.find((d) => d.date === todayStr);
      expect(todayEntry).toBeDefined();
      expect(todayEntry?.total_count).toBe(17);
      expect(todayEntry?.words[0]?.word).toBe('kissa');
      expect(todayEntry?.words[0]?.count).toBe(12);
    });
  });

  describe('GET /api/admin/word-finds', () => {
    it('returns per-puzzle find counts including zero-count unfound words', async () => {
      // Record find for 'aika'
      await harness.db
        .insertInto('word_finds')
        .values([{ puzzle_number: 1, word: 'aika', count: 8 }])
        .execute();

      const res = await harness.app.request('/api/admin/word-finds?display_number=1', {
        headers: adminHeaders(),
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        puzzle_number: number;
        display_number: number;
        total_words: number;
        recorded_words: number;
        total_finds: number;
        words: Array<{ word: string; find_count: number }>;
      };

      expect(body.display_number).toBe(1);
      expect(body.total_words).toBeGreaterThan(0);
      expect(body.recorded_words).toBe(1);
      expect(body.total_finds).toBe(8);

      const aika = body.words.find((w) => w.word === 'aika');
      expect(aika?.find_count).toBe(8);

      // Other valid words in slot 1 have find_count = 0
      const unfound = body.words.filter((w) => w.find_count === 0);
      expect(unfound.length).toBeGreaterThan(0);
    });
  });
});
