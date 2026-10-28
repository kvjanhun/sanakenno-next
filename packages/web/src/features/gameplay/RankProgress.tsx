import { useEffect, useRef } from 'react';
import { noHintAchievementStates, progressToNextRank, rankThresholds } from '@sanakenno/shared';
import { ChevronDownIcon, CircleIcon, CircleOffIcon, CircleStarIcon } from './icons.js';

export interface RankProgressProps {
  score: number;
  maxScore: number;
  rank: string;
  showRanks: boolean;
  onToggleRanks: () => void;
  scoreBeforeHints: number;
  hasUnlockedHints: boolean;
}

export function RankProgress({
  score,
  maxScore,
  rank,
  showRanks,
  onToggleRanks,
  scoreBeforeHints,
  hasUnlockedHints,
}: RankProgressProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const progress = Math.min(100, Math.max(0, progressToNextRank(score, maxScore)));
  const thresholds = rankThresholds(rank, maxScore);
  const noHintAchievements = noHintAchievementStates(scoreBeforeHints, maxScore);
  const currentNoHintAchievement = [...noHintAchievements].reverse().find((item) => item.unlocked);
  const currentNoHintText =
    currentNoHintAchievement?.name === 'Ällistyttävä ilman apuja'
      ? 'uskomatonta!'
      : currentNoHintAchievement?.name === 'Apuitta taitava'
        ? 'taidokasta!'
        : currentNoHintAchievement?.name === 'Omin avuin'
          ? 'hyvä!'
          : '';
  const noHintSuffix = ` ilman apuja${currentNoHintText ? `, ${currentNoHintText}` : ''}`;

  useEffect(() => {
    if (!showRanks) return;
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onToggleRanks();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [showRanks, onToggleRanks]);

  return (
    <div ref={containerRef} className="w-full" style={{ position: 'relative' }}>
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[26px] font-bold leading-none"
          data-testid="score-display"
          style={{
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-game)',
          }}
        >
          {score} pistettä
        </span>
        <button
          key={rank}
          type="button"
          onClick={onToggleRanks}
          data-testid="rank-button"
          className="flex items-center gap-1 pl-4.5 pr-3 py-1 text-sm rounded-full cursor-pointer border-none rank-pulse"
          style={{
            backgroundColor: 'var(--color-accent)',
            color: 'var(--color-on-accent)',
            fontWeight: 600,
            flexShrink: 0,
          }}
          aria-expanded={showRanks}
        >
          <span>{rank}</span>
          <span
            aria-hidden="true"
            className="inline-flex h-3.5 w-3.5 items-center justify-center transition-transform duration-150"
            style={{
              transform: showRanks ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <ChevronDownIcon size={14} strokeWidth={2.5} />
          </span>
        </button>
      </div>

      <div
        className="h-2 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={maxScore}
      >
        <div
          className="h-full rounded-full transition-[width] duration-200 ease-out"
          style={{
            width: `${Math.round(progress)}%`,
            backgroundColor: 'var(--color-accent)',
          }}
        />
      </div>

      {showRanks && (
        <div
          data-testid="rank-thresholds-panel"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 20,
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border)',
            borderRadius: '0 0 8px 8px',
            marginTop: '0.25rem',
            overflow: 'hidden',
          }}
        >
          <ul className="list-none p-0 m-0 text-sm space-y-1" style={{ padding: '0.5rem 0.75rem' }}>
            {thresholds.map((t) => (
              <li
                key={t.name}
                className="flex justify-between"
                style={{
                  color: t.isCurrent ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  fontWeight: t.isCurrent ? 700 : 400,
                }}
              >
                <span>{t.name}</span>
                <span>{t.points}</span>
              </li>
            ))}
          </ul>
          <div
            style={{
              borderTop: '1px solid var(--color-border)',
              padding: '0.6rem 0.75rem',
              background: 'var(--color-bg-secondary)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="min-w-0 truncate whitespace-nowrap text-sm"
                data-no-hint-current
                style={{ color: 'var(--color-text-primary)' }}
              >
                <strong className="font-bold" data-no-hint-points>
                  {scoreBeforeHints} p.
                </strong>
                {noHintSuffix}
              </span>
              <div
                className="flex shrink-0 items-center gap-1"
                aria-label={`Ilman apuja: ${
                  noHintAchievements.filter((item) => item.unlocked).length
                } / ${noHintAchievements.length} saavutusta`}
              >
                {noHintAchievements.map((achievement, index) => (
                  <NoHintAchievementIcon
                    key={achievement.name}
                    index={index}
                    name={achievement.name}
                    unlocked={achievement.unlocked}
                    inactive={hasUnlockedHints && !achievement.unlocked}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NoHintAchievementIcon({
  index,
  name,
  unlocked,
  inactive,
}: {
  index: number;
  name: string;
  unlocked: boolean;
  inactive: boolean;
}): React.JSX.Element {
  const iconName = unlocked ? 'circle-star' : inactive ? 'circle-off' : 'circle';
  const color = unlocked
    ? 'var(--color-accent)'
    : inactive
      ? 'color-mix(in srgb, var(--color-text-tertiary) 40%, var(--color-bg-secondary))'
      : 'var(--color-text-tertiary)';

  return (
    <span
      className="flex h-7 w-7 items-center justify-center"
      data-no-hint-indicator={index + 1}
      data-no-hint-state={unlocked ? 'unlocked' : 'locked'}
      data-no-hint-icon={iconName}
      title={name}
      style={{ color }}
    >
      {unlocked ? (
        <CircleStarIcon size={22} strokeWidth={2.3} />
      ) : inactive ? (
        <CircleOffIcon size={22} strokeWidth={2.3} />
      ) : (
        <CircleIcon size={21} strokeWidth={2.3} />
      )}
    </span>
  );
}
