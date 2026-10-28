import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import { createAdminAnalyticsRoutes } from './features/admin-analytics/admin-analytics.routes.js';
import { createAdminAuthRoutes } from './features/admin-auth/admin-auth.routes.js';
import { createAdminPuzzleRoutes } from './features/admin-puzzles/admin-puzzles.routes.js';
import { createAdminSuggestionsRoutes } from './features/admin-suggestions/admin-suggestions.routes.js';
import { createHealthRoutes } from './features/health/health.routes.js';
import { createPlayerAuthRoutes } from './features/player-auth/player-auth.routes.js';
import { createPlayerSyncRoutes } from './features/player-sync/player-sync.routes.js';
import { createArchiveRoutes } from './features/puzzle/archive.routes.js';
import { createPuzzleRoutes } from './features/puzzle/puzzle.routes.js';
import {
  createAchievementRoutes,
  createFailedGuessRoutes,
  createWordFindRoutes,
} from './features/telemetry/telemetry.routes.js';

/**
 * Create the typed Hono API application. Exported AppType drives the frontend Hono RPC client.
 */
export function createApp(db: Kysely<Database>) {
  const app = new Hono()
    .basePath('/api')
    .route('/health', createHealthRoutes(db))
    .route('/puzzle', createPuzzleRoutes(db))
    .route('/archive', createArchiveRoutes(db))
    .route('/player', createPlayerAuthRoutes(db))
    .route('/player/sync', createPlayerSyncRoutes(db))
    .route('/achievement', createAchievementRoutes(db))
    .route('/failed-guess', createFailedGuessRoutes(db))
    .route('/word-find', createWordFindRoutes(db))
    .route('/auth', createAdminAuthRoutes(db))
    .route('/admin', createAdminPuzzleRoutes(db))
    .route('/admin', createAdminSuggestionsRoutes(db))
    .route('/admin', createAdminAnalyticsRoutes(db));
  return app;
}

export type AppType = ReturnType<typeof createApp>;
