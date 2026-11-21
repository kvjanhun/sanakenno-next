import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import type { Kysely } from 'kysely';
import { checkpointAndDestroyDb, hasAnyPuzzles, initDb, type DbEngine } from './db/connection.js';
import type { Database } from './db/schema.js';
import { seedDatabase } from './db/seed.js';
import { createMaintenanceApp, createServerApp } from './edge-middleware.js';

interface ClosableServer {
  close: (callback?: (err?: Error) => void) => unknown;
  closeIdleConnections?: () => void;
}

function resolveBootDbPath(env: NodeJS.ProcessEnv): string {
  return (
    env.DB_PATH ?? (env.DATA_DIR ? path.join(env.DATA_DIR, 'sanakenno.db') : './sanakenno.dev.db')
  );
}

/**
 * Seed initial puzzles when explicitly requested (`SEED_ON_BOOT=true`) or when running
 * in non-production dev mode against an empty default local SQLite database.
 */
export async function ensureBootSeed(
  db: Kysely<Database>,
  env: NodeJS.ProcessEnv = process.env,
  engine: DbEngine = 'kysely-sqlite',
): Promise<boolean> {
  if (env.SEED_ON_BOOT === 'true') {
    await seedDatabase(db);
    return true;
  }

  if (
    engine === 'kysely-sqlite' &&
    env.NODE_ENV !== 'production' &&
    resolveBootDbPath(env) === './sanakenno.dev.db'
  ) {
    const populated = await hasAnyPuzzles(db);
    if (!populated) {
      await seedDatabase(db);
      return true;
    }
  }

  return false;
}

/**
 * Gracefully stop HTTP traffic, flush SQLite WAL frames (when local), and close the database connection.
 */
export async function shutdownServer(
  server: ClosableServer | null,
  db: Kysely<Database> | null,
  engine: DbEngine = 'kysely-sqlite',
  timeoutMs = 5_000,
): Promise<void> {
  if (server) {
    server.closeIdleConnections?.();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), timeoutMs);
      server.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  if (db) {
    await checkpointAndDestroyDb(db, engine);
  }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const port = Number(process.env.PORT ?? 3001);

  if (process.env.MAINTENANCE_MODE === 'true') {
    const app = createMaintenanceApp();
    const server = serve({
      fetch: app.fetch,
      port,
    });

    const handleSignal = () => {
      void shutdownServer(server, null).finally(() => process.exit(0));
    };

    process.once('SIGTERM', handleSignal);
    process.once('SIGINT', handleSignal);
  } else {
    const { db, engine } = await initDb(process.env);
    await ensureBootSeed(db, process.env, engine);

    const app = createServerApp(db, undefined, engine);
    const server = serve({
      fetch: app.fetch,
      port,
    });

    const handleSignal = () => {
      void shutdownServer(server, db, engine).finally(() => process.exit(0));
    };

    process.once('SIGTERM', handleSignal);
    process.once('SIGINT', handleSignal);
  }
}
