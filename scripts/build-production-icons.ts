import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC = path.join(ROOT, 'packages', 'web', 'public');
const ICONS = path.join(PUBLIC, 'icons');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MAGICK = '/opt/homebrew/bin/magick';

// Math paths (Option C)
const pTL = `M 25.55 10.20 Q 28.58 8.45 31.61 10.20 L 45.47 18.20 Q 48.50 19.95 48.50 23.45 L 48.50 39.45 Q 48.50 42.95 45.47 44.70 L 31.61 52.70 Q 28.58 54.45 25.55 52.70 L 11.69 44.70 Q 8.66 42.95 8.66 39.45 L 8.66 23.45 Q 8.66 19.95 11.69 18.20 Z`;
const pTR = `M 68.39 10.20 Q 71.42 8.45 74.45 10.20 L 88.31 18.20 Q 91.34 19.95 91.34 23.45 L 91.34 39.45 Q 91.34 42.95 88.31 44.70 L 74.45 52.70 Q 71.42 54.45 68.39 52.70 L 54.53 44.70 Q 51.50 42.95 51.50 39.45 L 51.50 23.45 Q 51.50 19.95 54.53 18.20 Z`;
const pBot = `M 46.97 47.30 Q 50.00 45.55 53.03 47.30 L 66.89 55.30 Q 69.92 57.05 69.92 60.55 L 69.92 76.55 Q 69.92 80.05 66.89 81.80 L 53.03 89.80 Q 50.00 91.55 46.97 89.80 L 33.11 81.80 Q 30.08 80.05 30.08 76.55 L 30.08 60.55 Q 30.08 57.05 33.11 55.30 Z`;

function roundedHexPath(cx: number, cy: number, r: number, cr: number): string {
  const angles = [270, 330, 30, 90, 150, 210];
  const pts = angles.map((a) => {
    const rad = (a * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  });

  let d = '';
  for (let i = 0; i < 6; i++) {
    const prev = pts[(i + 5) % 6]!;
    const curr = pts[i]!;
    const next = pts[(i + 1) % 6]!;
    const v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
    const len1 = Math.hypot(v1.x, v1.y);
    const u1 = { x: v1.x / len1, y: v1.y / len1 };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };
    const len2 = Math.hypot(v2.x, v2.y);
    const u2 = { x: v2.x / len2, y: v2.y / len2 };
    const pStart = { x: curr.x + u1.x * cr, y: curr.y + u1.y * cr };
    const pEnd = { x: curr.x + u2.x * cr, y: curr.y + u2.y * cr };
    if (i === 0) d += `M ${pStart.x.toFixed(2)} ${pStart.y.toFixed(2)} `;
    else d += `L ${pStart.x.toFixed(2)} ${pStart.y.toFixed(2)} `;
    d += `Q ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} ${pEnd.x.toFixed(2)} ${pEnd.y.toFixed(2)} `;
  }
  d += 'Z';
  return d;
}

const tlCenter = { x: 28.58, y: 31.45 };
const trCenter = { x: 71.42, y: 31.45 };
const botCenter = { x: 50.0, y: 68.55 };

const pTL_inner = roundedHexPath(tlCenter.x, tlCenter.y - 0.4, 21.6, 3.0);
const pTR_inner = roundedHexPath(trCenter.x, trCenter.y - 0.4, 21.6, 3.0);
const pBot_inner = roundedHexPath(botCenter.x, botCenter.y - 0.4, 21.6, 3.0);

const ORANGE_HIGHLIGHT_STROKE = '#FFA57A';
const ORANGE_HIGHLIGHT_OPACITY = 0.55;

// SVG 1: Standalone Vector Mark
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <defs>
    <linearGradient id="sk-neutral-base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E5E5E8"/>
    </linearGradient>
    <linearGradient id="sk-orange-base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FF7A52"/>
      <stop offset="100%" stop-color="#E8441A"/>
    </linearGradient>
    <filter id="sk-tile-shadow" x="-20%" y="-15%" width="140%" height="145%">
      <feDropShadow dx="0" dy="2.0" stdDeviation="1.8" flood-color="#000000" flood-opacity="0.15"/>
    </filter>
  </defs>

  <g filter="url(#sk-tile-shadow)">
    <!-- Top-Left Neutral Hex -->
    <g id="hex-top-left">
      <path d="${pTL}" fill="#C4C4C8" transform="translate(0, 1.3)"/>
      <path d="${pTL}" fill="url(#sk-neutral-base)" stroke="#D8D8DC" stroke-width="1.0"/>
      <path d="${pTL_inner}" fill="none" stroke="#FFFFFF" stroke-opacity="0.85" stroke-width="0.9"/>
    </g>

    <!-- Bottom Neutral Hex -->
    <g id="hex-bottom">
      <path d="${pBot}" fill="#C4C4C8" transform="translate(0, 1.3)"/>
      <path d="${pBot}" fill="url(#sk-neutral-base)" stroke="#D8D8DC" stroke-width="1.0"/>
      <path d="${pBot_inner}" fill="none" stroke="#FFFFFF" stroke-opacity="0.85" stroke-width="0.9"/>
    </g>

    <!-- Top-Right Hero Orange Hex (Option C) -->
    <g id="hex-top-right">
      <path d="${pTR}" fill="#B83010" transform="translate(0, 1.5)"/>
      <path d="${pTR}" fill="url(#sk-orange-base)" stroke="#DE441B" stroke-width="0.8"/>
      <path d="${pTR_inner}" fill="none" stroke="${ORANGE_HIGHLIGHT_STROKE}" stroke-opacity="${ORANGE_HIGHLIGHT_OPACITY}" stroke-width="0.9"/>
    </g>
  </g>
</svg>
`;

// SVG 2: PWA App Launcher / App Icon Master (512x512) - clean dark background, no blurry circle
const appIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="sk-app-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#24262B"/>
      <stop offset="50%" stop-color="#1B1C20"/>
      <stop offset="100%" stop-color="#121316"/>
    </linearGradient>

    <linearGradient id="sk-app-neutral" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E5E5E8"/>
    </linearGradient>

    <linearGradient id="sk-app-orange" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FF7A52"/>
      <stop offset="100%" stop-color="#E8441A"/>
    </linearGradient>

    <filter id="sk-app-tile-shadow" x="-30%" y="-25%" width="160%" height="165%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.45"/>
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.25"/>
    </filter>
  </defs>

  <!-- iOS / macOS Squircle Base (22% radius = 112px on 512px) -->
  <rect x="0" y="0" width="512" height="512" rx="112" fill="url(#sk-app-bg)"/>

  <!-- Clean precision border rim with subtle warm orange hint -->
  <rect x="1" y="1" width="510" height="510" rx="111" fill="none" stroke="#FF643E" stroke-opacity="0.22" stroke-width="2"/>
  <rect x="2" y="2" width="508" height="508" rx="110" fill="none" stroke="#FFFFFF" stroke-opacity="0.08" stroke-width="1.5"/>

  <!-- Centered Style 2 Triad Mark -->
  <g transform="translate(76, 76) scale(3.6)" filter="url(#sk-app-tile-shadow)">
    <g>
      <path d="${pTL}" fill="#B4B4B8" transform="translate(0, 1.4)"/>
      <path d="${pTL}" fill="url(#sk-app-neutral)" stroke="#D8D8DC" stroke-width="0.8"/>
      <path d="${pTL_inner}" fill="none" stroke="#FFFFFF" stroke-opacity="0.85" stroke-width="0.8"/>
    </g>
    <g>
      <path d="${pBot}" fill="#B4B4B8" transform="translate(0, 1.4)"/>
      <path d="${pBot}" fill="url(#sk-app-neutral)" stroke="#D8D8DC" stroke-width="0.8"/>
      <path d="${pBot_inner}" fill="none" stroke="#FFFFFF" stroke-opacity="0.85" stroke-width="0.8"/>
    </g>
    <g>
      <path d="${pTR}" fill="#A02808" transform="translate(0, 1.6)"/>
      <path d="${pTR}" fill="url(#sk-app-orange)" stroke="#D84018" stroke-width="0.6"/>
      <path d="${pTR_inner}" fill="none" stroke="${ORANGE_HIGHLIGHT_STROKE}" stroke-opacity="${ORANGE_HIGHLIGHT_OPACITY}" stroke-width="0.8"/>
    </g>
  </g>
</svg>
`;

// SVG 3: Full-Bleed Maskable SVG - clean solid dark background, zero faded circles
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="sk-mask-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#24262B"/>
      <stop offset="50%" stop-color="#1B1C20"/>
      <stop offset="100%" stop-color="#121316"/>
    </linearGradient>
    <linearGradient id="sk-app-neutral" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E5E5E8"/>
    </linearGradient>
    <linearGradient id="sk-app-orange" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FF7A52"/>
      <stop offset="100%" stop-color="#E8441A"/>
    </linearGradient>
    <filter id="sk-mask-shadow" x="-30%" y="-25%" width="160%" height="165%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
  </defs>

  <!-- Full-bleed background with clean smooth gradient, zero artifacts -->
  <rect x="0" y="0" width="512" height="512" fill="url(#sk-mask-bg)"/>

  <!-- Centered triad within 80% safe zone -->
  <g transform="translate(106, 106) scale(3.0)" filter="url(#sk-mask-shadow)">
    <g>
      <path d="${pTL}" fill="#B4B4B8" transform="translate(0, 1.4)"/>
      <path d="${pTL}" fill="url(#sk-app-neutral)" stroke="#D8D8DC" stroke-width="0.8"/>
      <path d="${pTL_inner}" fill="none" stroke="#FFFFFF" stroke-opacity="0.85" stroke-width="0.8"/>
    </g>
    <g>
      <path d="${pBot}" fill="#B4B4B8" transform="translate(0, 1.4)"/>
      <path d="${pBot}" fill="url(#sk-app-neutral)" stroke="#D8D8DC" stroke-width="0.8"/>
      <path d="${pBot_inner}" fill="none" stroke="#FFFFFF" stroke-opacity="0.85" stroke-width="0.8"/>
    </g>
    <g>
      <path d="${pTR}" fill="#A02808" transform="translate(0, 1.6)"/>
      <path d="${pTR}" fill="url(#sk-app-orange)" stroke="#D84018" stroke-width="0.6"/>
      <path d="${pTR_inner}" fill="none" stroke="${ORANGE_HIGHLIGHT_STROKE}" stroke-opacity="${ORANGE_HIGHLIGHT_OPACITY}" stroke-width="0.8"/>
    </g>
  </g>
</svg>
`;

// Save SVG files
fs.writeFileSync(path.join(ICONS, 'favicon.svg'), markSvg, 'utf-8');
fs.writeFileSync(path.join(ICONS, 'sanakenno-mark.svg'), markSvg, 'utf-8');
fs.writeFileSync(path.join(ICONS, 'sanakenno-app-icon.svg'), appIconSvg, 'utf-8');

const appIconSvgPath = path.join(ICONS, 'sanakenno-app-icon.svg');
const maskableSvgPath = path.join(ICONS, 'sanakenno-maskable.svg');
fs.writeFileSync(maskableSvgPath, maskableSvg, 'utf-8');

function chromeRenderSvg(inputPath: string, outputPath: string, size: number) {
  const tmpHtml = path.join(ROOT, `tmp_render_${size}.html`);
  const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${size}px; height: ${size}px; overflow: hidden; background: transparent; }
    img { width: 100%; height: 100%; display: block; }
  </style>
</head>
<body>
  <img src="file://${inputPath}" />
</body>
</html>`;
  fs.writeFileSync(tmpHtml, html, 'utf-8');

  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${outputPath}`,
    `file://${tmpHtml}`,
  ]);

  fs.unlinkSync(tmpHtml);
  console.log(`Rendered ${path.basename(outputPath)} via Chrome (${size}x${size})`);
}

// 1. Render App Icon 512 & Maskable 512
const out512 = path.join(ICONS, 'sanakenno-512x512.png');
chromeRenderSvg(appIconSvgPath, out512, 512);

const outMaskable = path.join(ICONS, 'sanakenno-maskable-512x512.png');
chromeRenderSvg(maskableSvgPath, outMaskable, 512);
fs.unlinkSync(maskableSvgPath);

// 2. Downsample
function sipsResize(inputPng: string, outputPng: string, size: number) {
  execFileSync('/usr/bin/sips', ['-z', `${size}`, `${size}`, inputPng, '--out', outputPng]);
  console.log(`Resized ${path.basename(outputPng)} to ${size}x${size}`);
}

sipsResize(out512, path.join(ICONS, 'sanakenno-192x192.png'), 192);

// Apple Touch Icons
const apple180 = path.join(ICONS, 'apple-touch-icon.png');
sipsResize(out512, apple180, 180);

fs.copyFileSync(apple180, path.join(PUBLIC, 'apple-touch-icon.png'));
fs.copyFileSync(apple180, path.join(PUBLIC, 'apple-touch-icon-precomposed.png'));
fs.copyFileSync(apple180, path.join(PUBLIC, 'apple-touch-icon-180x180.png'));
fs.copyFileSync(apple180, path.join(PUBLIC, 'apple-touch-icon-180x180-precomposed.png'));

sipsResize(out512, path.join(PUBLIC, 'apple-touch-icon-152x152.png'), 152);
fs.copyFileSync(
  path.join(PUBLIC, 'apple-touch-icon-152x152.png'),
  path.join(PUBLIC, 'apple-touch-icon-152x152-precomposed.png'),
);

sipsResize(out512, path.join(PUBLIC, 'apple-touch-icon-120x120.png'), 120);
fs.copyFileSync(
  path.join(PUBLIC, 'apple-touch-icon-120x120.png'),
  path.join(PUBLIC, 'apple-touch-icon-120x120-precomposed.png'),
);

// 3. Multi-res ICO
const markSvgPath = path.join(ICONS, 'favicon.svg');
const tmp16 = path.join(ROOT, 'tmp_16.png');
const tmp32 = path.join(ROOT, 'tmp_32.png');
const tmp48 = path.join(ROOT, 'tmp_48.png');

chromeRenderSvg(markSvgPath, tmp48, 48);
sipsResize(tmp48, tmp32, 32);
sipsResize(tmp48, tmp16, 16);

const icoPath = path.join(PUBLIC, 'favicon.ico');
execFileSync(MAGICK, [tmp16, tmp32, tmp48, icoPath]);
console.log('Generated multi-resolution favicon.ico');

fs.unlinkSync(tmp16);
fs.unlinkSync(tmp32);
fs.unlinkSync(tmp48);

console.log('Production build completed cleanly without any circular halo artifact!');
