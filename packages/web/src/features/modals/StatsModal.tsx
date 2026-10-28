import { useEffect, useState } from 'react';
import {
  bestNoHintScoreForRecord,
  computeAverageCompletion,
  computeLifetimeNoHintStats,
  computeLifetimeStats,
  computeRankDistribution,
  computeStreak,
  emptyStats,
  RANKS,
  STATS_STORAGE_KEY,
  type PlayerStats,
} from '@sanakenno/shared';
import { ShareIcon } from '../gameplay/icons.js';
import { loadFromStorage, puzzleStateKey } from '../gameplay/storage.js';
import { useGameStore } from '../gameplay/useGameStore.js';
import { useUiStore } from '../gameplay/useUiStore.js';
import { ModalShell } from './ModalShell.js';

interface StoredPuzzleState {
  score?: number;
  hintsUnlocked?: string[];
  scoreBeforeHints?: number | null;
}

function savedNoHintScore(puzzleNumber: number): number {
  const state = loadFromStorage<StoredPuzzleState>(puzzleStateKey(puzzleNumber));
  if (!state) return 0;
  if (typeof state.scoreBeforeHints === 'number') return state.scoreBeforeHints;
  if ((state.hintsUnlocked ?? []).length === 0 && typeof state.score === 'number') {
    return state.score;
  }
  return 0;
}

/** Backfill best no-hint score from legacy records and saved puzzle state. */
export function backfillNoHintStats(stats: PlayerStats): PlayerStats {
  return {
    ...stats,
    records: stats.records.map((record) => ({
      ...record,
      best_no_hint_score: Math.max(
        bestNoHintScoreForRecord(record),
        savedNoHintScore(record.puzzle_number),
      ),
    })),
  };
}

export interface StatsModalProps {
  show: boolean;
  onClose: () => void;
  onShare?: () => void;
  shareCopied?: boolean;
}

/**
 * Player statistics modal rendering lifetime stats, current/best streak,
 * rank distribution, no-hint achievement stats, and share action.
 */
export function StatsModal({
  show,
  onClose,
  onShare,
  shareCopied: propShareCopied,
}: StatsModalProps): React.JSX.Element {
  const [stats, setStats] = useState<PlayerStats>(emptyStats());
  const storeShareCopied = useUiStore((s) => s.shareCopied);
  const hasPuzzle = useGameStore((s) => s.puzzle !== null);
  const shareCopied = propShareCopied !== undefined ? propShareCopied : storeShareCopied;

  useEffect(() => {
    if (show) {
      const loaded = loadFromStorage<PlayerStats>(STATS_STORAGE_KEY);
      setStats(backfillNoHintStats(loaded ?? emptyStats()));
    }
  }, [show]);

  const { records } = stats;
  const { current: currentStreak, best: bestStreak } = computeStreak(records);
  const rankDist = computeRankDistribution(records);
  const avgCompletion = computeAverageCompletion(records);
  const lifetime = computeLifetimeStats(records);
  const noHintLifetime = computeLifetimeNoHintStats(records);
  const maxCount = Math.max(1, ...Object.values(rankDist));

  const ranksLowestFirst = [...RANKS].reverse();

  const handleShareClick = () => {
    if (onShare) {
      onShare();
    } else {
      void useGameStore.getState().copyStatus();
    }
  };

  return (
    <ModalShell show={show} title="Tilastot" titleId="stats-title" onClose={onClose}>
      {records.length === 0 ? (
        <div className="text-sm py-4 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
          Ei vielä tilastoja. Pelaa kenno!
        </div>
      ) : (
        <div className="space-y-4">
          <section
            data-stats-section="all-games"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderRadius: '0.75rem',
              padding: '1rem',
            }}
          >
            <div
              className="text-xs font-semibold tracking-wide uppercase mb-3"
              data-stats-heading="all-games"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Kaikki pelit
            </div>

            <div className="space-y-1.5" data-stats-all-summary>
              <div className="flex items-center justify-between text-xs py-0.5">
                <span style={{ color: 'var(--color-text-secondary)' }}>Pelattuja pelejä</span>
                <span
                  className="font-semibold font-mono"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {records.length}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-0.5">
                <span style={{ color: 'var(--color-text-secondary)' }}>Putki</span>
                <span
                  className="font-semibold font-mono"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {currentStreak}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-0.5">
                <span style={{ color: 'var(--color-text-secondary)' }}>Pisin putki</span>
                <span
                  className="font-semibold font-mono"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {bestStreak}
                </span>
              </div>
            </div>

            <div className="mt-1.5 space-y-1.5" data-stats-all-totals>
              <div className="flex items-center justify-between text-xs py-0.5">
                <span style={{ color: 'var(--color-text-secondary)' }}>Sanoja löydetty</span>
                <span
                  className="font-semibold font-mono"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {lifetime.totalWords}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-0.5">
                <span style={{ color: 'var(--color-text-secondary)' }}>Pangrammeja löydetty</span>
                <span
                  className="font-semibold font-mono"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {lifetime.totalPangrams}
                </span>
              </div>
              <div className="flex items-start justify-between text-xs py-0.5 gap-4">
                <span style={{ color: 'var(--color-text-secondary)' }} className="shrink-0">
                  Pisin sana
                </span>
                <span
                  className="font-semibold text-right break-all"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {lifetime.longestWord || '—'}
                </span>
              </div>
            </div>

            <div className="my-3.5" style={{ borderTop: '1px solid var(--color-border)' }} />

            <div data-stats-all-average className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <span
                  className="text-xs font-medium"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Keskimääräinen tulos
                </span>
                <span
                  className="text-xs font-semibold font-mono"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {avgCompletion.toFixed(0)} %
                </span>
              </div>
              <div
                className="h-2 w-full rounded-full overflow-hidden"
                style={{
                  backgroundColor: 'var(--color-bg-tertiary, var(--color-bg-primary))',
                }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, avgCompletion)}%`,
                    backgroundColor: 'var(--color-accent)',
                  }}
                />
              </div>
            </div>

            <div data-stats-all-ranks className="mt-4">
              <div
                className="text-xs font-semibold tracking-wide uppercase mb-2.5"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Saavutetut tasot
              </div>
              <div className="space-y-2">
                {ranksLowestFirst.map((rank) => {
                  const count = rankDist[rank.name] || 0;
                  const pct = (count / maxCount) * 100;
                  return (
                    <div key={rank.name} className="flex items-center gap-2 text-xs">
                      <span
                        className="w-24 shrink-0 truncate"
                        style={{ color: 'var(--color-text-secondary)' }}
                        title={rank.name}
                      >
                        {rank.name}
                      </span>
                      <div
                        className="flex-1 min-w-0 h-2 rounded-full overflow-hidden"
                        style={{
                          backgroundColor: 'var(--color-bg-tertiary, var(--color-bg-primary))',
                        }}
                      >
                        {count > 0 && (
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: 'var(--color-accent)',
                            }}
                          />
                        )}
                      </div>
                      <span
                        className="w-5 text-right shrink-0 font-medium font-mono"
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        {count || ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section
            data-stats-section="no-hint"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderRadius: '0.75rem',
              padding: '1rem',
            }}
          >
            <div
              className="text-xs font-semibold tracking-wide uppercase mb-3"
              data-stats-heading="no-hint"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Ilman apuja
            </div>

            <div className="space-y-1.5" data-stats-no-hint-summary>
              <div className="flex items-center justify-between text-xs py-0.5">
                <span style={{ color: 'var(--color-text-secondary)' }}>Paras tulos</span>
                <span
                  className="font-semibold font-mono"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {noHintLifetime.highestPercentage.toFixed(0)} %
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-0.5">
                <span style={{ color: 'var(--color-text-secondary)' }}>Ällistyttäviä pelejä</span>
                <span
                  className="font-semibold font-mono"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {noHintLifetime.topTierCount}
                </span>
              </div>
            </div>
          </section>

          {(hasPuzzle || onShare !== undefined) && (
            <button
              type="button"
              onClick={handleShareClick}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-sm cursor-pointer border-none"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-on-accent)',
              }}
            >
              <ShareIcon size={16} strokeWidth={2.5} />
              <span>{shareCopied ? 'Kopioitu!' : 'Jaa tulos'}</span>
            </button>
          )}
        </div>
      )}
    </ModalShell>
  );
}
