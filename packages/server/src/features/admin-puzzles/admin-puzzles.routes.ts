import { getHelsinkiDateString } from '@sanakenno/shared';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import { runImmediateTransactionWithRetry } from '../../db/connection.js';
import type { Database } from '../../db/schema.js';
import {
  requireAdminAuth,
  requireCsrf,
  securityHeaders,
  type AdminVariables,
} from '../admin-auth/admin-auth.middleware.js';
import { insertAdminLog } from '../admin-auth/admin-auth.queries.js';
import {
  getActiveSlots,
  getBlockedWords,
  getDisplayNumber,
  getPuzzleSlotForDate,
  getSlotByDisplayNumber,
  nextFreeSlot,
  totalPuzzles,
} from '../puzzle/puzzle.queries.js';
import {
  bumpPuzzleCacheGeneration,
  computePuzzle,
  computeVariations,
  FINNISH_LETTERS,
} from '../puzzle/wordlist.js';
import {
  deleteBlockedWord,
  findDuplicateConflicts,
  getBlockedWordsList,
  getNeighbourSlots,
  getPuzzleBySlot,
  insertBlockedWord,
  insertOrUpdatePuzzle,
  normalizeLettersKey,
  softDeletePuzzle,
  swapPuzzles,
  updatePuzzleCenter,
} from './admin-puzzles.queries.js';

function parseLetters(raw: unknown): string[] | null {
  if (Array.isArray(raw)) {
    const list = raw.map((l) => String(l).trim().toLowerCase()).filter((l) => l.length === 1);
    return list.length === 7 && new Set(list).size === 7 ? list : null;
  }
  if (typeof raw === 'string') {
    const cleaned = raw.toLowerCase().trim();
    let list: string[];
    if (cleaned.includes(',') || cleaned.includes(' ')) {
      list = cleaned
        .split(/[,\s]+/)
        .map((l) => l.trim())
        .filter(Boolean);
    } else {
      list = Array.from(cleaned);
    }
    return list.length === 7 && new Set(list).size === 7 ? list : null;
  }
  return null;
}

export function createAdminPuzzleRoutes(db: Kysely<Database>) {
  const authMiddleware = requireAdminAuth(db);

  return new Hono<{ Variables: AdminVariables }>()
    .use('*', securityHeaders, authMiddleware, requireCsrf)
    .post('/puzzle', async (c) => {
      const admin = c.get('admin');
      let body: Record<string, unknown> = {};
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Virheellinen pyyntö' }, 400);
      }

      const letters = parseLetters(body['letters']);
      const center = typeof body['center'] === 'string' ? body['center'].trim().toLowerCase() : '';
      const force = Boolean(body['force']);
      const requestedSlot =
        typeof body['slot'] === 'number' && Number.isInteger(body['slot']) && body['slot'] >= 0
          ? body['slot']
          : undefined;

      if (!letters || !center) {
        return c.json({ error: 'Seitsemän uniikkia kirjainta ja keskuskirjain vaaditaan' }, 400);
      }

      if (!letters.includes(center)) {
        return c.json({ error: 'Keskuskirjaimen on oltava yksi kirjaimista' }, 400);
      }

      for (const ch of letters) {
        if (!FINNISH_LETTERS.has(ch)) {
          return c.json({ error: `Virheellinen kirjain: ${ch}` }, 400);
        }
      }

      const lettersKey = normalizeLettersKey(letters);
      const conflicts = await findDuplicateConflicts(db, lettersKey, requestedSlot);

      const exact = conflicts.find((conflict) => conflict.center === center);
      if (exact) {
        return c.json(
          {
            error: `Sama peli on jo kierrossa slotissa ${exact.slot} keskuksella "${center}".`,
            duplicate: exact,
          },
          409,
        );
      }

      if (conflicts.length > 0 && !force) {
        const first = conflicts[0]!;
        return c.json(
          {
            error: `Samat kirjaimet ovat jo pelissä slotissa ${first.slot} (keskus "${first.center}"). Luodaanko silti?`,
            requires_force: true,
            duplicate: first,
          },
          409,
        );
      }

      const lettersString = letters.join(',');
      const targetSlot = requestedSlot ?? (await nextFreeSlot(db));

      await runImmediateTransactionWithRetry(db, async (trx) => {
        await insertOrUpdatePuzzle(trx, targetSlot, lettersString, center);
        await insertAdminLog(
          trx,
          admin.adminId,
          requestedSlot !== undefined ? 'update_puzzle' : 'create_puzzle',
          `slot=${targetSlot},letters=${lettersString},center=${center}`,
        );
      });

      bumpPuzzleCacheGeneration();
      const displayNumber = (await getDisplayNumber(db, targetSlot)) ?? targetSlot + 1;
      const total = await totalPuzzles(db);

      return c.json(
        {
          status: 'saved' as const,
          slot: targetSlot,
          display_number: displayNumber,
          total_puzzles: total,
          letters,
          center,
          is_new: requestedSlot === undefined,
        },
        200,
      );
    })
    .delete('/puzzle/:slot', async (c) => {
      const admin = c.get('admin');
      const slot = Number(c.req.param('slot'));
      if (!Number.isInteger(slot) || slot < 0) {
        return c.json({ error: 'Virheellinen slotti' }, 400);
      }

      const existing = await getPuzzleBySlot(db, slot);
      if (!existing || existing.is_active === 0) {
        return c.json({ error: 'Peliä ei löydy tai se on jo poistettu' }, 404);
      }

      await runImmediateTransactionWithRetry(db, async (trx) => {
        await softDeletePuzzle(trx, slot);
        await insertAdminLog(trx, admin.adminId, 'delete_puzzle', `slot=${slot}`);
      });

      bumpPuzzleCacheGeneration();
      const total = await totalPuzzles(db);
      return c.json({ status: 'deleted' as const, slot, total_puzzles: total }, 200);
    })
    .post('/puzzle/swap', async (c) => {
      const admin = c.get('admin');
      let body: Record<string, unknown> = {};
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Virheellinen pyyntö' }, 400);
      }

      const rawSlotA = body['slotA'] ?? body['slot_a'];
      const rawSlotB = body['slotB'] ?? body['slot_b'];
      const slotA = Number(rawSlotA);
      const slotB = Number(rawSlotB);
      if (
        !Number.isInteger(slotA) ||
        !Number.isInteger(slotB) ||
        slotA < 0 ||
        slotB < 0 ||
        slotA === slotB
      ) {
        return c.json(
          { error: 'Molemmat slotit vaaditaan eri ei-negatiivisina kokonaislukuina' },
          400,
        );
      }

      await runImmediateTransactionWithRetry(db, async (trx) => {
        await swapPuzzles(trx, slotA, slotB);
        await insertAdminLog(trx, admin.adminId, 'swap_puzzles', `slotA=${slotA},slotB=${slotB}`);
      });

      bumpPuzzleCacheGeneration();
      return c.json({ status: 'swapped' as const, slotA, slotB }, 200);
    })
    .post('/puzzle/center', async (c) => {
      const admin = c.get('admin');
      let body: Record<string, unknown> = {};
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Virheellinen pyyntö' }, 400);
      }

      const slot = Number(body['slot']);
      const center = typeof body['center'] === 'string' ? body['center'].trim().toLowerCase() : '';

      if (!Number.isInteger(slot) || slot < 0 || !center || center.length !== 1) {
        return c.json({ error: 'Slotti ja yksittäinen keskuskirjain vaaditaan' }, 400);
      }

      const existing = await getPuzzleBySlot(db, slot);
      if (!existing || existing.is_active === 0) {
        return c.json({ error: 'Peliä ei löydy' }, 404);
      }

      const letters = parseLetters(existing.letters);
      if (!letters || !letters.includes(center)) {
        return c.json({ error: 'Keskuskirjaimen on oltava yksi pelin kirjaimista' }, 400);
      }

      await runImmediateTransactionWithRetry(db, async (trx) => {
        await updatePuzzleCenter(trx, slot, center);
        await insertAdminLog(trx, admin.adminId, 'change_center', `slot=${slot},center=${center}`);
      });

      bumpPuzzleCacheGeneration();
      return c.json({ status: 'updated' as const, slot, center }, 200);
    })
    .get('/puzzle/slots', async (c) => {
      const slots = await getActiveSlots(db);
      const total = await totalPuzzles(db);
      const mapped = slots.map((slot, index) => ({
        slot,
        display_number: index + 1,
      }));
      return c.json({ slots: mapped, active_slots: slots, total_puzzles: total }, 200);
    })
    .get('/puzzle/variations', async (c) => {
      const slotStr = c.req.query('slot');
      const displayStr = c.req.query('display_number');
      const lettersParam = c.req.query('letters');

      const blocked = await getBlockedWords(db);

      let slot: number | null = null;
      if (displayStr !== undefined && displayStr !== '') {
        const displayNumber = parseInt(displayStr, 10);
        if (isNaN(displayNumber) || displayNumber < 1) {
          return c.json({ error: 'Virheellinen pelinumero' }, 400);
        }
        slot = await getSlotByDisplayNumber(db, displayNumber);
        if (slot === null) {
          return c.json({ error: 'Peliä ei löydy' }, 404);
        }
      } else if (slotStr !== undefined && slotStr !== '') {
        const parsed = parseInt(slotStr, 10);
        if (isNaN(parsed) || parsed < 0) {
          return c.json({ error: 'Virheellinen slotti' }, 400);
        }
        slot = parsed;
      }

      if (slot !== null) {
        const puzzle = await getPuzzleBySlot(db, slot);
        if (!puzzle) {
          return c.json({ error: 'Peliä ei löydy' }, 404);
        }

        const letters = parseLetters(puzzle.letters);
        if (!letters) {
          return c.json({ error: 'Pelin kirjaimet ovat virheelliset' }, 500);
        }

        const variations = computeVariations(letters, blocked).map((v) => ({
          ...v,
          is_active: v.center === puzzle.center,
        }));

        const neighbours = await getNeighbourSlots(db, slot);
        const displayNumber = await getDisplayNumber(db, slot);
        const total = await totalPuzzles(db);

        return c.json(
          {
            slot,
            display_number: displayNumber,
            total_puzzles: total,
            prev_slot: neighbours.prev_slot,
            next_slot: neighbours.next_slot,
            letters,
            center: puzzle.center,
            variations,
            is_active: puzzle.is_active === 1,
          },
          200,
        );
      }

      if (lettersParam) {
        const letters = parseLetters(lettersParam);
        if (!letters) {
          return c.json({ error: 'Seitsemän kirjainta vaaditaan' }, 400);
        }
        const variations = computeVariations(letters, blocked);
        return c.json({ variations }, 200);
      }

      return c.json({ error: 'Slotti, pelinumero tai kirjaimet vaaditaan' }, 400);
    })
    .post('/preview', async (c) => {
      let body: Record<string, unknown> = {};
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Virheellinen pyyntö' }, 400);
      }

      const letters = parseLetters(body['letters']);
      const center = typeof body['center'] === 'string' ? body['center'].trim().toLowerCase() : '';

      if (!letters || !center || !letters.includes(center)) {
        return c.json({ error: 'Virheelliset kirjaimet tai keskuskirjain' }, 400);
      }

      const blocked = await getBlockedWords(db);
      const preview = computePuzzle(letters, center, blocked);
      const variations = computeVariations(letters, blocked).map((v) => ({
        ...v,
        is_active: v.center === center,
      }));

      return c.json(
        {
          letters,
          center,
          words: preview.words,
          max_score: preview.max_score,
          word_count: preview.hint_data.word_count,
          pangram_count: preview.hint_data.pangram_count,
          hint_data: preview.hint_data,
          variations,
        },
        200,
      );
    })
    .get('/blocked', async (c) => {
      const blocked = await getBlockedWordsList(db);
      return c.json({ blocked }, 200);
    })
    .post('/block', async (c) => {
      const admin = c.get('admin');
      let body: Record<string, unknown> = {};
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Virheellinen pyyntö' }, 400);
      }

      const word = typeof body['word'] === 'string' ? body['word'].trim().toLowerCase() : '';
      if (!word) {
        return c.json({ error: 'Estettävä sana vaaditaan' }, 400);
      }

      await runImmediateTransactionWithRetry(db, async (trx) => {
        await insertBlockedWord(trx, word);
        await insertAdminLog(trx, admin.adminId, 'block_word', `word=${word}`);
      });

      bumpPuzzleCacheGeneration();
      return c.json({ status: 'blocked' as const, word }, 200);
    })
    .delete('/block/:id', async (c) => {
      const admin = c.get('admin');
      const id = Number(c.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) {
        return c.json({ error: 'Virheellinen tunniste' }, 400);
      }

      await runImmediateTransactionWithRetry(db, async (trx) => {
        await deleteBlockedWord(trx, id);
        await insertAdminLog(trx, admin.adminId, 'unblock_word', `id=${id}`);
      });

      bumpPuzzleCacheGeneration();
      return c.json({ status: 'unblocked' as const, id }, 200);
    })
    .get('/schedule', async (c) => {
      const requestedDays = parseInt(c.req.query('days') || '14', 10);
      const days = Math.min(90, Math.max(1, Number.isFinite(requestedDays) ? requestedDays : 14));
      const todayStr = getHelsinkiDateString();
      const startParam = c.req.query('start');
      const startDateStr =
        startParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam) ? startParam : todayStr;

      const startDate = new Date(`${startDateStr}T00:00:00Z`);
      const blocked = await getBlockedWords(db);
      const schedule = [];

      for (let d = 0; d < days; d++) {
        const curDate = new Date(startDate.getTime() + d * 86400000);
        const dateKey = curDate.toISOString().slice(0, 10);
        const slot = await getPuzzleSlotForDate(db, curDate);

        let letters: string[] | null = null;
        let center: string | null = null;
        let wordCount = 0;
        let maxScore = 0;
        let pangramCount = 0;

        if (slot !== null) {
          const puzzle = await getPuzzleBySlot(db, slot);
          if (puzzle) {
            letters = puzzle.letters.split(',').map((l) => l.trim());
            center = puzzle.center;
            const computed = computePuzzle(letters, center, blocked);
            wordCount = computed.hint_data.word_count;
            maxScore = computed.max_score;
            pangramCount = computed.hint_data.pangram_count;
          }
        }

        const dispNum = slot !== null ? await getDisplayNumber(db, slot) : null;

        schedule.push({
          date: dateKey,
          slot: slot ?? 0,
          display_number: dispNum ?? (slot !== null ? slot : 1),
          letters,
          center,
          word_count: wordCount,
          max_score: maxScore,
          pangram_count: pangramCount,
          is_today: dateKey === todayStr,
        });
      }

      const total = await totalPuzzles(db);

      return c.json(
        {
          start: startDateStr,
          days,
          schedule,
          total_puzzles: total,
        },
        200,
      );
    });
}
