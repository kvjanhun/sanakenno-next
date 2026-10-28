import {
  AdminSuggestionRejectionPayloadSchema,
  type AdminCombinationVariation,
} from '@sanakenno/shared';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
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
import { suggestPuzzle } from './suggestion-engine.js';
import { normalizeLettersKey } from './suggestion-scorer.js';

export function createAdminSuggestionsRoutes(db: Kysely<Database>) {
  const admin = new Hono<{ Variables: AdminVariables }>();

  admin.use('*', securityHeaders);
  admin.use('*', requireAdminAuth(db));

  return admin
    .get('/combinations', async (c) => {
      const q = c.req.query();
      const requires = q.requires;
      const excludes = q.excludes;
      const min_pangrams = q.min_pangrams ? Number(q.min_pangrams) : undefined;
      const max_pangrams = q.max_pangrams ? Number(q.max_pangrams) : undefined;
      const min_words = q.min_words ? Number(q.min_words) : undefined;
      const max_words = q.max_words ? Number(q.max_words) : undefined;
      const in_rotation =
        q.in_rotation !== undefined && q.in_rotation !== '' ? Number(q.in_rotation) : undefined;
      const sort = q.sort;
      const order = q.order === 'asc' ? 'asc' : 'desc';
      const page = q.page ? Number(q.page) : 1;
      const per_page = q.per_page ? Number(q.per_page) : 50;

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

      const combinations = rows.map((r) => {
        let variations: AdminCombinationVariation[] = [];
        try {
          variations = JSON.parse(r.variations) as AdminCombinationVariation[];
        } catch {
          variations = [];
        }
        return {
          letters: r.letters,
          total_pangrams: r.total_pangrams,
          min_word_count: r.min_word_count,
          max_word_count: r.max_word_count,
          min_max_score: r.min_max_score,
          max_max_score: r.max_max_score,
          variations,
          in_rotation: Boolean(r.in_rotation),
        };
      });

      const pages = Math.ceil(total / per_page);

      return c.json({
        combinations,
        total,
        page,
        pages,
        per_page,
      });
    })
    .get('/suggestion', async (c) => {
      const q = c.req.query();
      const declinedParam = q.declined ?? '';
      const clientDeclined = declinedParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const persistedDeclined = await persistedSuggestionRejectionKeys(db);
      const allDeclined = [...clientDeclined, ...persistedDeclined];

      const minWords = q.min_words ? Number(q.min_words) : undefined;
      const maxWords = q.max_words ? Number(q.max_words) : undefined;
      const includePangrams = ['1', 'true', 'yes'].includes(
        (q.include_pangrams ?? '').toLowerCase(),
      );

      const suggestion = await suggestPuzzle(db, {
        declined: allDeclined,
        minWords,
        maxWords,
        includePangrams,
      });

      if (!suggestion) {
        return c.json({ error: 'Ei ehdotuksia saatavilla' }, 404);
      }

      return c.json(suggestion);
    })
    .get('/suggestion-rejections', async (c) => {
      const rows = await getSuggestionRejections(db);
      return c.json({
        rejections: rows.map((r) => ({
          id: Number(r.id),
          letters_key: r.letters_key,
          letters: Array.from(r.letters_key),
          center: r.center,
          rejected_at: r.rejected_at,
        })),
      });
    })
    .post('/suggestion-rejections', requireCsrf, async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Virheellinen JSON-pyyntö' }, 400);
      }

      const parsed = AdminSuggestionRejectionPayloadSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: 'Kirjaimet ja keskuskirjain vaaditaan' }, 400);
      }

      const lettersKey = normalizeLettersKey(parsed.data.letters);
      const center = parsed.data.center.toLowerCase();
      const row = await insertSuggestionRejection(db, lettersKey, center);

      const admin = c.get('admin');
      if (admin?.adminId) {
        await insertAdminLog(db, admin.adminId, 'suggestion_reject', `${lettersKey}:${center}`);
      }

      return c.json({
        id: Number(row.id),
        letters_key: row.letters_key,
        letters: Array.from(row.letters_key),
        center: row.center,
        rejected_at: row.rejected_at,
      });
    })
    .delete('/suggestion-rejections/:id', requireCsrf, async (c) => {
      const id = Number(c.req.param('id'));
      if (isNaN(id) || id <= 0) {
        return c.json({ error: 'Virheellinen tunniste' }, 400);
      }

      const row = await getSuggestionRejectionById(db, id);
      if (!row) {
        return c.json({ error: 'Hylättyä ehdotusta ei löydy' }, 404);
      }

      await deleteSuggestionRejection(db, id);

      const admin = c.get('admin');
      if (admin?.adminId) {
        await insertAdminLog(
          db,
          admin.adminId,
          'suggestion_restore',
          `${row.letters_key}:${row.center}`,
        );
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
