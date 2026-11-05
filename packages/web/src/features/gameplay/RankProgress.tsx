import { useEffect, useRef } from 'react';
import { RANKS, noHintMilestoneStates, rankThresholds } from '@sanakenno/shared';
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

const INTERMEDIATE_RANKS = [...RANKS].filter((r) => r.pct > 0 && r.pct < 100).reverse();

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
  const totalProgress = maxScore > 0 ? Math.min(100, Math.max(0, (score / maxScore) * 100)) : 0;
  const thresholds = rankThresholds(rank, maxScore);
  const noHintMilestones = noHintMilestoneStates(scoreBeforeHints, maxScore);
  const currentNoHintMilestone = [...noHintMilestones].reverse().find((item) => item.unlocked);
  const currentNoHintText =
    currentNoHintMilestone?.name === 'Ällistyttävä ilman apuja'
      ? 'uskomatonta!'
      : currentNoHintMilestone?.name === 'Avuitta taitava'
        ? 'taidokasta!'
        : currentNoHintMilestone?.name === 'Omin avuin'
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
      <div className="flex items-center justify-between mb-1.5">
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

      <div className="flex items-center gap-2.5 h-5">
        <div
          className="relative flex-1 rounded-full overflow-hidden transition-[width] duration-200 border border-solid"
          style={{
            height: '15px',
            boxSizing: 'border-box',
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border)',
            boxShadow: 'inset 0 1.5px 3px rgba(0, 0, 0, 0.12)',
          }}
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={maxScore}
        >
          <div
            className="h-full rounded-full transition-[width] duration-200 ease-out"
            data-testid="rank-progress-fill"
            style={{
              width: `${totalProgress}%`,
              background:
                'linear-gradient(180deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.05) 45%, rgba(0, 0, 0, 0.08) 100%), var(--color-accent)',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.15)',
            }}
          />

          {INTERMEDIATE_RANKS.map((r) => (
            <div
              key={r.name}
              data-testid={`rank-notch-${r.pct}`}
              data-rank={r.name}
              title={`${r.name} (${r.pct}%)`}
              className="absolute pointer-events-none z-10"
              style={{
                left: `${r.pct}%`,
                top: '2.5px',
                bottom: '2.5px',
                width: '1px',
                borderRadius: '9999px',
                transform: 'translateX(-50%)',
                backgroundColor: 'var(--color-rank-notch)',
              }}
            />
          ))}
        </div>

        {!showRanks && (
          <div
            className="flex items-center gap-1.5 shrink-0"
            title="Saavutukset ilman apuja (25%, 50%, 70%)"
            aria-label="Saavutukset ilman apuja"
          >
            {noHintMilestones.map((ach) => {
              const isReached = ach.unlocked;
              const isLost = hasUnlockedHints && !isReached;
              return (
                <span
                  key={ach.name}
                  data-testid={`milestone-pip-${ach.pct}`}
                  data-state={isReached ? 'reached' : isLost ? 'lost' : 'open'}
                  title={`${ach.name} (${ach.pct}% pisteistä): ${
                    isReached
                      ? 'Saavutettu'
                      : isLost
                        ? 'Ei enää saavutettavissa (avut käytössä)'
                        : 'Tavoite ilman apuja'
                  }`}
                  className="flex items-center justify-center transition-colors duration-200"
                  style={{
                    width: '21px',
                    height: '21px',
                    color: isReached
                      ? 'var(--color-accent)'
                      : isLost
                        ? 'color-mix(in srgb, var(--color-text-tertiary) 45%, transparent)'
                        : 'var(--color-text-tertiary)',
                  }}
                >
                  {isReached ? (
                    <CircleStarIcon size={21} strokeWidth={2.3} />
                  ) : isLost ? (
                    <CircleOffIcon size={20} strokeWidth={2.2} />
                  ) : (
                    <CircleIcon size={18} strokeWidth={2.2} />
                  )}
                </span>
              );
            })}
          </div>
        )}
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
            borderRadius: '0 0 10px 10px',
            marginTop: '0.35rem',
            boxShadow: '0 4px 16px var(--color-button-shadow)',
            overflow: 'hidden',
          }}
        >
          <div
            data-testid="rank-panel-no-hints"
            style={{
              borderBottom: '1px solid var(--color-border)',
              padding: '0.65rem 0.85rem',
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
                className="flex shrink-0 items-center gap-1.5"
                aria-label={`Ilman apuja: ${
                  noHintMilestones.filter((item) => item.unlocked).length
                } / ${noHintMilestones.length} saavutusta`}
              >
                {noHintMilestones.map((milestone, index) => {
                  const isReached = milestone.unlocked;
                  const isLost = hasUnlockedHints && !isReached;
                  const iconName = isReached ? 'circle-star' : isLost ? 'circle-off' : 'circle';
                  const color = isReached
                    ? 'var(--color-accent)'
                    : isLost
                      ? 'color-mix(in srgb, var(--color-text-tertiary) 40%, var(--color-bg-secondary))'
                      : 'var(--color-text-tertiary)';

                  return (
                    <span
                      key={milestone.name}
                      data-testid={`milestone-pip-${milestone.pct}`}
                      data-state={isReached ? 'reached' : isLost ? 'lost' : 'open'}
                      data-no-hint-indicator={index + 1}
                      data-no-hint-state={isReached ? 'unlocked' : 'locked'}
                      data-no-hint-icon={iconName}
                      title={`${milestone.name} (${milestone.pct}% pisteistä): ${
                        isReached
                          ? 'Saavutettu'
                          : isLost
                            ? 'Ei enää saavutettavissa (avut käytössä)'
                            : 'Tavoite ilman apuja'
                      }`}
                      className="flex h-7 w-7 items-center justify-center transition-colors duration-200"
                      style={{ color }}
                    >
                      {isReached ? (
                        <CircleStarIcon size={26} strokeWidth={2.3} />
                      ) : isLost ? (
                        <CircleOffIcon size={26} strokeWidth={2.3} />
                      ) : (
                        <CircleIcon size={24} strokeWidth={2.3} />
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
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
        </div>
      )}
    </div>
  );
}
