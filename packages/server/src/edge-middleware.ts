import fs from 'node:fs';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type MiddlewareHandler } from 'hono';
import type { Kysely } from 'kysely';
import { createApp } from './app.js';
import type { Database } from './db/schema.js';

export const CANONICAL_ORIGIN = 'https://sanakenno.fi';

const REDIRECT_HOSTS = new Set(['next.sanakenno.fi', 'www.sanakenno.fi']);

export const EDGE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), geolocation=(), microphone=(), focus-without-user-activation=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

function extractRequestHost(rawHeader: string | undefined): string {
  if (!rawHeader) return '';
  const firstHost = rawHeader.split(',')[0]?.trim().toLowerCase() ?? '';
  return firstHost.replace(/:\d+$/, '');
}

/**
 * Middleware that applies Google-recommended browser security headers and
 * 302-redirects `next.sanakenno.fi` and `www.sanakenno.fi` to `https://sanakenno.fi`
 * (exempting `/api/health` for infrastructure probes).
 */
export const edgeMiddleware: MiddlewareHandler = async (c, next) => {
  for (const [header, value] of Object.entries(EDGE_SECURITY_HEADERS)) {
    c.header(header, value);
  }

  const host =
    extractRequestHost(c.req.header('x-forwarded-host')) ||
    extractRequestHost(c.req.header('host'));

  if (REDIRECT_HOSTS.has(host) && c.req.path !== '/api/health') {
    const reqUrl = new URL(c.req.url, CANONICAL_ORIGIN);
    const target = `${CANONICAL_ORIGIN}${reqUrl.pathname}${reqUrl.search}`;
    c.header('Cache-Control', 'no-store');
    return c.redirect(target, 302);
  }

  await next();

  if (c.req.path === '/sw.js' || c.req.path === '/' || c.req.path === '/index.html') {
    c.header('Cache-Control', 'no-cache');
  } else if (c.req.path === '/manifest.webmanifest') {
    c.header('Content-Type', 'application/manifest+json');
  }
};

/**
 * Resolve the built frontend directory (`dist/`) when running in production or standalone mode.
 */
export function findStaticDir(): string | null {
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

/**
 * Create the complete production Hono application combining edge middleware,
 * typed `/api/*` routes, and static asset / root SPA serving.
 */
export function createServerApp(
  db: Kysely<Database>,
  staticDir: string | null = findStaticDir(),
): Hono {
  const app = new Hono();
  const apiApp = createApp(db);

  app.use('*', edgeMiddleware);
  app.route('/', apiApp);

  if (staticDir && fs.existsSync(staticDir)) {
    const indexPath = path.join(staticDir, 'index.html');
    const indexHtml = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf-8') : null;

    if (indexHtml !== null) {
      app.get('/', (c) => {
        c.header('Cache-Control', 'no-cache');
        return c.html(indexHtml);
      });
      app.get('/index.html', (c) => {
        c.header('Cache-Control', 'no-cache');
        return c.html(indexHtml);
      });
    }

    const relativeRoot = path.relative(process.cwd(), staticDir) || '.';
    app.use('/*', serveStatic({ root: relativeRoot }));
  }

  app.notFound((c) => {
    for (const [header, value] of Object.entries(EDGE_SECURITY_HEADERS)) {
      c.header(header, value);
    }
    if (c.req.path.startsWith('/api')) {
      return c.json({ error: 'Not found' }, 404);
    }
    return c.text('Not found', 404);
  });

  return app;
}
