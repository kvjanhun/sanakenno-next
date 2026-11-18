import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildTargetActionSteps,
  isLightVariantAction,
  SCREENSHOT_TARGETS,
  selectScreenshotTargets,
} from '../../scripts/screenshot-targets.js';

const ROOT = path.resolve(import.meta.dirname, '../..');

describe('Screenshot Targets & Runner Decomposition (Spec 28)', () => {
  it('includes baseline desktop (1280x800) and mobile (390x844) targets with light/dark variants', () => {
    const desktop = SCREENSHOT_TARGETS.find((t) => t.name === 'desktop');
    const desktopLight = SCREENSHOT_TARGETS.find((t) => t.name === 'desktop-light');
    const mobile = SCREENSHOT_TARGETS.find((t) => t.name === 'mobile');
    const mobileLight = SCREENSHOT_TARGETS.find((t) => t.name === 'mobile-light');

    expect(desktop).toMatchObject({ width: 1280, height: 800, mobile: false });
    expect(desktopLight).toMatchObject({
      width: 1280,
      height: 800,
      mobile: false,
      action: 'theme-light',
    });
    expect(mobile).toMatchObject({ width: 390, height: 844, mobile: true });
    expect(mobileLight).toMatchObject({
      width: 390,
      height: 844,
      mobile: true,
      action: 'theme-light',
    });

    expect(isLightVariantAction(desktop?.action)).toBe(false);
    expect(isLightVariantAction(desktopLight?.action)).toBe(true);
    expect(isLightVariantAction(mobile?.action)).toBe(false);
    expect(isLightVariantAction(mobileLight?.action)).toBe(true);
  });

  it('guarantees unique output filenames across all screenshot targets', () => {
    const names = SCREENSHOT_TARGETS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('selects baseline targets by default, filters modal/area targets on demand, and supports all', () => {
    const baseline = selectScreenshotTargets([]);
    expect(baseline.map((t) => t.name)).toEqual([
      'desktop',
      'desktop-light',
      'mobile',
      'mobile-light',
    ]);

    const settingsAndSync = selectScreenshotTargets(['settings', 'sync']);
    expect(settingsAndSync.map((t) => t.name)).toEqual([
      'desktop',
      'desktop-settings',
      'desktop-sync',
      'mobile',
      'mobile-settings',
      'mobile-settings-light',
      'mobile-sync',
      'mobile-sync-light',
    ]);

    const rulesOnly = selectScreenshotTargets(['--only=rules']);
    expect(rulesOnly.map((t) => t.name)).toEqual([
      'desktop',
      'desktop-rules',
      'mobile',
      'mobile-rules',
      'mobile-rules-light',
    ]);

    expect(selectScreenshotTargets(['all'])).toHaveLength(SCREENSHOT_TARGETS.length);
  });

  it('builds evaluation steps for interactive targets and keeps runner scripts under 250 lines', () => {
    expect(buildTargetActionSteps(undefined)).toEqual([]);
    expect(buildTargetActionSteps('view-clues-open-typed')).toHaveLength(2);
    expect(buildTargetActionSteps('view-archive-light')).toHaveLength(2);
    expect(buildTargetActionSteps('view-settings')).toHaveLength(1);
    expect(buildTargetActionSteps('view-sync-light')).toHaveLength(2);
    expect(buildTargetActionSteps('view-rules')).toHaveLength(1);

    const runnerLines = fs
      .readFileSync(path.join(ROOT, 'scripts/screenshot.ts'), 'utf8')
      .split('\n').length;
    const targetsLines = fs
      .readFileSync(path.join(ROOT, 'scripts/screenshot-targets.ts'), 'utf8')
      .split('\n').length;

    expect(runnerLines).toBeLessThan(250);
    expect(targetsLines).toBeLessThan(250);
  });
});
