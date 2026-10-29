import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createApp } from './app.js';
import { createDb } from './db/connection.js';
import { seedDatabase } from './db/seed.js';

const port = Number(process.env.PORT ?? 3001);
const db = createDb();

if (process.env.SEED_ON_BOOT === 'true') {
  await seedDatabase(db);
}

const apiApp = createApp(db);
const app = new Hono();

// Mount typed Hono API routes
app.route('/', apiApp);

// Resolve static frontend directory (for standalone container / Cloud Run deployment)
function findStaticDir(): string | null {
  const candidates = [
    process.env.STATIC_DIR,
    path.resolve(process.cwd(), 'dist'),
    path.resolve(process.cwd(), '../../dist'),
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), '../../packages/web/dist'),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return null;
}

const staticDir = findStaticDir();
if (staticDir) {
  const relativeRoot = path.relative(process.cwd(), staticDir) || '.';
  app.use('/*', serveStatic({ root: relativeRoot }));
  app.get('*', (c, next) => {
    if (c.req.path.startsWith('/api')) {
      return c.json({ error: 'Not found' }, 404);
    }
    return serveStatic({ root: relativeRoot, path: 'index.html' })(c, next);
  });
}

serve({
  fetch: app.fetch,
  port,
});

