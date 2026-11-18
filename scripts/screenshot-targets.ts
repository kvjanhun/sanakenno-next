export interface ScreenshotTarget {
  name: string;
  width: number;
  height: number;
  mobile: boolean;
  action?: string;
}

export interface TargetEvalStep {
  expression: string;
  awaitPromise: boolean;
  delayAfterMs?: number;
}

const desk = (name: string, action?: string): ScreenshotTarget => ({
  name,
  width: 1280,
  height: 800,
  mobile: false,
  action,
});

const mob = (name: string, action?: string): ScreenshotTarget => ({
  name,
  width: 390,
  height: 844,
  mobile: true,
  action,
});

export const BASELINE_TARGET_NAMES = new Set([
  'desktop',
  'desktop-light',
  'mobile',
  'mobile-light',
]);

export const SCREENSHOT_TARGETS: readonly ScreenshotTarget[] = [
  desk('desktop'),
  desk('desktop-light', 'theme-light'),
  desk('desktop-matrix', 'unlock-matrix'),
  desk('desktop-clues-open', 'view-clues-open'),
  desk('desktop-archive', 'view-archive'),
  desk('desktop-stats-achievements', 'view-stats-achievements'),
  desk('desktop-stats-summary', 'view-stats-summary'),
  desk('desktop-settings', 'view-settings'),
  desk('desktop-sync', 'view-sync'),
  desk('desktop-rules', 'view-rules'),
  desk('desktop-announcement-achievement', 'view-announcement-achievement'),
  mob('mobile'),
  mob('mobile-light', 'theme-light'),
  mob('mobile-matrix', 'unlock-matrix'),
  mob('mobile-archive', 'view-archive'),
  mob('mobile-archive-light', 'view-archive-light'),
  mob('mobile-stats-achievements', 'view-stats-achievements'),
  mob('mobile-stats-achievements-light', 'view-stats-achievements-light'),
  mob('mobile-stats-achievements-bottom', 'view-stats-achievements-bottom'),
  mob('mobile-stats-achievements-light-bottom', 'view-stats-achievements-light-bottom'),
  mob('mobile-stats-summary', 'view-stats-summary'),
  mob('mobile-settings', 'view-settings'),
  mob('mobile-settings-light', 'view-settings-light'),
  mob('mobile-sync', 'view-sync'),
  mob('mobile-sync-light', 'view-sync-light'),
  mob('mobile-rules', 'view-rules'),
  mob('mobile-rules-light', 'view-rules-light'),
  mob('mobile-clues-closed', 'view-clues-closed'),
  mob('mobile-clues-open', 'view-clues-open'),
  mob('mobile-clues-typed', 'view-clues-open-typed'),
  mob('mobile-announcement-letter', 'view-announcement-letter'),
  mob('mobile-announcement-milestone', 'view-announcement-milestone'),
  mob('mobile-announcement-achievement-light', 'view-announcement-achievement-light'),
];

export function selectScreenshotTargets(rawArgs: readonly string[] = []): ScreenshotTarget[] {
  const tokens = rawArgs
    .flatMap((arg) => arg.replace(/^--(?:only|targets)=/i, '').split(','))
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && s !== '--');

  if (tokens.length === 0) {
    return SCREENSHOT_TARGETS.filter((t) => BASELINE_TARGET_NAMES.has(t.name));
  }
  if (tokens.includes('all')) {
    return [...SCREENSHOT_TARGETS];
  }
  return SCREENSHOT_TARGETS.filter(
    (t) =>
      t.name === 'desktop' ||
      t.name === 'mobile' ||
      tokens.some(
        (tok) => t.name.toLowerCase().includes(tok) || t.action?.toLowerCase().includes(tok),
      ),
  );
}

function buildSampleStatsScript(): string {
  return `
    const sampleRecords = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      sampleRecords.push({
        puzzle_number: i + 1, date: dateStr, best_rank: 'Onnistuja', best_score: 80, max_score: 100,
        words_found: i === 0 ? 600 : 0, pangrams_found: i === 0 ? 80 : 0, long_words_count: i === 0 ? 110 : 0,
        hints_used: 1, elapsed_ms: 60000, is_daily: true, played_at_date: dateStr,
      });
    }
    for (let i = 0; i < 50; i++) {
      sampleRecords.push({
        puzzle_number: 100 + i, date: '2026-10-01', best_rank: 'Täysi kenno', best_score: 100, max_score: 100,
        words_found: 0, hints_used: 1, elapsed_ms: 60000, is_daily: false, played_at_date: '2026-10-01',
      });
    }
    window.localStorage.setItem('sanakenno_player_stats', JSON.stringify({ version: 1, records: sampleRecords }));
  `;
}

export function isLightVariantAction(action?: string): boolean {
  return action === 'theme-light' || Boolean(action?.includes('light'));
}

function openDialogScript(ariaLabel: string, extraAfterOpen = ''): string {
  return `(async () => {
    document.querySelector('button[aria-label="${ariaLabel}"]')?.click();
    for (let i = 0; i < 20; i++) {
      if (document.querySelector('[role="dialog"]')) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    ${extraAfterOpen}
  })()`;
}

export function buildTargetActionSteps(action?: string): TargetEvalStep[] {
  if (!action) return [];
  const steps: TargetEvalStep[] = [];

  if (isLightVariantAction(action)) {
    steps.push({
      expression: `document.documentElement.setAttribute('data-theme', 'light')`,
      awaitPromise: false,
      delayAfterMs: 150,
    });
  }

  if (action === 'unlock-matrix') {
    steps.push({
      expression: `(async () => {
        document.querySelector('[data-testid="show-hints-button"]')?.click();
        await new Promise((r) => setTimeout(r, 100));
        document.querySelector('[data-testid="activate-hints-button"]')?.click();
        await new Promise((r) => setTimeout(r, 200));
        document.querySelector('[data-testid="upgrade-tier-button"]')?.click();
      })()`,
      awaitPromise: true,
      delayAfterMs: 400,
    });
  } else if (action === 'view-clues-closed') {
    steps.push({
      expression: `(async () => {
        document.querySelector('[data-testid="show-hints-button"]')?.click();
        await new Promise((r) => setTimeout(r, 100));
        document.querySelector('[data-testid="tier-tab-2"]')?.click();
      })()`,
      awaitPromise: true,
      delayAfterMs: 400,
    });
  } else if (action === 'view-clues-open' || action === 'view-clues-open-typed') {
    steps.push({
      expression: `(async () => {
        document.querySelector('[data-testid="show-hints-button"]')?.click();
        await new Promise((r) => setTimeout(r, 100));
        document.querySelector('[data-testid="tier-tab-2"]')?.click();
        await new Promise((r) => setTimeout(r, 150));
        document.querySelector('[data-testid="unlock-pangrams-button"]')?.click();
        await new Promise((r) => setTimeout(r, 100));
        document.querySelector('[data-testid="unlock-pairs-button"]')?.click();
        await new Promise((r) => setTimeout(r, 100));
        document.querySelector('[data-testid="unlock-suffixes-button"]')?.click();
      })()`,
      awaitPromise: true,
      delayAfterMs: 400,
    });
    if (action === 'view-clues-open-typed') {
      steps.push({
        expression: `(() => {
          for (const char of 'huppu') {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: char, code: 'Key' + char.toUpperCase() }));
          }
        })()`,
        awaitPromise: false,
        delayAfterMs: 300,
      });
    }
  } else if (action.startsWith('view-archive')) {
    steps.push({ expression: openDialogScript('Arkisto'), awaitPromise: true, delayAfterMs: 400 });
  } else if (action.startsWith('view-settings')) {
    steps.push({
      expression: openDialogScript('Asetukset'),
      awaitPromise: true,
      delayAfterMs: 400,
    });
  } else if (action.startsWith('view-rules')) {
    steps.push({ expression: openDialogScript('Säännöt'), awaitPromise: true, delayAfterMs: 400 });
  } else if (action.startsWith('view-sync')) {
    const openSyncFromSettings = `
      const syncBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Hallitse synkronointia'));
      syncBtn?.click();
      for (let i = 0; i < 20; i++) {
        if (document.getElementById('sync-modal-title')) break;
        await new Promise((r) => setTimeout(r, 100));
      }
    `;
    steps.push({
      expression: openDialogScript('Asetukset', openSyncFromSettings),
      awaitPromise: true,
      delayAfterMs: 400,
    });
  } else if (action.startsWith('view-stats')) {
    const clickAch = action.includes('achievements')
      ? `Array.from(document.querySelectorAll('button[role="tab"]')).find((b) => b.textContent?.includes('Saavutukset'))?.click();`
      : '';
    const scrollBottom = action.includes('bottom')
      ? `await new Promise((r) => setTimeout(r, 100));
         const sc = document.querySelector('.overflow-y-auto');
         if (sc) sc.scrollTop = sc.scrollHeight;`
      : '';
    steps.push({
      expression: `(async () => {
        ${buildSampleStatsScript()}
        await (${openDialogScript('Tilastot', `${clickAch}\n${scrollBottom}`)});
      })()`,
      awaitPromise: true,
      delayAfterMs: 400,
    });
  } else if (action.startsWith('view-announcement')) {
    const cmds: Record<string, string> = {
      achievement: `window.sanakennoAnnounce?.('achievement', 'total_words', 'gold')`,
      milestone: `window.sanakennoAnnounce?.('milestone', 50)`,
      letter: `window.sanakennoAnnounce?.('letter', 'K', 7)`,
    };
    const key = Object.keys(cmds).find((k) => action.includes(k)) ?? 'letter';
    steps.push({ expression: cmds[key] ?? cmds.letter!, awaitPromise: false, delayAfterMs: 350 });
  }

  return steps;
}
