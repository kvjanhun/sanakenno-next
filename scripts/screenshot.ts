import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, '.screenshots');
const DEFAULT_URL = 'http://localhost:5173';

function findChrome(): string {
  const envPath = process.env.CHROME_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error('Google Chrome binary not found. Set CHROME_PATH environment variable.');
}

async function isServerRunning(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

async function waitForServer(url: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await isServerRunning(url)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for dev server at ${url}`);
}

async function captureWithCdp(
  chrome: string,
  url: string,
  target: { name: string; width: number; height: number; mobile?: boolean; action?: string },
  outPath: string,
): Promise<void> {
  const port = 9333;
  const proc = spawn(chrome, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    url,
  ]);

  try {
    let targets: Array<{ type: string; webSocketDebuggerUrl: string }> = [];
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json`);
        targets = await res.json();
        if (targets.length > 0) break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('No page target found on Chrome remote debugging port');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    const send = (method: string, params: Record<string, unknown> = {}) =>
      new Promise<Record<string, unknown>>((resolve) => {
        const id = msgId++;
        const onMsg = (event: MessageEvent) => {
          const msg = JSON.parse(String(event.data));
          if (msg.id === id) {
            ws.removeEventListener('message', onMsg);
            resolve(msg.result as Record<string, unknown>);
          }
        };
        ws.addEventListener('message', onMsg);
        ws.send(JSON.stringify({ id, method, params }));
      });

    await send('Emulation.setDeviceMetricsOverride', {
      width: target.width,
      height: target.height,
      deviceScaleFactor: 2,
      mobile: target.mobile ?? false,
    });

    await new Promise((r) => setTimeout(r, 1200));

    if (target.action === 'theme-light') {
      await send('Runtime.evaluate', {
        expression: `document.documentElement.setAttribute('data-theme', 'light')`,
      });
      await new Promise((r) => setTimeout(r, 200));
    }

    if (target.action === 'unlock-matrix') {
      await send('Runtime.evaluate', {
        expression: `
          (async () => {
            const showBtn = document.querySelector('[data-testid="show-hints-button"]');
            if (showBtn) showBtn.click();
            await new Promise((r) => setTimeout(r, 100));
            const btn1 = document.querySelector('[data-testid="activate-hints-button"]');
            if (btn1) btn1.click();
            await new Promise((r) => setTimeout(r, 200));
            const btn2 = document.querySelector('[data-testid="upgrade-tier-button"]');
            if (btn2) btn2.click();
          })()
        `,
        awaitPromise: true,
      });
      await new Promise((r) => setTimeout(r, 500));
    }

    if (target.action === 'view-clues-closed') {
      await send('Runtime.evaluate', {
        expression: `
          (async () => {
            const showBtn = document.querySelector('[data-testid="show-hints-button"]');
            if (showBtn) showBtn.click();
            await new Promise((r) => setTimeout(r, 100));
            const tab = document.querySelector('[data-testid="tier-tab-2"]');
            if (tab) tab.click();
          })()
        `,
        awaitPromise: true,
      });
      await new Promise((r) => setTimeout(r, 500));
    }

    if (target.action === 'view-clues-open' || target.action === 'view-clues-open-typed') {
      await send('Runtime.evaluate', {
        expression: `
          (async () => {
            const showBtn = document.querySelector('[data-testid="show-hints-button"]');
            if (showBtn) showBtn.click();
            await new Promise((r) => setTimeout(r, 100));
            const tab = document.querySelector('[data-testid="tier-tab-2"]');
            if (tab) tab.click();
            await new Promise((r) => setTimeout(r, 200));
            const b1 = document.querySelector('[data-testid="unlock-pangrams-button"]');
            if (b1) b1.click();
            await new Promise((r) => setTimeout(r, 100));
            const b2 = document.querySelector('[data-testid="unlock-pairs-button"]');
            if (b2) b2.click();
            await new Promise((r) => setTimeout(r, 100));
            const b3 = document.querySelector('[data-testid="unlock-suffixes-button"]');
            if (b3) b3.click();
          })()
        `,
        awaitPromise: true,
      });
      await new Promise((r) => setTimeout(r, 500));
    }

    if (target.action === 'view-clues-open-typed') {
      await send('Runtime.evaluate', {
        expression: `
          (() => {
            for (const char of 'huppu') {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: char, code: 'Key' + char.toUpperCase() }));
            }
          })()
        `,
        awaitPromise: false,
      });
      await new Promise((r) => setTimeout(r, 300));
    }

    const result = (await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: target.width, height: target.height, scale: 1 },
    })) as { data: string };

    fs.writeFileSync(outPath, Buffer.from(result.data, 'base64'));
    ws.close();
  } finally {
    proc.kill('SIGKILL');
  }
}

async function main() {
  const chrome = findChrome();
  const url = process.env.APP_URL ?? DEFAULT_URL;

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let devServer: ChildProcess | null = null;
  const alreadyRunning = await isServerRunning(url);

  if (!alreadyRunning) {
    console.log(`Starting dev server at ${url}...`);
    devServer = spawn('pnpm', ['--filter', '@sanakenno/web', 'dev'], {
      cwd: ROOT,
      stdio: 'pipe',
      detached: false,
    });
    await waitForServer(url);
  }

  try {
    const targets = [
      { name: 'desktop', width: 1280, height: 800, mobile: false, action: undefined },
      { name: 'desktop-matrix', width: 1280, height: 800, mobile: false, action: 'unlock-matrix' },
      {
        name: 'desktop-clues-open',
        width: 1280,
        height: 800,
        mobile: false,
        action: 'view-clues-open',
      },
      { name: 'mobile', width: 390, height: 844, mobile: true, action: undefined },
      { name: 'mobile-light', width: 390, height: 844, mobile: true, action: 'theme-light' },
      { name: 'mobile-matrix', width: 390, height: 844, mobile: true, action: 'unlock-matrix' },
      {
        name: 'mobile-clues-closed',
        width: 390,
        height: 844,
        mobile: true,
        action: 'view-clues-closed',
      },
      {
        name: 'mobile-clues-open',
        width: 390,
        height: 844,
        mobile: true,
        action: 'view-clues-open',
      },
      {
        name: 'mobile-clues-typed',
        width: 390,
        height: 844,
        mobile: true,
        action: 'view-clues-open-typed',
      },
    ];

    for (const target of targets) {
      const outPath = path.join(OUT_DIR, `${target.name}.png`);
      console.log(`Capturing ${target.name} (${target.width}x${target.height}) to ${outPath}...`);

      if (target.mobile || target.action) {
        await captureWithCdp(chrome, url, target, outPath);
      } else {
        execFileSync(
          chrome,
          [
            '--headless=new',
            '--hide-scrollbars',
            '--disable-gpu',
            `--window-size=${target.width},${target.height}`,
            '--virtual-time-budget=2000',
            `--screenshot=${outPath}`,
            url,
          ],
          { stdio: 'ignore' },
        );
      }

      if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
        throw new Error(`Failed to generate screenshot at ${outPath}`);
      }
      console.log(`Saved ${target.name}.png (${fs.statSync(outPath).size} bytes)`);
    }

    console.log('\nVisual screenshots generated successfully:');
    console.log(`  Desktop: ${path.join(OUT_DIR, 'desktop.png')}`);
    console.log(`  Mobile:  ${path.join(OUT_DIR, 'mobile.png')}`);
  } finally {
    if (devServer) {
      console.log('Shutting down dev server...');
      devServer.kill('SIGTERM');
    }
  }
}

main().catch((err) => {
  console.error('Error taking screenshots:', err);
  process.exit(1);
});
