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
  it('keeps every source and test file under the 500-line monolith ceiling', () => {
    const files = [
      ...walkFiles(path.join(ROOT, 'packages'), ['.ts', '.tsx']),
      ...walkFiles(path.join(ROOT, 'tests'), ['.ts', '.tsx']),
    ];
    const oversized = files
      .map((file) => ({
        file: path.relative(ROOT, file).replaceAll('\\', '/'),
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

  it('enforces type-only imports from @sanakenno/server inside @sanakenno/web', () => {
    const webFiles = walkFiles(path.join(ROOT, 'packages/web/src'), ['.ts', '.tsx']);
    const violations: string[] = [];

    for (const file of webFiles) {
      const rel = path.relative(ROOT, file).replaceAll('\\', '/');
      const content = fs.readFileSync(file, 'utf8');
      if (/import\s+(?!type\b)[^;]*from\s+['"]@sanakenno\/server/.test(content)) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });

  it('confines Kysely SQL queries and better-sqlite3 to *.queries.ts and src/db/', () => {
    const serverFiles = walkFiles(path.join(ROOT, 'packages/server/src'), ['.ts']);
    const queryViolations: string[] = [];
    const sqliteImportViolations: string[] = [];

    for (const file of serverFiles) {
      const rel = path.relative(ROOT, file).replaceAll('\\', '/');
      const content = fs.readFileSync(file, 'utf8');
      const isDbLayer = rel.startsWith('packages/server/src/db/');
      const isQueriesFile = rel.endsWith('.queries.ts');

      if (!isDbLayer && !isQueriesFile) {
        if (/\.(selectFrom|insertInto|updateTable|deleteFrom)\s*\(|\bsql`/.test(content)) {
          queryViolations.push(rel);
        }
      }

      if (!isDbLayer && /from\s+['"]better-sqlite3['"]/.test(content)) {
        sqliteImportViolations.push(rel);
      }
    }

    expect(queryViolations).toEqual([]);
    expect(sqliteImportViolations).toEqual([]);
  });

  it('requires method-chained Hono routes in *.routes.ts so AppType RPC inference stays intact', () => {
    const routeFiles = walkFiles(path.join(ROOT, 'packages/server/src/features'), ['.routes.ts']);
    const violations: string[] = [];

    for (const file of routeFiles) {
      const rel = path.relative(ROOT, file).replaceAll('\\', '/');
      const content = fs.readFileSync(file, 'utf8');
      if (/^\s*(?!return\b)[a-zA-Z_$][\w$]*\.(get|post|put|delete|patch)\s*\(/m.test(content)) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });

  it('forbids hardcoded hex colours in React components (.tsx) — use CSS custom properties', () => {
    const tsxFiles = walkFiles(path.join(ROOT, 'packages/web/src'), ['.tsx']);
    const violations: string[] = [];

    for (const file of tsxFiles) {
      const rel = path.relative(ROOT, file).replaceAll('\\', '/');
      const content = fs.readFileSync(file, 'utf8');
      if (/#[0-9a-fA-F]{3,8}\b/.test(content)) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps @sanakenno/shared pure (no server/web imports, no Node/DOM/storage I/O)', () => {
    const sharedFiles = walkFiles(path.join(ROOT, 'packages/shared/src'), ['.ts']);
    const violations: string[] = [];

    for (const file of sharedFiles) {
      const rel = path.relative(ROOT, file).replaceAll('\\', '/');
      const content = fs.readFileSync(file, 'utf8');
      const hasForbiddenImport =
        /from\s+['"](@sanakenno\/(server|web)|better-sqlite3|kysely|hono|react|node:|fs|path|crypto)/.test(
          content,
        );
      const hasForbiddenGlobal =
        /\b(window|document|localStorage|sessionStorage|fetch)\b|\bprocess\.env\b/.test(content);

      if (hasForbiddenImport || hasForbiddenGlobal) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });

  it('enforces documentation single-ownership symlinks and forbids changelog prose', () => {
    for (const linkName of ['CLAUDE.md', 'GEMINI.md']) {
      const fullPath = path.join(ROOT, linkName);
      expect(fs.lstatSync(fullPath).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(fullPath)).toBe('AGENTS.md');
    }

    for (const docName of ['PROJECT_MAP.md', 'README.md']) {
      const content = fs.readFileSync(path.join(ROOT, docName), 'utf8');
      expect(content).not.toMatch(/\b(used to|no longer|previously|was moved|was renamed)\b/i);
    }
  });

  it('keeps specs/NN-*.md files structurally valid and synchronized with specs/00-backlog.md', () => {
    const backlogContent = fs.readFileSync(path.join(ROOT, 'specs/00-backlog.md'), 'utf8');
    const specFiles = fs
      .readdirSync(path.join(ROOT, 'specs'))
      .filter((name) => /^\d{2}-.*\.md$/.test(name) && name !== '00-backlog.md');

    for (const specFile of specFiles) {
      const content = fs.readFileSync(path.join(ROOT, 'specs', specFile), 'utf8');
      const statusRegex = /^Status:\s*(draft|approved|in-progress|ready-for-curation|shipped)$/m;
      const statusMatch = statusRegex.exec(content);
      expect(statusMatch, `${specFile} must have a valid Status header`).not.toBeNull();
      expect(content, `${specFile} must have a Branch header`).toMatch(/^Branch:\s*spec\/\d{2}-/m);

      for (const requiredHeading of [
        '## 1. Objective',
        '## 2. Invariants & Non-Goals',
        '## 3. Contract & Architecture',
        '## 4. Acceptance Criteria',
      ]) {
        expect(content, `${specFile} missing ${requiredHeading}`).toContain(requiredHeading);
      }

      const status = statusMatch?.[1];
      const escapedFile = specFile.replaceAll('.', '\\.');
      const backlogRowRegex = new RegExp(`\\(${escapedFile}\\)\\s*\\|\\s*\`${status}\``);
      expect(
        backlogContent,
        `specs/00-backlog.md status for ${specFile} must match Status: ${status}`,
      ).toMatch(backlogRowRegex);
    }
  });
});
