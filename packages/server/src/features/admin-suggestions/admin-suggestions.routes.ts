import { zValidator } from '@hono/zod-validator';
import {
  AdminCombinationsQuerySchema,
  AdminSuggestionQuerySchema,
  AdminSuggestionRejectionPayloadSchema,
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
  deleteSuggestionRejection,
  getCombinations,
  getSuggestionRejectionById,
  getSuggestionRejections,
  insertSuggestionRejection,
  persistedSuggestionRejectionKeys,
} from './admin-suggestions.queries.js';
import { parseVariations, suggestPuzzle } from './suggestion-engine.js';
import { normalizeLettersKey } from './suggestion-scorer.js';

export function createAdminSuggestionsRoutes(db: Kysely<Database>) {
  const admin = new Hono<{ Variables: AdminVariables }>();

  admin.use('*', securityHeaders);
  admin.use('*', requireAdminAuth(db));

  return admin
    .get(
      '/combinations',
      zValidator(
        'query',
        AdminCombinationsQuerySchema,
        zodErrorHook('Virheelliset hakuparametrit'),
      ),
      async (c) => {
        const q = c.req.valid('query') ?? {};
        const requires = q.requires;
        const excludes = q.excludes;
        const min_pangrams = q.min_pangrams;
        const max_pangrams = q.max_pangrams;
        const min_words = q.min_words;
        const max_words = q.max_words;
        const in_rotation = q.in_rotation;
        const sort = q.sort;
        const order = q.order === 'asc' ? 'asc' : 'desc';
        const page = q.page ?? 1;
        const per_page = q.per_page ?? 50;

        const { rows, total } = await getCombinations(db, {
          requires,
          excludes,
          min_pangrams,
          max_pangrams,
          min_words,
          max_words,
          in_rotation,
          sort,
          order,
          page,
          per_page,
        });

        const combinations = rows.map((r) => ({
          letters: r.letters,
          total_pangrams: r.total_pangrams,
          min_word_count: r.min_word_count,
          max_word_count: r.max_word_count,
          min_max_score: r.min_max_score,
          max_max_score: r.max_max_score,
          variations: parseVariations(r.variations),
          in_rotation: Boolean(r.in_rotation),
        }));

        const pages = Math.ceil(total / per_page);

        return c.json(
          {
            combinations,
            total,
            page,
            pages,
            per_page,
          },
          200,
        );
      },
    )
    .get(
      '/suggestion',
      zValidator('query', AdminSuggestionQuerySchema, zodErrorHook('Virheelliset hakuparametrit')),
      async (c) => {
        const q = c.req.valid('query') ?? {};
        const declinedParam = q.declined ?? '';
        const clientDeclined = declinedParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const persistedDeclined = await persistedSuggestionRejectionKeys(db);
        const allDeclined = [...clientDeclined, ...persistedDeclined];

        const minWords = q.min_words;
        const maxWords = q.max_words;

        const suggestion = await suggestPuzzle(db, {
          declined: allDeclined,
          minWords,
          maxWords,
        });

        if (!suggestion) {
          return c.json({ error: 'Ei ehdotuksia saatavilla' }, 404);
        }

        return c.json(suggestion, 200);
      },
    )
    .get('/suggestion-rejections', async (c) => {
      const rows = await getSuggestionRejections(db);
      return c.json(
        {
          rejections: rows.map((r) => ({
            id: Number(r.id),
            letters_key: r.letters_key,
            letters: Array.from(r.letters_key),
            center: r.center,
            rejected_at: r.rejected_at,
          })),
        },
        200,
      );
    })
    .post(
      '/suggestion-rejections',
      requireCsrf,
      zValidator(
        'json',
        AdminSuggestionRejectionPayloadSchema,
        zodErrorHook('Kirjaimet ja keskuskirjain vaaditaan'),
      ),
      async (c) => {
        const parsed = c.req.valid('json');
        const lettersKey = normalizeLettersKey(parsed.letters);
        if (!lettersKey) {
          return c.json({ error: 'Kirjaimet ja keskuskirjain vaaditaan' }, 400);
        }
        const center = parsed.center.toLowerCase();
        const adminUser = c.get('admin');

        const row = await runImmediateTransactionWithRetry(db, async (trx) => {
          const inserted = await insertSuggestionRejection(trx, lettersKey, center);
          if (adminUser?.adminId) {
            await insertAdminLog(
              trx,
              adminUser.adminId,
              'suggestion_reject',
              `${lettersKey}:${center}`,
            );
          }
          return inserted;
        });

        return c.json(
          {
            id: Number(row.id),
            letters_key: row.letters_key,
            letters: Array.from(row.letters_key),
            center: row.center,
            rejected_at: row.rejected_at,
          },
          200,
        );
      },
    )
    .delete('/suggestion-rejections/:id', requireCsrf, async (c) => {
      const id = Number(c.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) {
        return c.json({ error: 'Virheellinen tunniste' }, 400);
      }

      const adminUser = c.get('admin');
      const row = await runImmediateTransactionWithRetry(db, async (trx) => {
        const existing = await getSuggestionRejectionById(trx, id);
        if (!existing) return null;
        await deleteSuggestionRejection(trx, id);
        if (adminUser?.adminId) {
          await insertAdminLog(
            trx,
            adminUser.adminId,
            'suggestion_restore',
            `${existing.letters_key}:${existing.center}`,
          );
        }
        return existing;
      });

      if (!row) {
        return c.json({ error: 'Hylättyä ehdotusta ei löydy' }, 404);
      }

      return c.json({
        status: 'restored',
        id,
        letters_key: row.letters_key,
        letters: Array.from(row.letters_key),
        center: row.center,
        rejected_at: row.rejected_at,
      });
    });
}
