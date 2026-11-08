import { useEffect, useState } from 'react';
import {
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
import { loadFromStorage } from '../gameplay/storage.js';
import { useGameStore } from '../gameplay/useGameStore.js';
import { useUiStore } from '../gameplay/useUiStore.js';
import { AchievementsList } from './AchievementsList.js';
import { TrophyIcon } from './achievementIcons.js';
import { backfillNoHintStats } from './backfillStats.js';
import { ModalShell } from './ModalShell.js';

export { backfillNoHintStats };

export interface StatsModalProps {
  show: boolean;
  onClose: () => void;
  onShare?: () => void;
  shareCopied?: boolean;
}

/**
 * Player statistics modal rendering lifetime stats, current/best streak,
 * rank distribution, no-hint milestone stats, and share action.
 */
export function StatsModal({
  show,
  onClose,
  onShare,
  shareCopied: propShareCopied,
}: StatsModalProps): React.JSX.Element {
  const [stats, setStats] = useState<PlayerStats>(emptyStats());
  const [activeTab, setActiveTab] = useState<'summary' | 'achievements'>('summary');
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
    <ModalShell
      show={show}
      title="Tilastot"
      titleId="stats-title"
      onClose={onClose}
      subHeader={
        <div className="px-4 pt-2.5 pb-2.5">
          <div
            className="flex rounded-lg p-1 gap-1"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
            }}
            role="tablist"
            aria-label="Tilastojen välilehdet"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'summary'}
              onClick={() => setActiveTab('summary')}
              className="flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-all cursor-pointer border-none"
              style={{
                background: activeTab === 'summary' ? 'var(--color-bg-primary)' : 'transparent',
                color:
                  activeTab === 'summary'
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-secondary)',
                boxShadow:
                  activeTab === 'summary' ? '0 1px 3px var(--color-button-shadow)' : 'none',
              }}
            >
              Yhteenveto
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'achievements'}
              onClick={() => setActiveTab('achievements')}
              className="flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-all cursor-pointer border-none"
              style={{
                background:
                  activeTab === 'achievements' ? 'var(--color-bg-primary)' : 'transparent',
                color:
                  activeTab === 'achievements'
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-secondary)',
                boxShadow:
                  activeTab === 'achievements' ? '0 1px 3px var(--color-button-shadow)' : 'none',
              }}
            >
              Saavutukset
            </button>
          </div>
        </div>
      }
    >
      {activeTab === 'achievements' ? (
        <AchievementsList stats={stats} streak={{ current: currentStreak, best: bestStreak }} />
      ) : records.length === 0 ? (
        <div className="text-sm py-4 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
          Ei vielä tilastoja. Pelaa kenno!
        </div>
      ) : (
        <div className="flex flex-col gap-2 pb-0.5">
          {/* 1. KAIKKI PELIT — All-Games Master Card */}
          <div
            className="p-3 rounded-2xl flex flex-col gap-2 transition-all"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
            }}
            data-stats-section="all-games"
          >
            {/* Header: Trophy icon + KAIKKI PELIT + played games */}
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background:
                    'color-mix(in srgb, var(--color-accent) 18%, var(--color-bg-primary))',
                  color: 'var(--color-accent)',
                }}
              >
                <TrophyIcon size={16} strokeWidth={2.4} />
              </div>
              <div>
                <h3
                  className="text-xs font-bold uppercase tracking-wider m-0 leading-none"
                  data-stats-heading="all-games"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Kaikki pelit
                </h3>
                <p
                  className="text-[11px] m-0 mt-0.5 leading-none"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {records.length} {records.length === 1 ? 'pelattu peli' : 'pelattua peliä'}
                </p>
              </div>
            </div>

            {/* Compact 3-metric summary */}
            <div
              data-stats-all-summary
              className="grid grid-cols-3 gap-1 py-1.5 px-2 rounded-xl text-center"
              style={{
                background: 'color-mix(in srgb, var(--color-accent) 8%, var(--color-bg-primary))',
                border:
                  '1px solid color-mix(in srgb, var(--color-accent) 22%, var(--color-border))',
              }}
            >
              <div
                className="flex flex-col items-center"
                style={{
                  borderRight:
                    '1px solid color-mix(in srgb, var(--color-accent) 22%, var(--color-border))',
                }}
              >
                <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Pelattuja pelejä
                </span>
                <span
                  className="text-xs font-bold tabular-nums"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {records.length}
                </span>
              </div>
              <div
                className="flex flex-col items-center"
                style={{
                  borderRight:
                    '1px solid color-mix(in srgb, var(--color-accent) 22%, var(--color-border))',
                }}
              >
                <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Putki
                </span>
                <span
                  className="text-xs font-bold tabular-nums"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {currentStreak}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Pisin putki
                </span>
                <span
                  className="text-xs font-bold tabular-nums"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {bestStreak}
                </span>
              </div>
            </div>

            {/* Average completion track */}
            <div data-stats-all-average className="flex flex-col gap-1 pt-0.5">
              <div className="flex justify-between items-baseline text-[11px]">
                <span style={{ color: 'var(--color-text-secondary)' }}>Keskimääräinen tulos</span>
                <span className="font-bold tabular-nums" style={{ color: 'var(--color-accent)' }}>
                  {avgCompletion.toFixed(0)} %
                </span>
              </div>
              <div
                className="w-full rounded-full overflow-hidden border border-solid"
                style={{
                  height: '10px',
                  boxSizing: 'border-box',
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border)',
                  boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.12)',
                }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, avgCompletion)}%`,
                    background:
                      'linear-gradient(180deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.05) 45%, rgba(0, 0, 0, 0.08) 100%), var(--color-accent)',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.15)',
                  }}
                />
              </div>
            </div>

            {/* Word and pangram totals */}
            <div
              data-stats-all-totals
              className="flex flex-col gap-1.5 py-1.5 px-2 rounded-xl"
              style={{
                background: 'color-mix(in srgb, var(--color-accent) 8%, var(--color-bg-primary))',
                border:
                  '1px solid color-mix(in srgb, var(--color-accent) 22%, var(--color-border))',
              }}
            >
              <div className="grid grid-cols-2 gap-1 text-center">
                <div
                  className="flex flex-col items-center"
                  style={{
                    borderRight:
                      '1px solid color-mix(in srgb, var(--color-accent) 22%, var(--color-border))',
                  }}
                >
                  <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                    Sanoja löydetty
                  </span>
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {lifetime.totalWords}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                    Pangrammeja
                  </span>
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {lifetime.totalPangrams}
                  </span>
                </div>
              </div>

              <div
                className="pt-1 flex items-center justify-between px-1.5 text-xs"
                style={{
                  borderTop:
                    '1px solid color-mix(in srgb, var(--color-accent) 22%, var(--color-border))',
                }}
              >
                <span className="text-[10.5px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Pisin sana
                </span>
                <span
                  className="font-semibold text-right truncate max-w-[200px]"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {lifetime.longestWord || '—'}
                </span>
              </div>
            </div>

            {/* Saavutetut tasot (ranks) across all games */}
            <div data-stats-all-ranks className="flex flex-col gap-1 pt-1">
              <div
                className="text-[10.5px] font-bold uppercase tracking-wider px-1"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Saavutetut tasot
              </div>
              <div className="space-y-0.5">
                {ranksLowestFirst.map((rank) => {
                  const count = rankDist[rank.name] || 0;
                  const pct = (count / maxCount) * 100;
                  return (
                    <div
                      key={rank.name}
                      className="flex items-center gap-2 text-[10.5px] px-1 py-0.5"
                    >
                      <span
                        className="w-20 shrink-0 truncate"
                        style={{ color: 'var(--color-text-secondary)' }}
                        title={rank.name}
                      >
                        {rank.name}
                      </span>
                      <div
                        className="flex-1 min-w-0 rounded-full overflow-hidden border border-solid"
                        style={{
                          height: '8px',
                          boxSizing: 'border-box',
                          backgroundColor: 'var(--color-bg-primary)',
                          borderColor: 'var(--color-border)',
                          boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.12)',
                        }}
                      >
                        {count > 0 && (
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${pct}%`,
                              background:
                                'linear-gradient(180deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.05) 45%, rgba(0, 0, 0, 0.08) 100%), var(--color-accent)',
                              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.15)',
                            }}
                          />
                        )}
                      </div>
                      <span
                        className="w-4 text-right shrink-0 font-semibold tabular-nums"
                        style={{
                          color:
                            count > 0 ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                        }}
                      >
                        {count || ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. ILMAN APUJA — Distinct Hintless Card */}
          <div
            data-stats-section="no-hint"
            className="p-3 rounded-2xl flex flex-col gap-2 transition-all"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div>
              <h3
                className="text-xs font-bold uppercase tracking-wider m-0 leading-none"
                data-stats-heading="no-hint"
                style={{ color: 'var(--color-text-primary)' }}
              >
                Ilman apuja
              </h3>
              <p
                className="text-[10px] m-0 mt-0.5 leading-none"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                Ratkaistu ilman vihjeitä
              </p>
            </div>

            <div
              data-stats-no-hint-summary
              className="grid grid-cols-2 gap-1 py-1.5 px-2 rounded-xl text-center"
              style={{
                background: 'color-mix(in srgb, var(--color-accent) 8%, var(--color-bg-primary))',
                border:
                  '1px solid color-mix(in srgb, var(--color-accent) 22%, var(--color-border))',
              }}
            >
              <div
                className="flex flex-col items-center"
                style={{
                  borderRight:
                    '1px solid color-mix(in srgb, var(--color-accent) 22%, var(--color-border))',
                }}
              >
                <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Paras tulos
                </span>
                <span
                  className="text-xs font-bold tabular-nums"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {noHintLifetime.highestPercentage.toFixed(0)} %
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Ällistyttäviä pelejä
                </span>
                <span
                  className="text-xs font-bold tabular-nums"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {noHintLifetime.topTierCount}
                </span>
              </div>
            </div>
          </div>

          {(hasPuzzle || onShare !== undefined) && (
            <button
              type="button"
              onClick={handleShareClick}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl font-semibold text-xs cursor-pointer border-none transition-opacity hover:opacity-90 mt-0.5"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-on-accent)',
              }}
            >
              <ShareIcon size={14} strokeWidth={2.5} />
              <span>{shareCopied ? 'Kopioitu!' : 'Jaa tulos'}</span>
            </button>
          )}
        </div>
      )}
    </ModalShell>
  );
}
