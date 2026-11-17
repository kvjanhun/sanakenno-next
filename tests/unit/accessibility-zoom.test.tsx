import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SyncModal } from '../../packages/web/src/features/player-sync/SyncModal.js';
import { useAuthStore } from '../../packages/web/src/features/player-sync/useAuthStore.js';

const ROOT = path.resolve(__dirname, '../..');

describe('Zoom accessibility and mobile input typography', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      isLoggedIn: true,
      playerId: 1,
      sessionCount: 1,
      playerKey: 'a'.repeat(64),
    });
  });

  it('enables pinch-to-zoom in index.html without user-scalable=no or maximum-scale=1.0', () => {
    const html = fs.readFileSync(path.join(ROOT, 'packages/web/index.html'), 'utf8');
    const viewportMatch = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/i);
    expect(viewportMatch).not.toBeNull();
    const content = viewportMatch![1]!;
    expect(content).not.toContain('user-scalable=no');
    expect(content).not.toContain('maximum-scale=1.0');
    expect(content).toContain('width=device-width');
    expect(content).toContain('initial-scale=1.0');
    expect(content).toContain('viewport-fit=cover');
  });

  it('sets touch-action: manipulation on html and body in tokens.css while keeping honeycomb SVG touch-action: none', () => {
    const css = fs.readFileSync(path.join(ROOT, 'packages/web/src/styles/tokens.css'), 'utf8');
    expect(css).toMatch(/body\s*\{[^}]*touch-action:\s*manipulation;/s);
    expect(css).toMatch(/html\s*\{[^}]*touch-action:\s*manipulation;/s);

    const honeycombTsx = fs.readFileSync(
      path.join(ROOT, 'packages/web/src/features/gameplay/Honeycomb.tsx'),
      'utf8',
    );
    expect(honeycombTsx).toMatch(/touch-action:\s*none|touchAction:\s*['"]none['"]/);
  });

  it('uses text-base mobile font sizing on SyncModal inputs to avoid iOS Safari auto-zoom', () => {
    render(<SyncModal show={true} onClose={() => {}} />);

    const codeInput = screen.getByPlaceholderText('Esim. 123-456');
    expect(codeInput.className).toContain('text-base');

    fireEvent.click(screen.getByRole('button', { name: 'Lähetä sähköpostitse' }));
    const emailInput = screen.getByPlaceholderText('nimi@esimerkki.fi');
    expect(emailInput.className).toContain('text-base');
  });
});
