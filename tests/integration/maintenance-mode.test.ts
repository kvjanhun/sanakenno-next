import { describe, expect, it } from 'vitest';
import {
  createMaintenanceApp,
  EDGE_SECURITY_HEADERS,
} from '../../packages/server/src/edge-middleware.js';

describe('Zero-DB Maintenance Mode', () => {
  it('returns 200 maintenance status on /api/health and 200 on /commit.txt', async () => {
    const app = createMaintenanceApp(null);

    const healthRes = await app.request('/api/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.headers.get('Cache-Control')).toBe('no-store');
    expect(await healthRes.json()).toEqual({ status: 'maintenance' });

    const commitRes = await app.request('/commit.txt');
    expect(commitRes.status).toBe(200);
    expect(commitRes.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 503 with Retry-After and Finnish JSON on API endpoints', async () => {
    const app = createMaintenanceApp(null);

    const puzzleRes = await app.request('/api/puzzle');
    expect(puzzleRes.status).toBe(503);
    expect(puzzleRes.headers.get('Retry-After')).toBe('120');
    expect(puzzleRes.headers.get('Cache-Control')).toBe('no-store');
    expect(await puzzleRes.json()).toEqual({
      error: 'Huoltokatko käynnissä. Yritä hetken kuluttua uudelleen.',
    });

    const syncRes = await app.request('/api/player/sync/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(syncRes.status).toBe(503);
    expect(syncRes.headers.get('Retry-After')).toBe('120');
    expect(syncRes.headers.get('Cache-Control')).toBe('no-store');
    expect(await syncRes.json()).toEqual({
      error: 'Huoltokatko käynnissä. Yritä hetken kuluttua uudelleen.',
    });
  });

  it('returns 503 Finnish HTML on / with Retry-After and security headers intact', async () => {
    const app = createMaintenanceApp(null);

    const rootRes = await app.request('/');
    expect(rootRes.status).toBe(503);
    expect(rootRes.headers.get('Retry-After')).toBe('120');
    expect(rootRes.headers.get('Cache-Control')).toBe('no-store');
    expect(rootRes.headers.get('Content-Type')).toContain('text/html');

    for (const [header, value] of Object.entries(EDGE_SECURITY_HEADERS)) {
      expect(rootRes.headers.get(header)).toBe(value);
    }

    const html = await rootRes.text();
    expect(html).toContain('Huoltokatko');
    expect(html).toContain('Huoltokatko käynnissä');
  });
});
