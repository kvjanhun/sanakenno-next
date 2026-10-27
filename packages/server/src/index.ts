import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { createDb } from './db/connection.js';
import { seedDatabase } from './db/seed.js';

const port = Number(process.env.PORT ?? 3001);
const db = createDb();

if (process.env.SEED_ON_BOOT === 'true') {
  await seedDatabase(db);
}

const app = createApp(db);

serve({
  fetch: app.fetch,
  port,
});
