import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import { createHealthRoutes } from './features/health/health.routes.js';

/**
 * Create the typed Hono API application. Exported AppType drives the frontend Hono RPC client.
 */
export function createApp(db: Kysely<Database>) {
  const app = new Hono().basePath('/api').route('/health', createHealthRoutes(db));
  return app;
}

export type AppType = ReturnType<typeof createApp>;
