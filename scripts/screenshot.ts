import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  buildTargetActionSteps,
  isLightVariantAction,
  SCREENSHOT_TARGETS,
  type ScreenshotTarget,
} from './screenshot-targets.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, '.screenshots');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface CdpSession {
  send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  close: () => void;
}

function findChrome(): string {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((c): c is string => Boolean(c && fs.existsSync(c)));
  if (!found) throw new Error('Chrome binary not found. Set CHROME_PATH env var.');
  return found;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() =>
        addr && typeof addr !== 'string' ? resolve(addr.port) : reject(new Error('No free port')),
      );
    });
  });
}

async function ensureServer(
  spawned: ChildProcess[],
  url: string,
  pkgFilter: string,
  requireOk: boolean,
  extraEnv?: Record<string, string>,
): Promise<void> {
  const check = () =>
    fetch(url, { signal: AbortSignal.timeout(1000) })
      .then((r) => (requireOk ? r.ok : r.ok || r.status === 404))
      .catch(() => false);
  if (await check()) return;
  console.log(`Starting ${pkgFilter} (${url})...`);
  const proc = spawn('pnpm', ['--filter', pkgFilter, 'dev'], {
    cwd: ROOT,
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    stdio: 'pipe',
    detached: true,
  });
  for (let i = 0; i < 40; i++) {
    if (await check()) {
      spawned.push(proc);
      return;
    }
    await sleep(500);
  }
  killProcessTree(proc);
  throw new Error(`Timed out waiting for ${pkgFilter} at ${url}`);
}

function killProcessTree(proc: ChildProcess | null): void {
  if (!proc || proc.killed) return;
  try {
    if (proc.pid) process.kill(-proc.pid, 'SIGTERM');
    else proc.kill('SIGTERM');
  } catch {
    try {
      proc.kill('SIGTERM');
    } catch {
      /* exited */
    }
  }
}

async function connectCdp(chrome: string, port: number, userDataDir: string) {
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      '--hide-scrollbars',
      '--disable-gpu',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let page: { type: string; webSocketDebuggerUrl: string } | undefined;
  for (let i = 0; i < 40 && !page; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      page = ((await res.json()) as Array<{ type: string; webSocketDebuggerUrl: string }>).find(
        (t) => t.type === 'page',
      );
    } catch {
      /* Chrome still starting */
    }
    if (!page) await sleep(200);
  }
  if (!page) {
    proc.kill('SIGKILL');
    throw new Error('No page target found on Chrome remote debugging port');
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => Object.assign(ws, { onopen: resolve, onerror: reject }));

  let msgId = 1;
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const id = msgId++;
      const onMsg = (ev: MessageEvent) => {
        const msg = JSON.parse(String(ev.data)) as {
          id?: number;
          result?: Record<string, unknown>;
          error?: { message?: string };
        };
        if (msg.id !== id) return;
        ws.removeEventListener('message', onMsg);
        if (msg.error) reject(new Error(msg.error.message ?? `CDP error in ${method}`));
        else resolve(msg.result ?? {});
      };
      ws.addEventListener('message', onMsg);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Page.enable');
  return { proc, cdp: { send, close: () => ws.close() } };
}

async function waitForAppReady(cdp: CdpSession): Promise<void> {
  const expr = `Boolean(!window.__sanakennoReloading && document.querySelector('[data-testid="show-hints-button"]'))`;
  for (let i = 0; i < 60; i++) {
    try {
      const res = (await cdp.send('Runtime.evaluate', { expression: expr })) as {
        result?: { value?: boolean };
      };
      if (res.result?.value) break;
    } catch {
      // Context destroyed mid-navigation
    }
    await sleep(150);
  }
  await sleep(250);
}

async function captureTarget(cdp: CdpSession, target: ScreenshotTarget): Promise<void> {
  const outPath = path.join(OUT_DIR, `${target.name}.png`);
  console.log(`Capturing ${target.name} (${target.width}x${target.height})...`);
  const scheme = isLightVariantAction(target.action) ? 'light' : 'dark';
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: target.width,
    height: target.height,
    deviceScaleFactor: 2,
    mobile: target.mobile,
  });
  await cdp.send('Emulation.setEmulatedMedia', {
    media: '',
    features: [{ name: 'prefers-color-scheme', value: scheme }],
  });
  await cdp.send('Runtime.evaluate', {
    expression: `window.localStorage.clear(); document.documentElement.removeAttribute('data-theme'); document.documentElement.removeAttribute('data-palette'); window.__sanakennoReloading = true;`,
  });
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitForAppReady(cdp);

  for (const step of buildTargetActionSteps(target.action)) {
    const res = await cdp.send('Runtime.evaluate', {
      expression: step.expression,
      awaitPromise: step.awaitPromise,
    });
    if (res.exceptionDetails)
      console.error(`Action error for ${target.name}:`, res.exceptionDetails);
    if (step.delayAfterMs) await sleep(step.delayAfterMs);
  }

  const shot = (await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: target.width, height: target.height, scale: 1 },
  })) as { data: string };
  const buf = Buffer.from(shot.data, 'base64');
  if (buf.length === 0) throw new Error(`Generated empty screenshot at ${outPath}`);
  fs.writeFileSync(outPath, buf);
  console.log(`Saved ${target.name}.png (${buf.length} bytes)`);
}

async function main() {
  const chrome = findChrome();
  const url = process.env.APP_URL ?? 'http://localhost:5173';
  const apiHealthUrl = process.env.API_HEALTH_URL ?? 'http://localhost:3001/api/health';
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanakenno-cdp-'));
  const spawned: ChildProcess[] = [];
  let chromeProc: ChildProcess | null = null;
  let cdp: CdpSession | null = null;

  try {
    await ensureServer(spawned, apiHealthUrl, '@sanakenno/server', true, { SEED_ON_BOOT: 'true' });
    await ensureServer(spawned, url, '@sanakenno/web', false);
    const conn = await connectCdp(chrome, await getFreePort(), userDataDir);
    chromeProc = conn.proc;
    cdp = conn.cdp;
    await cdp.send('Page.navigate', { url });
    await waitForAppReady(cdp);
    for (const target of SCREENSHOT_TARGETS) await captureTarget(cdp, target);
    console.log(`\nScreenshots ready in ${OUT_DIR}`);
  } finally {
    cdp?.close();
    chromeProc?.kill('SIGKILL');
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      /* ignore */
    }
    spawned.forEach(killProcessTree);
  }
}

main().catch((err) => {
  console.error('Error taking screenshots:', err);
  process.exit(1);
});
