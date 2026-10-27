import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..');
const MAX_LINES_PER_FILE = 500;

function walkFiles(dir: string, exts: string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

describe('Architectural Fitness Guardrails', () => {
  it('keeps every source file under the 500-line monolith ceiling', () => {
    const files = walkFiles(path.join(ROOT, 'packages'), ['.ts', '.tsx']);
    const oversized = files
      .map((file) => ({
        file: path.relative(ROOT, file),
        lines: fs.readFileSync(file, 'utf8').split('\n').length,
      }))
      .filter((item) => item.lines > MAX_LINES_PER_FILE);

    expect(oversized).toEqual([]);
  });

  it('forbids direct fetch() calls in @sanakenno/web outside src/api/', () => {
    const webFiles = walkFiles(path.join(ROOT, 'packages/web/src'), ['.ts', '.tsx']);
    const violations: string[] = [];

    for (const file of webFiles) {
      const rel = path.relative(ROOT, file).replaceAll('\\', '/');
      if (rel.startsWith('packages/web/src/api/')) continue;
      const content = fs.readFileSync(file, 'utf8');
      if (/\bfetch\s*\(/.test(content)) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });

  it('forbids direct Kysely table queries inside Hono *.routes.ts files (must delegate to *.queries.ts)', () => {
    const routeFiles = walkFiles(path.join(ROOT, 'packages/server/src/features'), ['.routes.ts']);
    const violations: string[] = [];

    for (const file of routeFiles) {
      const rel = path.relative(ROOT, file);
      const content = fs.readFileSync(file, 'utf8');
      if (/\.(selectFrom|insertInto|updateTable|deleteFrom)\s*\(/.test(content)) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });

  it('forbids hardcoded hex colours in React components (.tsx) — use CSS custom properties', () => {
    const tsxFiles = walkFiles(path.join(ROOT, 'packages/web/src'), ['.tsx']);
    const violations: string[] = [];

    for (const file of tsxFiles) {
      const rel = path.relative(ROOT, file);
      const content = fs.readFileSync(file, 'utf8');
      if (/#[0-9a-fA-F]{3,8}\b/.test(content)) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps @sanakenno/shared pure (no server or web imports, no database or DOM I/O)', () => {
    const sharedFiles = walkFiles(path.join(ROOT, 'packages/shared/src'), ['.ts']);
    const violations: string[] = [];

    for (const file of sharedFiles) {
      const rel = path.relative(ROOT, file);
      const content = fs.readFileSync(file, 'utf8');
      if (/from\s+['"](@sanakenno\/(server|web)|better-sqlite3|kysely|hono|react)/.test(content)) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });
});
