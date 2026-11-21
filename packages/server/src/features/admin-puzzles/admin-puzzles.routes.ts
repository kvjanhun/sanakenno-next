import { zValidator } from '@hono/zod-validator';
import {
  AdminBlockWordPayloadSchema,
  AdminPreviewPayloadSchema,
  AdminPuzzleCenterPayloadSchema,
  AdminPuzzleSavePayloadSchema,
  AdminPuzzleSwapPayloadSchema,
  AdminScheduleQuerySchema,
  AdminVariationsQuerySchema,
  getHelsinkiDateString,
} from '@sanakenno/shared';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import { runImmediateTransactionWithRetry } from '../../db/connection.js';
import type { Database } from '../../db/schema.js';
import { zodErrorHook } from '../../lib/zod-validator.js';
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
import { isValidIsoCalendarDate } from '../puzzle/puzzle.routes.js';
import {
  computePuzzle,
  computeVariations,
  FINNISH_LETTERS,
  invalidatePuzzleCache,
} from '../puzzle/wordlist.js';
import {
  buildAdminSchedule,
  deleteBlockedWord,
  findDuplicateConflicts,
  getBlockedWordsList,
  getNeighbourSlots,
  getPuzzleBySlot,
  insertBlockedWord,
  insertOrUpdatePuzzle,
  normalizeLettersKey,
  recomputeMaxScoresForAffectedWord,
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
    .post(
      '/puzzle',
      zValidator(
        'json',
        AdminPuzzleSavePayloadSchema,
        zodErrorHook('Seitsemän uniikkia kirjainta ja keskuskirjain vaaditaan'),
      ),
      async (c) => {
        const admin = c.get('admin');
        const body = c.req.valid('json');

        const letters = parseLetters(body.letters);
        const center = body.center.trim().toLowerCase();
        const force = Boolean(body.force);
        const requestedSlot = body.slot;

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
        const lettersString = letters.join(',');

        const saveResult = await runImmediateTransactionWithRetry(db, async (trx) => {
          const conflicts = await findDuplicateConflicts(trx, lettersKey, requestedSlot);
          const exact = conflicts.find((conflict) => conflict.center === center);
          if (exact) {
            return {
              kind: 'exact_conflict' as const,
              conflict: exact,
            };
          }

          if (conflicts.length > 0 && !force) {
            return {
              kind: 'force_required' as const,
              conflict: conflicts[0]!,
            };
          }

          const targetSlot = requestedSlot ?? (await nextFreeSlot(trx));
          await insertOrUpdatePuzzle(trx, targetSlot, lettersString, center);
          await insertAdminLog(
            trx,
            admin.adminId,
            requestedSlot !== undefined ? 'update_puzzle' : 'create_puzzle',
            `slot=${targetSlot},letters=${lettersString},center=${center}`,
          );
          return {
            kind: 'saved' as const,
            targetSlot,
          };
        });

        if (saveResult.kind === 'exact_conflict') {
          return c.json(
            {
              error: `Sama peli on jo kierrossa slotissa ${saveResult.conflict.slot} keskuksella "${center}".`,
              duplicate: saveResult.conflict,
            },
            409,
          );
        }

        if (saveResult.kind === 'force_required') {
          return c.json(
            {
              error: `Samat kirjaimet ovat jo pelissä slotissa ${saveResult.conflict.slot} (keskus "${saveResult.conflict.center}"). Luodaanko silti?`,
              requires_force: true,
              duplicate: saveResult.conflict,
            },
            409,
          );
        }

        const targetSlot = saveResult.targetSlot;
        invalidatePuzzleCache();
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
      },
    )
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

      invalidatePuzzleCache();
      const total = await totalPuzzles(db);
      return c.json({ status: 'deleted' as const, slot, total_puzzles: total }, 200);
    })
    .post(
      '/puzzle/swap',
      zValidator(
        'json',
        AdminPuzzleSwapPayloadSchema,
        zodErrorHook('Molemmat slotit vaaditaan eri ei-negatiivisina kokonaislukuina'),
      ),
      async (c) => {
        const admin = c.get('admin');
        const body = c.req.valid('json');

        const slotA = (body.slotA ?? body.slot_a)!;
        const slotB = (body.slotB ?? body.slot_b)!;

        const swapped = await runImmediateTransactionWithRetry(db, async (trx) => {
          const ok = await swapPuzzles(trx, slotA, slotB);
          if (!ok) return false;
          await insertAdminLog(trx, admin.adminId, 'swap_puzzles', `slotA=${slotA},slotB=${slotB}`);
          return true;
        });

        if (!swapped) {
          return c.json({ error: 'Molemmat aktiiviset pelit vaaditaan vaihtoon' }, 404);
        }

        invalidatePuzzleCache();
        return c.json({ status: 'swapped' as const, slotA, slotB }, 200);
      },
    )
    .post(
      '/puzzle/center',
      zValidator(
        'json',
        AdminPuzzleCenterPayloadSchema,
        zodErrorHook('Slotti ja yksittäinen keskuskirjain vaaditaan'),
      ),
      async (c) => {
        const admin = c.get('admin');
        const body = c.req.valid('json');
        const slot = body.slot;
        const center = body.center.trim().toLowerCase();

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
          await insertAdminLog(
            trx,
            admin.adminId,
            'change_center',
            `slot=${slot},center=${center}`,
          );
        });

        invalidatePuzzleCache();
        return c.json({ status: 'updated' as const, slot, center }, 200);
      },
    )
    .get('/puzzle/slots', async (c) => {
      const slots = await getActiveSlots(db);
      const total = await totalPuzzles(db);
      const todaySlot = await getPuzzleSlotForDate(db);
      const mapped = slots.map((slot, index) => ({
        slot,
        display_number: index + 1,
      }));
      return c.json(
        { slots: mapped, active_slots: slots, total_puzzles: total, today_slot: todaySlot },
        200,
      );
    })
    .get('/puzzle/variations', zValidator('query', AdminVariationsQuerySchema), async (c) => {
      const query = c.req.valid('query') ?? {};
      const slotStr = query.slot;
      const displayStr = query.display_number;
      const lettersParam = query.letters;

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
    .post(
      '/preview',
      zValidator(
        'json',
        AdminPreviewPayloadSchema,
        zodErrorHook('Virheelliset kirjaimet tai keskuskirjain'),
      ),
      async (c) => {
        const body = c.req.valid('json');
        const letters = parseLetters(body.letters);
        const center = body.center.trim().toLowerCase();

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
      },
    )
    .get('/blocked', async (c) => {
      const blocked = await getBlockedWordsList(db);
      return c.json({ blocked }, 200);
    })
    .post(
      '/block',
      zValidator('json', AdminBlockWordPayloadSchema, zodErrorHook('Estettävä sana vaaditaan')),
      async (c) => {
        const admin = c.get('admin');
        const body = c.req.valid('json');
        const word = body.word.trim().toLowerCase();

        const inserted = await runImmediateTransactionWithRetry(db, async (trx) => {
          const ok = await insertBlockedWord(trx, word);
          if (!ok) return false;
          await recomputeMaxScoresForAffectedWord(trx, word);
          await insertAdminLog(trx, admin.adminId, 'block_word', `word=${word}`);
          return true;
        });

        if (!inserted) {
          return c.json({ error: 'Sana on jo estetty' }, 409);
        }

        invalidatePuzzleCache();
        return c.json({ status: 'blocked' as const, word }, 200);
      },
    )
    .delete('/block/:id', async (c) => {
      const admin = c.get('admin');
      const id = Number(c.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) {
        return c.json({ error: 'Virheellinen tunniste' }, 400);
      }

      const deletedWord = await runImmediateTransactionWithRetry(db, async (trx) => {
        const word = await deleteBlockedWord(trx, id);
        if (!word) return null;
        await recomputeMaxScoresForAffectedWord(trx, word);
        await insertAdminLog(trx, admin.adminId, 'unblock_word', `id=${id},word=${word}`);
        return word;
      });

      if (!deletedWord) {
        return c.json({ error: 'Estettyä sanaa ei löydy' }, 404);
      }

      invalidatePuzzleCache();
      return c.json({ status: 'unblocked' as const, id }, 200);
    })
    .get('/schedule', zValidator('query', AdminScheduleQuerySchema), async (c) => {
      const query = c.req.valid('query') ?? {};
      const requestedDays = parseInt(query.days || '14', 10);
      const days = Math.min(90, Math.max(1, Number.isFinite(requestedDays) ? requestedDays : 14));
      const todayStr = getHelsinkiDateString();
      const startParam = query.start;

      if (startParam !== undefined && startParam !== '' && !isValidIsoCalendarDate(startParam)) {
        return c.json({ error: 'Virheellinen aloituspäivämäärä' }, 400);
      }

      const startDateStr = startParam && startParam !== '' ? startParam : todayStr;
      const result = await buildAdminSchedule(db, startDateStr, days, todayStr);
      return c.json(result, 200);
    });
}
