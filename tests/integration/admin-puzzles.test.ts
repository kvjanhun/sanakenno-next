import argon2 from 'argon2';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminUser } from '../../packages/server/src/features/admin-auth/admin-auth.queries.js';
import {
  DUMMY_HASH,
  resetLoginRateLimit,
} from '../../packages/server/src/features/admin-auth/admin-auth.routes.js';
import {
  DEFAULT_SEED_WORDS,
  setWordlist,
} from '../../packages/server/src/features/puzzle/wordlist.js';
import { createTestHarness } from '../../packages/server/src/testing.js';

describe('Admin Auth & Puzzle Editor (Kysely + Hono integration)', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;
  let adminId: number;
  let sessionCookie: string;
  let csrfToken: string;

  beforeEach(async () => {
    resetLoginRateLimit();
    harness = await createTestHarness();
    setWordlist(DEFAULT_SEED_WORDS);

    const hash = await argon2.hash('correct-horse-battery-staple');
    adminId = await createAdminUser(harness.db, 'admin', hash);
    expect(adminId).toBeGreaterThan(0);

    await harness.db
      .insertInto('puzzles')
      .values([
        { slot: 1, letters: 'a,e,i,k,l,n,s', center: 'a', is_active: 1 },
        { slot: 2, letters: 'e,h,i,k,n,o,s', center: 'n', is_active: 1 },
        { slot: 3, letters: 'a,e,i,k,l,n,s', center: 'k', is_active: 1 },
      ])
      .execute();

    await harness.db
      .insertInto('config')
      .values({ key: 'epoch_date', value: '2026-01-01' })
      .execute();

    // Login as admin
    const loginRes = await harness.client.api.auth.login.$post({
      json: { username: 'admin', password: 'correct-horse-battery-staple' },
    });
    expect(loginRes.status).toBe(200);

    const rawCookies = loginRes.headers.get('set-cookie');
    expect(rawCookies).toBeTruthy();
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

  describe('Admin Auth & CSRF Guardrails', () => {
    it('verifies session and returns username + csrfToken', async () => {
      const res = await harness.client.api.auth.session.$get(
        {},
        { headers: { Cookie: sessionCookie } },
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as { username: string; csrfToken: string };
      expect(data.username).toBe('admin');
      expect(data.csrfToken).toBe(csrfToken);
    });

    it('rejects state-changing requests missing CSRF token with 403', async () => {
      const res = await harness.client.api.admin.puzzle.$post(
        {
          json: { letters: 'a,e,i,k,l,n,s', center: 'e' },
        },
        { headers: { Cookie: sessionCookie } }, // no X-CSRF-Token
      );
      expect(res.status).toBe(403);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await harness.client.api.admin.puzzle.$post(
        {
          json: { letters: 'a,e,i,k,l,n,s', center: 'e' },
        },
        { headers: { 'X-CSRF-Token': csrfToken } }, // no Cookie
      );
      expect(res.status).toBe(401);
    });

    it('changes admin password and invalidates previous sessions', async () => {
      const changeRes = await harness.client.api.auth['change-password'].$post(
        {
          json: {
            currentPassword: 'correct-horse-battery-staple',
            newPassword: 'new-secure-password-1234',
          },
        },
        { headers: adminHeaders() },
      );
      expect(changeRes.status).toBe(200);

      // Verify login with new password works
      const loginRes = await harness.client.api.auth.login.$post({
        json: { username: 'admin', password: 'new-secure-password-1234' },
      });
      expect(loginRes.status).toBe(200);

      const adminRow = await harness.db
        .selectFrom('admins')
        .select('updated_at')
        .where('id', '=', adminId)
        .executeTakeFirstOrThrow();
      expect(adminRow.updated_at).toBeTruthy();
    });

    it('verifies DUMMY_HASH in Argon2 without throwing a salt-length error and enforces CSRF on POST /api/auth/logout', async () => {
      await expect(argon2.verify(DUMMY_HASH, 'any-password')).resolves.toBe(false);

      // Missing CSRF token on logout returns 403
      const missingCsrf = await harness.client.api.auth.logout.$post(
        {},
        { headers: { Cookie: sessionCookie } },
      );
      expect(missingCsrf.status).toBe(403);

      // Valid CSRF token deletes session and clears cookie
      const okLogout = await harness.client.api.auth.logout.$post({}, { headers: adminHeaders() });
      expect(okLogout.status).toBe(200);

      const sessionAfter = await harness.client.api.auth.session.$get(
        {},
        { headers: { Cookie: sessionCookie } },
      );
      expect(sessionAfter.status).toBe(401);
    });

    it('enforces sliding-window rate limit on admin login and resets after window expires', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-10T10:00:00Z'));
      resetLoginRateLimit();

      try {
        for (let i = 0; i < 5; i++) {
          const res = await harness.app.request('/api/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Forwarded-For': '198.51.100.88',
            },
            body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
          });
          expect(res.status).toBe(401);
        }

        const blocked = await harness.app.request('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '198.51.100.88',
          },
          body: JSON.stringify({ username: 'admin', password: 'correct-horse-battery-staple' }),
        });
        expect(blocked.status).toBe(429);

        // Advance past 15-minute sliding window
        vi.advanceTimersByTime(15 * 60 * 1000 + 1000);

        const allowedAgain = await harness.app.request('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '198.51.100.88',
          },
          body: JSON.stringify({ username: 'admin', password: 'correct-horse-battery-staple' }),
        });
        expect(allowedAgain.status).toBe(200);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Duplicate Protection & Puzzle Writes', () => {
    it('refuses exact duplicates (same letters and center) with 409', async () => {
      const res = await harness.client.api.admin.puzzle.$post(
        {
          json: { letters: 'a,e,i,k,l,n,s', center: 'a' }, // slot 1 has this
        },
        { headers: adminHeaders() },
      );
      expect(res.status).toBe(409);
      const data = (await res.json()) as unknown as { error: string };
      expect(data.error).toContain('Sama peli on jo kierrossa');
    });

    it('requires force: true for same letters with different center', async () => {
      const res1 = await harness.client.api.admin.puzzle.$post(
        {
          json: { letters: 'a,e,i,k,l,n,s', center: 'l' }, // slot 1 has center 'a'
        },
        { headers: adminHeaders() },
      );
      expect(res1.status).toBe(409);
      const data = (await res1.json()) as unknown as { requires_force: boolean };
      expect(data.requires_force).toBe(true);

      const res2 = await harness.client.api.admin.puzzle.$post(
        {
          json: { letters: 'a,e,i,k,l,n,s', center: 'l', force: true },
        },
        { headers: adminHeaders() },
      );
      expect(res2.status).toBe(200);
      const saved = (await res2.json()) as { slot: number };
      const savedRow = await harness.db
        .selectFrom('puzzles')
        .select('computed_data')
        .where('slot', '=', saved.slot)
        .executeTakeFirstOrThrow();
      expect(savedRow.computed_data).toBeTruthy();
    });

    it('soft-deletes puzzle, preserves slot, and closes display_number gap', async () => {
      // Soft-delete slot 2
      const delRes = await harness.client.api.admin.puzzle[':slot'].$delete(
        { param: { slot: '2' } },
        { headers: adminHeaders() },
      );
      expect(delRes.status).toBe(200);

      const slotsRes = await harness.client.api.admin.puzzle.slots.$get(
        {},
        { headers: adminHeaders() },
      );
      const slotsData = (await slotsRes.json()) as {
        slots: Array<{ slot: number; display_number: number }>;
        today_slot: number | null;
      };

      expect(slotsData.slots).toEqual([
        { slot: 1, display_number: 1 },
        { slot: 3, display_number: 2 }, // gap closed
      ]);
      expect([1, 3]).toContain(slotsData.today_slot);
    });

    it('swaps two puzzle slots including precomputed computed_data', async () => {
      await harness.client.api.admin.puzzle.center.$post(
        { json: { slot: 1, center: 'a' } },
        { headers: adminHeaders() },
      );
      await harness.client.api.admin.puzzle.center.$post(
        { json: { slot: 2, center: 'n' } },
        { headers: adminHeaders() },
      );
      const before = await harness.db
        .selectFrom('puzzles')
        .select(['slot', 'computed_data'])
        .where('slot', 'in', [1, 2])
        .execute();
      const before1 = before.find((r) => r.slot === 1)?.computed_data;
      const before2 = before.find((r) => r.slot === 2)?.computed_data;

      const swapRes = await harness.client.api.admin.puzzle.swap.$post(
        { json: { slotA: 1, slotB: 2 } },
        { headers: adminHeaders() },
      );
      expect(swapRes.status).toBe(200);

      const after = await harness.db
        .selectFrom('puzzles')
        .selectAll()
        .where('slot', 'in', [1, 2])
        .execute();
      const p1 = after.find((r) => r.slot === 1);
      const p2 = after.find((r) => r.slot === 2);

      expect(p1?.center).toBe('n');
      expect(p2?.center).toBe('a');
      expect(p1?.computed_data).toBe(before2);
      expect(p2?.computed_data).toBe(before1);

      // Refuses swapping with a missing or soft-deleted slot with 404
      const missingSwap = await harness.client.api.admin.puzzle.swap.$post(
        { json: { slotA: 1, slotB: 999 } },
        { headers: adminHeaders() },
      );
      expect(missingSwap.status).toBe(404);

      await harness.db.updateTable('puzzles').set({ is_active: 0 }).where('slot', '=', 2).execute();
      const inactiveSwap = await harness.client.api.admin.puzzle.swap.$post(
        { json: { slotA: 1, slotB: 2 } },
        { headers: adminHeaders() },
      );
      expect(inactiveSwap.status).toBe(404);
    });

    it('changes center letter for a puzzle slot', async () => {
      const centerRes = await harness.client.api.admin.puzzle.center.$post(
        { json: { slot: 1, center: 'i' } },
        { headers: adminHeaders() },
      );
      expect(centerRes.status).toBe(200);

      const p1 = await harness.db
        .selectFrom('puzzles')
        .selectAll()
        .where('slot', '=', 1)
        .executeTakeFirst();
      expect(p1?.center).toBe('i');
      expect(p1?.max_score).toBeGreaterThan(0);
      expect(p1?.computed_data).toBeTruthy();
      expect((JSON.parse(p1!.computed_data!) as { words: string[] }).words).toContain('aika');
    });

    it('fetches puzzle variations by slot and display_number with neighbour slots', async () => {
      const bySlotRes = await harness.client.api.admin.puzzle.variations.$get(
        { query: { slot: '1' } },
        { headers: adminHeaders() },
      );
      expect(bySlotRes.status).toBe(200);
      const slotData = (await bySlotRes.json()) as unknown as {
        slot: number;
        display_number: number;
        variations: Array<{ center: string; is_active: boolean }>;
        next_slot: number | null;
      };
      expect(slotData.slot).toBe(1);
      expect(slotData.display_number).toBe(1);
      expect(slotData.variations).toHaveLength(7);
      expect(slotData.next_slot).toBe(2);

      const byDispRes = await harness.client.api.admin.puzzle.variations.$get(
        { query: { display_number: '1' } },
        { headers: adminHeaders() },
      );
      expect(byDispRes.status).toBe(200);
      const dispData = (await byDispRes.json()) as unknown as { slot: number };
      expect(dispData.slot).toBe(1);

      // Soft-deleting slot 2 causes neighbour navigation from slot 1 to skip slot 2 and point to slot 3
      await harness.db.updateTable('puzzles').set({ is_active: 0 }).where('slot', '=', 2).execute();
      const skipInactiveRes = await harness.client.api.admin.puzzle.variations.$get(
        { query: { slot: '1' } },
        { headers: adminHeaders() },
      );
      const skipData = (await skipInactiveRes.json()) as unknown as { next_slot: number | null };
      expect(skipData.next_slot).toBe(3);
    });

    it('allows slot 0 creation, updates, and swaps', async () => {
      // Save puzzle into slot 0
      const save0Res = await harness.client.api.admin.puzzle.$post(
        {
          json: { slot: 0, letters: 'e,h,l,m,o,r,u', center: 'e' },
        },
        { headers: adminHeaders() },
      );
      expect(save0Res.status).toBe(200);
      const save0Data = (await save0Res.json()) as { slot: number };
      expect(save0Data.slot).toBe(0);

      // Verify slot 0 can be fetched by slot
      const var0Res = await harness.client.api.admin.puzzle.variations.$get(
        { query: { slot: '0' } },
        { headers: adminHeaders() },
      );
      expect(var0Res.status).toBe(200);
      const var0Data = (await var0Res.json()) as unknown as { slot: number; center: string };
      expect(var0Data.slot).toBe(0);
      expect(var0Data.center).toBe('e');
    });
  });

  describe('Word Blocking & Preview', () => {
    it('blocks a word, recomputes affected puzzles.max_score, rejects duplicates with 409, and unblocks', async () => {
      // Ensure initial max_score is populated on slot 1
      await harness.client.api.admin.puzzle.center.$post(
        { json: { slot: 1, center: 'a' } },
        { headers: adminHeaders() },
      );
      const slot1Before = await harness.db
        .selectFrom('puzzles')
        .select('max_score')
        .where('slot', '=', 1)
        .executeTakeFirstOrThrow();

      const previewBefore = await harness.client.api.admin.preview.$post(
        { json: { letters: 'a,e,i,k,l,n,s', center: 'a' } },
        { headers: adminHeaders() },
      );
      const beforeData = (await previewBefore.json()) as unknown as { words: string[] };
      expect(beforeData.words).toContain('kana');

      const blockRes = await harness.client.api.admin.block.$post(
        { json: { word: 'kana' } },
        { headers: adminHeaders() },
      );
      expect(blockRes.status).toBe(200);

      // Duplicate block returns 409 Conflict
      const dupBlockRes = await harness.client.api.admin.block.$post(
        { json: { word: 'kana' } },
        { headers: adminHeaders() },
      );
      expect(dupBlockRes.status).toBe(409);

      // Persisted puzzles.max_score AND computed_data for affected slot 1 updated immediately
      const slot1Blocked = await harness.db
        .selectFrom('puzzles')
        .select(['max_score', 'computed_data'])
        .where('slot', '=', 1)
        .executeTakeFirstOrThrow();
      expect(slot1Blocked.max_score).toBe(Number(slot1Before.max_score) - 1);
      expect(slot1Blocked.computed_data).toBeTruthy();
      expect((JSON.parse(slot1Blocked.computed_data!) as { words: string[] }).words).not.toContain(
        'kana',
      );

      // Player read immediately observes the blocked word removal without any cache invalidation
      const puzzleAfterBlock = await harness.client.api.puzzle[':number'].$get({
        param: { number: '1' },
      });
      expect(puzzleAfterBlock.status).toBe(200);
      const puzzleAfterBlockBody = (await puzzleAfterBlock.json()) as { max_score: number };
      expect(puzzleAfterBlockBody.max_score).toBe(Number(slot1Before.max_score) - 1);

      const previewAfter = await harness.client.api.admin.preview.$post(
        { json: { letters: 'a,e,i,k,l,n,s', center: 'a' } },
        { headers: adminHeaders() },
      );
      const afterData = (await previewAfter.json()) as unknown as { words: string[] };
      expect(afterData.words).not.toContain('kana');

      const listRes = await harness.client.api.admin.blocked.$get({}, { headers: adminHeaders() });
      const listData = (await listRes.json()) as { blocked: Array<{ id: number; word: string }> };
      const blockedId = listData.blocked.find((b) => b.word === 'kana')?.id;
      expect(blockedId).toBeTruthy();

      const unblockRes = await harness.client.api.admin.block[':id'].$delete(
        { param: { id: String(blockedId) } },
        { headers: adminHeaders() },
      );
      expect(unblockRes.status).toBe(200);

      // Persisted puzzles.max_score and computed_data restored after unblock, and deleting non-existent id returns 404
      const slot1Restored = await harness.db
        .selectFrom('puzzles')
        .select(['max_score', 'computed_data'])
        .where('slot', '=', 1)
        .executeTakeFirstOrThrow();
      expect(slot1Restored.max_score).toBe(slot1Before.max_score);
      expect((JSON.parse(slot1Restored.computed_data!) as { words: string[] }).words).toContain(
        'kana',
      );

      const missingUnblock = await harness.client.api.admin.block[':id'].$delete(
        { param: { id: String(blockedId) } },
        { headers: adminHeaders() },
      );
      expect(missingUnblock.status).toBe(404);
    });
  });

  describe('14-Day Schedule', () => {
    it('returns upcoming puzzle rotation schedule without N+1 queries and rejects invalid start dates with 400', async () => {
      const res = await harness.client.api.admin.schedule.$get(
        { query: { days: '90' } },
        { headers: adminHeaders() },
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        schedule: Array<{ date: string; slot: number; display_number: number }>;
      };
      expect(data.schedule).toHaveLength(90);
      expect(data.schedule[0]?.display_number).toBeGreaterThan(0);

      const badStartRes = await harness.client.api.admin.schedule.$get(
        { query: { start: '2026-99-99' } },
        { headers: adminHeaders() },
      );
      expect(badStartRes.status).toBe(400);
    });
  });
});
