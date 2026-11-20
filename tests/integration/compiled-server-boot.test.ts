import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SHARED_DIR = path.join(ROOT, 'packages/shared');
const SERVER_DIR = path.join(ROOT, 'packages/server');

const tempDirs: string[] = [];

function runPlainNodeModule(script: string, extraEnv: Record<string, string> = {}): string {
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
    },
  }).trim();
}

beforeAll(() => {
  const tscBin = path.join(ROOT, 'node_modules/.bin/tsc');
  execFileSync(tscBin, ['-p', 'tsconfig.build.json'], { cwd: SHARED_DIR, stdio: 'pipe' });
  execFileSync(tscBin, ['-p', 'tsconfig.build.json'], { cwd: SERVER_DIR, stdio: 'pipe' });
}, 30000);

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Compiled Server Runtime (node packages/server/dist/*)', () => {
  it('resolves kotus_words.txt and pangram-quality.json from compiled dist/ under plain node', () => {
    const wordlistUrl = pathToFileURL(
      path.join(SERVER_DIR, 'dist/features/puzzle/wordlist.js'),
    ).href;
    const scorerUrl = pathToFileURL(
      path.join(SERVER_DIR, 'dist/features/admin-suggestions/suggestion-scorer.js'),
    ).href;

    const stdout = runPlainNodeModule(`
      const { loadWordlist } = await import(${JSON.stringify(wordlistUrl)});
      const { loadCuratedPangramQuality } = await import(${JSON.stringify(scorerUrl)});
      const words = loadWordlist();
      const grades = loadCuratedPangramQuality();
      console.log(JSON.stringify({ wordCount: words.size, gradeCount: Object.keys(grades).length }));
    `);
    const result = JSON.parse(stdout) as { wordCount: number; gradeCount: number };
    expect(result.wordCount).toBeGreaterThan(50000);
    expect(result.gradeCount).toBeGreaterThan(0);
  });

  it('loads compiled dist/index.js and serves MAINTENANCE_MODE /api/health under plain node', () => {
    const edgeUrl = pathToFileURL(path.join(SERVER_DIR, 'dist/edge-middleware.js')).href;
    const indexUrl = pathToFileURL(path.join(SERVER_DIR, 'dist/index.js')).href;

    const stdout = runPlainNodeModule(`
      await import(${JSON.stringify(indexUrl)});
      const { createMaintenanceApp } = await import(${JSON.stringify(edgeUrl)});
      const app = createMaintenanceApp(null);
      const healthRes = await app.request('/api/health');
      const apiRes = await app.request('/api/puzzle');
      console.log(JSON.stringify({
        healthStatus: healthRes.status,
        healthBody: await healthRes.json(),
        apiStatus: apiRes.status,
      }));
    `);

    const result = JSON.parse(stdout) as {
      healthStatus: number;
      healthBody: { status: string };
      apiStatus: number;
    };
    expect(result.healthStatus).toBe(200);
    expect(result.healthBody).toEqual({ status: 'maintenance' });
    expect(result.apiStatus).toBe(503);
  });

  it('boots compiled dist/index.js against a temp SQLite DB and serves /api/health under plain node', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanakenno-compiled-'));
    tempDirs.push(dir);
    const dbPath = path.join(dir, 'boot.db');

    const connUrl = pathToFileURL(path.join(SERVER_DIR, 'dist/db/connection.js')).href;
    const indexUrl = pathToFileURL(path.join(SERVER_DIR, 'dist/index.js')).href;
    const edgeUrl = pathToFileURL(path.join(SERVER_DIR, 'dist/edge-middleware.js')).href;

    const stdout = runPlainNodeModule(
      `
      const { initDb } = await import(${JSON.stringify(connUrl)});
      const { ensureBootSeed, shutdownServer } = await import(${JSON.stringify(indexUrl)});
      const { createServerApp } = await import(${JSON.stringify(edgeUrl)});
      const { db, engine } = await initDb(process.env);
      await ensureBootSeed(db, process.env);
      const app = createServerApp(db, null, engine);
      const res = await app.request('/api/health');
      const body = await res.json();
      await shutdownServer(null, db, engine);
      console.log(JSON.stringify({ status: res.status, body }));
      `,
      {
        NODE_ENV: 'production',
        DB_PATH: dbPath,
        SEED_ON_BOOT: 'true',
        MAINTENANCE_MODE: '',
        TURSO_DATABASE_URL: '',
      },
    );

    const result = JSON.parse(stdout) as {
      status: number;
      body: { status: string; engine: string; total_puzzles: number };
    };
    expect(result.status).toBe(200);
    expect(result.body.status).toBe('ok');
    expect(result.body.engine).toBe('kysely-sqlite');
    expect(result.body.total_puzzles).toBeGreaterThan(0);
  });
});
