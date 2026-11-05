import {
  evaluateAchievements,
  type AchievementTierKey,
  type PlayerAchievementProgress,
  type PlayerStats,
} from '@sanakenno/shared';

export interface AchievementsListProps {
  stats: PlayerStats;
  streak: { current: number; best: number };
}

function getTierToken(key: AchievementTierKey): string {
  switch (key) {
    case 'bronze':
      return 'var(--color-tier-bronze)';
    case 'silver':
      return 'var(--color-tier-silver)';
    case 'gold':
      return 'var(--color-tier-gold)';
    case 'diamond':
      return 'var(--color-tier-diamond)';
    case 'master':
      return 'var(--color-tier-master)';
  }
}

function getCategoryIcon(id: string): string {
  switch (id) {
    case 'streak':
      return '🔥';
    case 'total_words':
      return '📚';
    case 'pangrams':
      return '✨';
    case 'long_word':
      return '🦕';
    case 'full_board':
      return '👑';
    case 'unassisted_master':
      return '🦅';
    default:
      return '🏆';
  }
}

export function AchievementsList({ stats, streak }: AchievementsListProps): React.JSX.Element {
  const achievements = evaluateAchievements(stats, streak);

  return (
    <div className="flex flex-col gap-3.5 pb-2" data-testid="achievements-list">
      {achievements.map((item: PlayerAchievementProgress) => {
        const icon = getCategoryIcon(item.id);
        const isMaxCompleted = item.isCompleted;

        return (
          <div
            key={item.id}
            data-testid={`achievement-card-${item.id}`}
            className="flex flex-col p-3.5 rounded-xl transition-all duration-200"
            style={{
              background: 'var(--color-bg-secondary)',
              border: isMaxCompleted
                ? '1px solid var(--color-tier-gold)'
                : '1px solid var(--color-border)',
            }}
          >
            {/* Header: Icon, Titles, Badges */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl select-none" aria-hidden="true">
                  {icon}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h4
                      className="text-base font-bold m-0"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {item.title}
                    </h4>
                    {item.currentTier && (
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: `color-mix(in srgb, ${getTierToken(item.currentTier.key)} 20%, transparent)`,
                          color: getTierToken(item.currentTier.key),
                          border: `1px solid ${getTierToken(item.currentTier.key)}`,
                        }}
                      >
                        {item.currentTier.name}
                      </span>
                    )}
                  </div>
                  <p
                    className="text-xs m-0 mt-0.5 line-clamp-1"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Numerical progress */}
              <div className="text-right shrink-0">
                <span
                  className="text-xs font-mono font-medium"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {isMaxCompleted
                    ? `${item.currentValue} ${item.unit}`
                    : `${item.currentValue} / ${item.nextTierTarget} ${item.unit}`}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div
              className="w-full h-2 rounded-full overflow-hidden mb-3"
              style={{
                background: 'var(--color-bg-primary)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${item.progressPct}%`,
                  background: isMaxCompleted ? 'var(--color-tier-gold)' : 'var(--color-accent)',
                }}
              />
            </div>

            {/* 5-tier milestone badges */}
            <div className="grid grid-cols-5 gap-1.5 pt-1">
              {item.tiers.map((tier) => {
                const isUnlocked = tier.level <= item.unlockedTier;
                const tokenColor = getTierToken(tier.key);

                return (
                  <div
                    key={tier.level}
                    data-tier-level={tier.level}
                    data-tier-unlocked={isUnlocked ? 'true' : 'false'}
                    className="flex flex-col items-center py-1 px-0.5 rounded text-center transition-colors"
                    style={{
                      background: isUnlocked
                        ? `color-mix(in srgb, ${tokenColor} 14%, var(--color-bg-primary))`
                        : 'var(--color-bg-primary)',
                      border: isUnlocked
                        ? `1px solid ${tokenColor}`
                        : '1px solid var(--color-border)',
                      opacity: isUnlocked ? 1 : 0.6,
                    }}
                  >
                    <span
                      className="text-[10px] font-bold leading-tight"
                      style={{
                        color: isUnlocked ? tokenColor : 'var(--color-text-tertiary)',
                      }}
                    >
                      {tier.name}
                    </span>
                    <span
                      className="text-[9px] font-mono leading-tight mt-0.5"
                      style={{
                        color: isUnlocked
                          ? 'var(--color-text-primary)'
                          : 'var(--color-text-tertiary)',
                      }}
                    >
                      {tier.target}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
