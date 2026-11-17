import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import type { Kysely } from 'kysely';
import { checkpointAndDestroyDb, createDb, hasAnyPuzzles } from './db/connection.js';
import type { Database } from './db/schema.js';
import { seedDatabase } from './db/seed.js';
import { createServerApp } from './edge-middleware.js';

interface ClosableServer {
  close: (callback?: (err?: Error) => void) => unknown;
}

function resolveBootDbPath(env: NodeJS.ProcessEnv): string {
  return (
    env.DB_PATH ?? (env.DATA_DIR ? path.join(env.DATA_DIR, 'sanakenno.db') : './sanakenno.dev.db')
  );
}

/**
 * Seed initial puzzles when explicitly requested (`SEED_ON_BOOT=true`) or when running
 * in non-production dev mode against an empty default development database.
 */
export async function ensureBootSeed(
  db: Kysely<Database>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (env.SEED_ON_BOOT === 'true') {
    await seedDatabase(db);
    return true;
  }

  if (env.NODE_ENV !== 'production' && resolveBootDbPath(env) === './sanakenno.dev.db') {
    const populated = await hasAnyPuzzles(db);
    if (!populated) {
      await seedDatabase(db);
      return true;
    }
  }

  return false;
}

/**
 * Gracefully stop HTTP traffic, flush SQLite WAL frames, and close the database connection.
 */
export async function shutdownServer(
  server: ClosableServer | null,
  db: Kysely<Database>,
): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
  await checkpointAndDestroyDb(db);
}

const isMain =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const port = Number(process.env.PORT ?? 3001);
  const db = createDb();
  await ensureBootSeed(db, process.env);

  const app = createServerApp(db);
  const server = serve({
    fetch: app.fetch,
    port,
  });

  const handleSignal = () => {
    void shutdownServer(server, db).finally(() => process.exit(0));
  };

  process.once('SIGTERM', handleSignal);
  process.once('SIGINT', handleSignal);
}
