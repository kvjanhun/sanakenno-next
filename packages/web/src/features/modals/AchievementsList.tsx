import {
  evaluateAchievements,
  type AchievementTierKey,
  type PlayerAchievementProgress,
  type PlayerStats,
} from '@sanakenno/shared';
import { CheckIcon } from '../gameplay/icons.js';
import { AchievementIcon, TrophyIcon } from './achievementIcons.js';

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

function computeTimelineProgress(item: PlayerAchievementProgress): number {
  if (item.isCompleted || item.unlockedTier >= 5) return 100;
  const tiers = item.tiers;
  const val = item.currentValue;

  if (item.unlockedTier === 0) {
    const t1 = tiers[0]?.target ?? 1;
    const ratio = Math.max(0, Math.min(1, val / t1));
    return ratio * 10;
  }

  const currentLevel = item.unlockedTier;
  const prevTarget = tiers[currentLevel - 1]?.target ?? 0;
  const nextTarget = tiers[currentLevel]?.target ?? prevTarget + 1;
  const range = nextTarget - prevTarget;
  const progressInRange = Math.max(0, Math.min(1, (val - prevTarget) / (range || 1)));

  const basePct = 10 + (currentLevel - 1) * 20;
  return basePct + progressInRange * 20;
}

function HexagonMedallion({
  id,
  tierToken,
  isActivated,
}: {
  id: string;
  tierToken?: string;
  isActivated: boolean;
}): React.JSX.Element {
  return (
    <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0 w-full h-full transition-all duration-300"
        fill="none"
      >
        <polygon
          points="20,2 36,11 36,29 20,38 4,29 4,11"
          stroke={isActivated && tierToken ? tierToken : 'var(--color-border)'}
          strokeWidth={isActivated ? '2.5' : '1.5'}
          strokeLinejoin="round"
          fill={
            isActivated && tierToken
              ? `color-mix(in srgb, ${tierToken} 18%, var(--color-bg-primary))`
              : 'var(--color-bg-primary)'
          }
        />
      </svg>
      <div
        className="relative z-10 transition-colors duration-300"
        style={{
          color: isActivated && tierToken ? tierToken : 'var(--color-text-tertiary)',
        }}
      >
        <AchievementIcon id={id} size={20} strokeWidth={isActivated ? 2.4 : 2} />
      </div>
    </div>
  );
}

export function AchievementsList({ stats, streak }: AchievementsListProps): React.JSX.Element {
  const achievements = evaluateAchievements(stats, streak);
  const totalUnlockedTiers = achievements.reduce((sum, item) => sum + item.unlockedTier, 0);
  const totalPossibleTiers = achievements.reduce((sum, item) => sum + item.tiers.length, 0);
  const completedCount = achievements.filter((item) => item.isCompleted).length;
  const overallPercentage = Math.round((totalUnlockedTiers / totalPossibleTiers) * 100);

  return (
    <div className="flex flex-col gap-2.5 pb-2" data-testid="achievements-list">
      {/* Redesigned Showcase Header Hero Card */}
      <div
        className="p-3 rounded-2xl flex flex-col gap-2 transition-all"
        style={{
          background: 'color-mix(in srgb, var(--color-accent) 8%, var(--color-bg-secondary))',
          border: '1px solid color-mix(in srgb, var(--color-accent) 22%, var(--color-border))',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: 'color-mix(in srgb, var(--color-accent) 18%, var(--color-bg-primary))',
                color: 'var(--color-accent)',
              }}
            >
              <TrophyIcon size={16} strokeWidth={2.4} />
            </div>
            <div>
              <h3
                className="text-xs font-bold uppercase tracking-wider m-0 leading-none"
                style={{ color: 'var(--color-accent)' }}
              >
                Saavutukset
              </h3>
              <p
                className="text-[11px] m-0 mt-0.5 leading-none"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {completedCount === 6
                  ? 'Kaikki saavutukset suoritettu!'
                  : `${totalUnlockedTiers} / ${totalPossibleTiers} tasoa ansaittu`}
              </p>
            </div>
          </div>

          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-bold"
            style={{
              background: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          >
            <span style={{ color: 'var(--color-accent)' }}>{overallPercentage}%</span>
            <span
              className="text-[10px] font-sans font-normal"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              valmiina
            </span>
          </div>
        </div>

        {/* Master progression track */}
        <div
          className="w-full h-1.5 rounded-full overflow-hidden"
          style={{ background: 'var(--color-bg-primary)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(totalUnlockedTiers / totalPossibleTiers) * 100}%`,
              background:
                totalUnlockedTiers === totalPossibleTiers
                  ? 'var(--color-tier-master)'
                  : 'var(--color-accent)',
            }}
          />
        </div>
      </div>

      {/* Redesigned Achievement Cards */}
      {achievements.map((item: PlayerAchievementProgress) => {
        const isMaxCompleted = item.isCompleted;
        const isActivated = item.unlockedTier >= 1;
        const currentTierToken = item.currentTier ? getTierToken(item.currentTier.key) : undefined;
        const timelinePct = computeTimelineProgress(item);

        return (
          <div
            key={item.id}
            data-testid={`achievement-card-${item.id}`}
            className="flex flex-col p-3 rounded-2xl transition-all duration-200"
            style={{
              background: 'var(--color-bg-secondary)',
              border: isMaxCompleted
                ? '1px solid var(--color-tier-master)'
                : currentTierToken
                  ? `1px solid color-mix(in srgb, ${currentTierToken} 35%, var(--color-border))`
                  : '1px solid var(--color-border)',
              boxShadow: isMaxCompleted
                ? '0 0 16px color-mix(in srgb, var(--color-tier-master) 20%, transparent)'
                : currentTierToken
                  ? `0 0 10px color-mix(in srgb, ${currentTierToken} 8%, transparent)`
                  : 'none',
            }}
          >
            {/* Header: Hexagon Medallion + Titles + Progress Number */}
            <div className="flex items-center gap-3 mb-2.5">
              <HexagonMedallion
                id={item.id}
                tierToken={currentTierToken}
                isActivated={isActivated}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4
                    className="text-sm font-bold m-0 leading-tight"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {item.title}
                  </h4>
                  {item.currentTier && (
                    <span
                      className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider leading-none"
                      style={{
                        background: `color-mix(in srgb, ${currentTierToken} 18%, transparent)`,
                        color: currentTierToken,
                        border: `1px solid color-mix(in srgb, ${currentTierToken} 40%, transparent)`,
                      }}
                    >
                      {item.currentTier.name}
                    </span>
                  )}
                </div>
                <p
                  className="text-[11px] m-0 mt-0.5 leading-snug line-clamp-2"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {item.description}
                </p>
              </div>

              {/* Numerical progress */}
              <div className="text-right shrink-0 pl-1">
                <div
                  className="text-xs font-mono font-bold leading-tight"
                  style={{
                    color: isMaxCompleted
                      ? 'var(--color-tier-master)'
                      : isActivated && currentTierToken
                        ? currentTierToken
                        : 'var(--color-text-primary)',
                  }}
                >
                  {isMaxCompleted
                    ? item.currentValue
                    : `${item.currentValue} / ${item.nextTierTarget}`}
                </div>
                <div
                  className="text-[10px] leading-tight mt-0.5"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {item.unit}
                </div>
              </div>
            </div>

            {/* Redesigned 5-Tier Journey Stepper Timeline */}
            <div className="relative pt-1 pb-0.5">
              {/* Connected Track Line behind nodes */}
              <div
                className="absolute left-[10%] right-[10%] top-[9px] h-1 rounded-full z-0 overflow-hidden"
                style={{ background: 'var(--color-bg-primary)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, (timelinePct - 10) / 0.8))}%`,
                    background: isMaxCompleted
                      ? 'var(--color-tier-master)'
                      : (currentTierToken ?? 'var(--color-accent)'),
                  }}
                />
              </div>

              {/* 5 Node Markers */}
              <div className="grid grid-cols-5 relative z-10">
                {item.tiers.map((tier) => {
                  const isUnlocked = tier.level <= item.unlockedTier;
                  const tokenColor = getTierToken(tier.key);

                  return (
                    <div
                      key={tier.level}
                      data-tier-level={tier.level}
                      data-tier-unlocked={isUnlocked ? 'true' : 'false'}
                      className="flex flex-col items-center text-center"
                    >
                      {/* Node Pip: ONLY colored when actually unlocked/achieved */}
                      <div
                        className="w-[18px] h-[18px] rounded-full flex items-center justify-center transition-all duration-200"
                        style={{
                          background: isUnlocked ? tokenColor : 'var(--color-bg-primary)',
                          border: isUnlocked
                            ? `2px solid ${tokenColor}`
                            : '1.5px solid var(--color-border)',
                          boxShadow: isUnlocked
                            ? `0 0 8px color-mix(in srgb, ${tokenColor} 45%, transparent)`
                            : 'none',
                        }}
                      >
                        {isUnlocked ? (
                          <CheckIcon
                            size={9}
                            strokeWidth={3.5}
                            style={{ color: 'var(--color-on-accent)' }}
                          />
                        ) : (
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: 'var(--color-border)' }}
                          />
                        )}
                      </div>

                      {/* Tier Name: colored when unlocked, neutral when locked */}
                      <span
                        className="text-[9.5px] font-bold mt-1 leading-tight tracking-tight"
                        style={{
                          color: isUnlocked ? tokenColor : 'var(--color-text-tertiary)',
                        }}
                      >
                        {tier.name}
                      </span>

                      {/* Target Number: clearly visible font-mono */}
                      <span
                        className="text-[8.5px] font-mono leading-tight mt-0.5"
                        style={{
                          color: isUnlocked
                            ? 'var(--color-text-primary)'
                            : 'var(--color-text-tertiary)',
                          opacity: isUnlocked ? 0.95 : 0.6,
                        }}
                      >
                        {tier.target >= 1000 ? tier.target.toLocaleString('fi-FI') : tier.target}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
