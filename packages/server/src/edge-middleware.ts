import fs from 'node:fs';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type MiddlewareHandler } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { Kysely } from 'kysely';
import { createApp } from './app.js';
import type { DbEngine } from './db/connection.js';
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

export const edgeSecureHeadersMiddleware: MiddlewareHandler = secureHeaders({
  strictTransportSecurity: 'max-age=31536000; includeSubDomains',
  xFrameOptions: 'DENY',
  referrerPolicy: 'strict-origin-when-cross-origin',
  crossOriginOpenerPolicy: 'same-origin-allow-popups',
  crossOriginResourcePolicy: 'same-origin',
  xContentTypeOptions: 'nosniff',
  permissionsPolicy: {
    camera: [],
    geolocation: [],
    microphone: [],
    focusWithoutUserActivation: [],
  },
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  },
});

function extractRequestHost(rawHeader: string | undefined): string {
  if (!rawHeader) return '';
  const firstHost = rawHeader.split(',')[0]?.trim().toLowerCase() ?? '';
  return firstHost.replace(/:\d+$/, '');
}

/**
 * Middleware that 302-redirects `next.sanakenno.fi` and `www.sanakenno.fi` to
 * `https://sanakenno.fi` (exempting `/api/health` for infrastructure probes)
 * and sets PWA caching / manifest headers.
 */
export const edgeMiddleware: MiddlewareHandler = async (c, next) => {
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

  if (
    c.res.status < 500 &&
    (c.req.path === '/sw.js' || c.req.path === '/' || c.req.path === '/index.html')
  ) {
    c.header('Cache-Control', 'no-cache');
  } else if (c.req.path === '/manifest.webmanifest' && c.res.status >= 200 && c.res.status < 300) {
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

function resolveCommitSha(staticDir: string | null): string {
  if (staticDir) {
    const commitFile = path.join(staticDir, 'commit.txt');
    if (fs.existsSync(commitFile)) {
      const content = fs.readFileSync(commitFile, 'utf8').trim();
      if (content && content !== 'unknown') {
        return content;
      }
    }
  }
  const envCommit = process.env.GIT_COMMIT?.trim();
  return envCommit && envCommit.length > 0 ? envCommit : 'unknown';
}

const MAINTENANCE_API_ERROR = 'Huoltokatko käynnissä. Yritä hetken kuluttua uudelleen.';

const MAINTENANCE_HTML = `<!doctype html>
<html lang="fi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sanakenno — Huoltokatko</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #faf8f5; color: #1f2937; padding: 1.5rem; }
      main { max-width: 28rem; text-align: center; }
      h1 { font-size: 1.5rem; margin: 0 0 0.75rem; }
      p { line-height: 1.5; margin: 0; color: #4b5563; }
    </style>
  </head>
  <body>
    <main>
      <h1>Sanakenno on huoltokatkolla</h1>
      <p>${MAINTENANCE_API_ERROR}</p>
    </main>
  </body>
</html>`;

/**
 * Create a database-free maintenance Hono application for zero-write-overlap cutovers.
 */
export function createMaintenanceApp(staticDir: string | null = findStaticDir()): Hono {
  const app = new Hono();
  app.use('*', edgeSecureHeadersMiddleware);
  app.use('*', edgeMiddleware);

  app.get('/api/health', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ status: 'maintenance' }, 200);
  });

  app.get('/commit.txt', (c) => {
    c.header('Cache-Control', 'no-store');
    c.header('Content-Type', 'text/plain; charset=utf-8');
    return c.text(resolveCommitSha(staticDir), 200);
  });

  app.all('/api/*', (c) => {
    c.header('Retry-After', '120');
    c.header('Cache-Control', 'no-store');
    return c.json({ error: MAINTENANCE_API_ERROR }, 503);
  });

  app.all('/api', (c) => {
    c.header('Retry-After', '120');
    c.header('Cache-Control', 'no-store');
    return c.json({ error: MAINTENANCE_API_ERROR }, 503);
  });

  app.all('*', (c) => {
    c.header('Retry-After', '120');
    c.header('Cache-Control', 'no-store');
    return c.html(MAINTENANCE_HTML, 503);
  });

  return app;
}

/**
 * Create the complete production Hono application combining edge middleware,
 * typed `/api/*` routes, and static asset / root SPA serving.
 */
export function createServerApp(
  db: Kysely<Database>,
  staticDir: string | null = findStaticDir(),
  engine: DbEngine = 'kysely-sqlite',
): Hono {
  const app = new Hono();
  const apiApp = createApp(db, engine);

  app.use('*', edgeSecureHeadersMiddleware);
  app.use('*', edgeMiddleware);
  app.route('/', apiApp);

  app.get('/commit.txt', (c) => {
    c.header('Cache-Control', 'no-store');
    c.header('Content-Type', 'text/plain; charset=utf-8');
    return c.text(resolveCommitSha(staticDir), 200);
  });

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
      app.get('/connect', (c) => {
        c.header('Cache-Control', 'no-store');
        const reqUrl = new URL(c.req.url, CANONICAL_ORIGIN);
        return c.redirect(`/${reqUrl.search}`, 302);
      });
    }

    const relativeRoot = path.relative(process.cwd(), staticDir) || '.';
    app.use('/*', serveStatic({ root: relativeRoot }));
  }

  app.notFound((c) => {
    if (c.req.path.startsWith('/api')) {
      return c.json({ error: 'Not found' }, 404);
    }
    return c.text('Not found', 404);
  });

  return app;
}
