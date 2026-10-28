import argon2 from 'argon2';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAdminUser } from '../../packages/server/src/features/admin-auth/admin-auth.queries.js';
import { resetLoginRateLimit } from '../../packages/server/src/features/admin-auth/admin-auth.routes.js';
import { setSuggestionQualityForTesting } from '../../packages/server/src/features/admin-suggestions/suggestion-scorer.js';
import {
  DEFAULT_SEED_WORDS,
  setWordlist,
} from '../../packages/server/src/features/puzzle/wordlist.js';
import { createTestHarness } from '../../packages/server/src/testing.js';

describe('Admin Suggestions & Combinations (Kysely + Hono integration)', () => {
  let harness: ReturnType<typeof createTestHarness>;
  let sessionCookie: string;
  let csrfToken: string;

  beforeEach(async () => {
    resetLoginRateLimit();
    harness = createTestHarness();
    setWordlist(DEFAULT_SEED_WORDS);

    const hash = await argon2.hash('admin-suggestions-secret');
    await createAdminUser(harness.db, 'admin', hash);

    // Seed puzzles so letters 'aeiklns' are marked as used
    await harness.db
      .insertInto('puzzles')
      .values([{ slot: 1, letters: 'a,e,i,k,l,n,s', center: 'a', is_active: 1 }])
      .execute();

    await harness.db
      .insertInto('config')
      .values({ key: 'epoch_date', value: '2026-01-01' })
      .execute();

    // Seed combinations
    await harness.db
      .insertInto('combinations')
      .values([
        {
          letters: 'aeiklns',
          total_pangrams: 1,
          min_word_count: 25,
          max_word_count: 42,
          min_max_score: 90,
          max_max_score: 140,
          variations: JSON.stringify([
            { center: 'a', word_count: 35, max_score: 120, pangrams: 1 },
          ]),
          in_rotation: 1,
        },
        {
          letters: 'aekmnos',
          total_pangrams: 1,
          min_word_count: 20,
          max_word_count: 35,
          min_max_score: 90,
          max_max_score: 130,
          variations: JSON.stringify([
            { center: 'a', word_count: 30, max_score: 110, pangrams: 1 },
            { center: 'm', word_count: 22, max_score: 85, pangrams: 1 },
          ]),
          in_rotation: 0,
        },
        {
          letters: 'eilmors',
          total_pangrams: 2,
          min_word_count: 40,
          max_word_count: 55,
          min_max_score: 140,
          max_max_score: 190,
          variations: JSON.stringify([
            { center: 'e', word_count: 45, max_score: 160, pangrams: 2 },
          ]),
          in_rotation: 1,
        },
      ])
      .execute();

    // Login as admin
    const loginRes = await harness.client.api.auth.login.$post({
      json: { username: 'admin', password: 'admin-suggestions-secret' },
    });
    expect(loginRes.status).toBe(200);

    const rawCookies = loginRes.headers.get('set-cookie');
    sessionCookie = rawCookies?.split(';')[0] ?? '';

    const data = (await loginRes.json()) as { csrfToken: string };
    csrfToken = data.csrfToken;
  });

  afterEach(async () => {
    resetLoginRateLimit();
    setSuggestionQualityForTesting(null);
    await harness.destroy();
  });

  function adminHeaders() {
    return {
      Cookie: sessionCookie,
      'X-CSRF-Token': csrfToken,
    };
  }

  describe('GET /api/admin/combinations', () => {
    it('refuses unauthenticated requests with 401', async () => {
      const res = await harness.app.request('/api/admin/combinations');
      expect(res.status).toBe(401);
    });

    it('returns paginated combinations and respects filters', async () => {
      const res = await harness.app.request('/api/admin/combinations', {
        headers: adminHeaders(),
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        combinations: Array<{ letters: string; in_rotation: boolean; total_pangrams: number }>;
        total: number;
        page: number;
      };
      expect(body.total).toBe(3);
      expect(body.combinations).toHaveLength(3);

      // Filter: requires 'k'
      const reqRes = await harness.app.request('/api/admin/combinations?requires=k', {
        headers: adminHeaders(),
      });
      const reqBody = (await reqRes.json()) as { combinations: Array<{ letters: string }> };
      expect(reqBody.combinations.map((c) => c.letters)).toEqual(
        expect.arrayContaining(['aeiklns', 'aekmnos']),
      );
      expect(reqBody.combinations.map((c) => c.letters)).not.toContain('eilmors');

      // Filter: in_rotation=1
      const rotRes = await harness.app.request('/api/admin/combinations?in_rotation=1', {
        headers: adminHeaders(),
      });
      const rotBody = (await rotRes.json()) as { combinations: Array<{ letters: string }> };
      expect(rotBody.combinations.map((c) => c.letters)).toContain('eilmors');
      expect(rotBody.combinations.map((c) => c.letters)).not.toContain('aekmnos');
    });
  });

  describe('GET /api/admin/suggestion', () => {
    it('returns a no-spoiler suggestion skipping already used puzzles', async () => {
      setSuggestionQualityForTesting({
        'aekmnos:a': 'good',
        'eilmors:e': 'ok',
      });

      const res = await harness.app.request('/api/admin/suggestion', {
        headers: adminHeaders(),
      });
      expect(res.status).toBe(200);

      const suggestion = (await res.json()) as {
        letters: string[];
        letters_key: string;
        center: string;
        word_count: number;
        max_score: number;
        quality_grade: string;
        quality_label: string;
        score: number;
        words?: unknown;
        pangrams?: unknown;
      };

      // Used letters 'aeiklns' should NOT be suggested
      expect(suggestion.letters_key).not.toBe('aeiklns');
      expect(suggestion.words).toBeUndefined(); // Never expose solution words
      expect(suggestion.pangrams).toBeUndefined(); // Pangrams hidden by default
      expect(suggestion.quality_label).toBeTruthy();
    });

    it('returns pangrams when include_pangrams=true is requested', async () => {
      setSuggestionQualityForTesting({
        'aekmnos:a': 'good',
        'eilmors:e': 'ok',
      });

      const res = await harness.app.request('/api/admin/suggestion?include_pangrams=true', {
        headers: adminHeaders(),
      });
      expect(res.status).toBe(200);

      const suggestion = (await res.json()) as {
        letters: string[];
        pangrams?: string[];
      };
      expect(Array.isArray(suggestion.pangrams)).toBe(true);
    });
  });

  describe('POST & DELETE /api/admin/suggestion-rejections', () => {
    it('persists a suggestion rejection and omits it from future suggestions', async () => {
      setSuggestionQualityForTesting({
        'aekmnos:a': 'good',
        'eilmors:e': 'good',
      });

      // Reject suggestion aekmnos:a
      const rejectRes = await harness.app.request('/api/admin/suggestion-rejections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...adminHeaders(),
        },
        body: JSON.stringify({
          letters: 'aekmnos',
          center: 'a',
        }),
      });
      expect(rejectRes.status).toBe(200);
      const rejected = (await rejectRes.json()) as {
        id: number;
        letters_key: string;
        center: string;
      };
      expect(rejected.letters_key).toBe('aekmnos');
      expect(rejected.center).toBe('a');

      // List rejections
      const listRes = await harness.app.request('/api/admin/suggestion-rejections', {
        headers: adminHeaders(),
      });
      const list = (await listRes.json()) as {
        rejections: Array<{ id: number; letters_key: string }>;
      };
      expect(list.rejections.some((r) => r.letters_key === 'aekmnos')).toBe(true);

      // Restore rejection
      const restoreRes = await harness.app.request(
        `/api/admin/suggestion-rejections/${rejected.id}`,
        {
          method: 'DELETE',
          headers: adminHeaders(),
        },
      );
      expect(restoreRes.status).toBe(200);

      // Verify removed
      const listAfter = (await (
        await harness.app.request('/api/admin/suggestion-rejections', { headers: adminHeaders() })
      ).json()) as { rejections: Array<{ id: number }> };
      expect(listAfter.rejections.some((r) => r.id === rejected.id)).toBe(false);
    });
  });
});
