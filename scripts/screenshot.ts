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
      { name: 'desktop', width: 1280, height: 800 },
      { name: 'mobile', width: 390, height: 844 },
    ];

    for (const target of targets) {
      const outPath = path.join(OUT_DIR, `${target.name}.png`);
      console.log(`Capturing ${target.name} (${target.width}x${target.height}) to ${outPath}...`);

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
