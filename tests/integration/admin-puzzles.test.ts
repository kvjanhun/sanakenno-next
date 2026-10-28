import argon2 from 'argon2';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAdminUser } from '../../packages/server/src/features/admin-auth/admin-auth.queries.js';
import { resetLoginRateLimit } from '../../packages/server/src/features/admin-auth/admin-auth.routes.js';
import {
  DEFAULT_SEED_WORDS,
  setWordlist,
} from '../../packages/server/src/features/puzzle/wordlist.js';
import { createTestHarness } from '../../packages/server/src/testing.js';

describe('Admin Auth & Puzzle Editor (Kysely + Hono integration)', () => {
  let harness: ReturnType<typeof createTestHarness>;
  let adminId: number;
  let sessionCookie: string;
  let csrfToken: string;

  beforeEach(async () => {
    resetLoginRateLimit();
    harness = createTestHarness();
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
      };

      expect(slotsData.slots).toEqual([
        { slot: 1, display_number: 1 },
        { slot: 3, display_number: 2 }, // gap closed
      ]);
    });

    it('swaps two puzzle slots', async () => {
      const swapRes = await harness.client.api.admin.puzzle.swap.$post(
        { json: { slotA: 1, slotB: 2 } },
        { headers: adminHeaders() },
      );
      expect(swapRes.status).toBe(200);

      const p1 = await harness.db
        .selectFrom('puzzles')
        .selectAll()
        .where('slot', '=', 1)
        .executeTakeFirst();
      const p2 = await harness.db
        .selectFrom('puzzles')
        .selectAll()
        .where('slot', '=', 2)
        .executeTakeFirst();

      expect(p1?.center).toBe('n');
      expect(p2?.center).toBe('a');
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
    });
  });

  describe('Word Blocking & Preview', () => {
    it('blocks a word, filters it out of previews, and allows unblocking', async () => {
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
    });
  });

  describe('14-Day Schedule', () => {
    it('returns upcoming puzzle rotation schedule', async () => {
      const res = await harness.client.api.admin.schedule.$get(
        { query: { days: '14' } },
        { headers: adminHeaders() },
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        schedule: Array<{ date: string; slot: number; display_number: number }>;
      };
      expect(data.schedule).toHaveLength(14);
      expect(data.schedule[0]?.display_number).toBeGreaterThan(0);
    });
  });
});
