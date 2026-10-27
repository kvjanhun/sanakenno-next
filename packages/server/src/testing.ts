import { testClient } from 'hono/testing';
import { createApp } from './app.js';
import { createDb } from './db/connection.js';
import { seedDatabase } from './db/seed.js';

/**
 * Create an isolated in-memory Kysely SQLite database and typed Hono RPC test client.
 */
export function createTestHarness() {
  const db = createDb(':memory:');
  const app = createApp(db);
  const client = testClient(app);
  return {
    db,
    app,
    client,
    seed: () => seedDatabase(db),
    destroy: () => db.destroy(),
  };
}
