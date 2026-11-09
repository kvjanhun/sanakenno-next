import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '../../packages/server/src/db/connection.js';
import {
  createServerApp,
  EDGE_SECURITY_HEADERS,
} from '../../packages/server/src/edge-middleware.js';

describe('Cloud Run Edge Middleware & Static Serving', () => {
  let tempStaticDir: string;
  let db: ReturnType<typeof createDb>;
  let app: ReturnType<typeof createServerApp>;

  beforeAll(async () => {
    tempStaticDir = path.join(
      os.tmpdir(),
      `sanakenno-static-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fs.mkdirSync(tempStaticDir, { recursive: true });
    fs.writeFileSync(
      path.join(tempStaticDir, 'index.html'),
      '<!doctype html><title>Sanakenno</title>',
    );
    fs.writeFileSync(
      path.join(tempStaticDir, 'sw.js'),
      'self.addEventListener("install", () => {});',
    );
    fs.writeFileSync(
      path.join(tempStaticDir, 'manifest.webmanifest'),
      JSON.stringify({ name: 'Sanakenno' }),
    );

    db = createDb(':memory:');
    await db
      .insertInto('puzzles')
      .values({ slot: 1, letters: 'a,e,i,k,l,n,s', center: 'a', is_active: 1 })
      .execute();

    app = createServerApp(db, tempStaticDir);
  });

  afterAll(async () => {
    await db.destroy();
    if (tempStaticDir && fs.existsSync(tempStaticDir)) {
      fs.rmSync(tempStaticDir, { recursive: true, force: true });
    }
  });

  it('302-redirects next.sanakenno.fi and www.sanakenno.fi to https://sanakenno.fi preserving path and query', async () => {
    const nextRes = await app.request('https://next.sanakenno.fi/?transfer=abc123', {
      headers: { Host: 'next.sanakenno.fi' },
    });
    expect(nextRes.status).toBe(302);
    expect(nextRes.headers.get('location')).toBe('https://sanakenno.fi/?transfer=abc123');
    expect(nextRes.headers.get('cache-control')).toBe('no-store');

    const wwwRes = await app.request('https://www.sanakenno.fi/api/puzzle', {
      headers: { 'X-Forwarded-Host': 'www.sanakenno.fi:443' },
    });
    expect(wwwRes.status).toBe(302);
    expect(wwwRes.headers.get('location')).toBe('https://sanakenno.fi/api/puzzle');
    expect(wwwRes.headers.get('cache-control')).toBe('no-store');
  });

  it('allows /api/health without redirect on next.sanakenno.fi and *.run.app for health probes', async () => {
    const nextHealth = await app.request('https://next.sanakenno.fi/api/health', {
      headers: { Host: 'next.sanakenno.fi' },
    });
    expect(nextHealth.status).toBe(200);
    const body = (await nextHealth.json()) as { status: string };
    expect(body.status).toBe('ok');

    const runAppHealth = await app.request(
      'https://sanakenno-next-712588936092.europe-north1.run.app/api/health',
      {
        headers: { Host: 'sanakenno-next-712588936092.europe-north1.run.app' },
      },
    );
    expect(runAppHealth.status).toBe(200);
  });

  it('emits Google-recommended browser security headers on API, HTML, and 404 responses', async () => {
    const res = await app.request('https://sanakenno.fi/', {
      headers: { Host: 'sanakenno.fi' },
    });
    expect(res.status).toBe(200);

    for (const [header, expectedValue] of Object.entries(EDGE_SECURITY_HEADERS)) {
      expect(res.headers.get(header)).toBe(expectedValue);
    }

    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it('serves /, /index.html, and /sw.js with Cache-Control: no-cache and /manifest.webmanifest with manifest MIME type', async () => {
    const rootRes = await app.request('https://sanakenno.fi/', {
      headers: { Host: 'sanakenno.fi' },
    });
    expect(rootRes.status).toBe(200);
    expect(rootRes.headers.get('cache-control')).toBe('no-cache');
    expect(await rootRes.text()).toContain('<title>Sanakenno</title>');

    const swRes = await app.request('https://sanakenno.fi/sw.js', {
      headers: { Host: 'sanakenno.fi' },
    });
    expect(swRes.status).toBe(200);
    expect(swRes.headers.get('cache-control')).toBe('no-cache');

    const manifestRes = await app.request('https://sanakenno.fi/manifest.webmanifest', {
      headers: { Host: 'sanakenno.fi' },
    });
    expect(manifestRes.status).toBe(200);
    expect(manifestRes.headers.get('content-type')).toContain('application/manifest+json');
  });

  it('302-redirects /connect preserving query parameters to / for legacy device transfer links', async () => {
    const connectRes = await app.request('https://sanakenno.fi/connect?connect=legacy123', {
      headers: { Host: 'sanakenno.fi' },
    });
    expect(connectRes.status).toBe(302);
    expect(connectRes.headers.get('location')).toBe('/?connect=legacy123');
    expect(connectRes.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 404 (with security headers) for unknown non-asset paths instead of SPA 200 fallback', async () => {
    for (const probePath of ['/.env', '/wp-admin', '/login.php', '/unknown-route']) {
      const res = await app.request(`https://sanakenno.fi${probePath}`, {
        headers: { Host: 'sanakenno.fi' },
      });
      expect(res.status, `Expected 404 for ${probePath}`).toBe(404);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    }

    const api404 = await app.request('https://sanakenno.fi/api/does-not-exist', {
      headers: { Host: 'sanakenno.fi' },
    });
    expect(api404.status).toBe(404);
    expect(await api404.json()).toEqual({ error: 'Not found' });
  });
});
