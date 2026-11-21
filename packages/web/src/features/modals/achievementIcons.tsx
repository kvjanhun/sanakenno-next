import type { AchievementTierKey } from '@sanakenno/shared';
import { BookOpen, Crown, Feather, Flame, Ruler, Trophy } from 'lucide-react';
import { SparklesIcon, type IconProps } from '../gameplay/icons.js';

export function FlameIcon(props: IconProps): React.JSX.Element {
  return <Flame size={20} strokeWidth={2.2} aria-hidden="true" {...props} />;
}

export function BookOpenIcon(props: IconProps): React.JSX.Element {
  return <BookOpen size={20} strokeWidth={2.2} aria-hidden="true" {...props} />;
}

export function RulerIcon(props: IconProps): React.JSX.Element {
  return <Ruler size={20} strokeWidth={2.2} aria-hidden="true" {...props} />;
}

export function CrownIcon(props: IconProps): React.JSX.Element {
  return <Crown size={20} strokeWidth={2.2} aria-hidden="true" {...props} />;
}

export function FeatherIcon(props: IconProps): React.JSX.Element {
  return <Feather size={20} strokeWidth={2.2} aria-hidden="true" {...props} />;
}

export function TrophyIcon(props: IconProps): React.JSX.Element {
  return <Trophy size={20} strokeWidth={2.2} aria-hidden="true" {...props} />;
}

export function AchievementIcon({ id, ...props }: IconProps & { id: string }): React.JSX.Element {
  switch (id) {
    case 'streak':
      return <FlameIcon {...props} />;
    case 'total_words':
      return <BookOpenIcon {...props} />;
    case 'pangrams':
      return <SparklesIcon size={20} strokeWidth={2.2} {...props} />;
    case 'long_word':
      return <RulerIcon {...props} />;
    case 'full_board':
      return <CrownIcon {...props} />;
    case 'unassisted_master':
      return <FeatherIcon {...props} />;
    default:
      return <TrophyIcon {...props} />;
  }
}

/** Resolve the semantic CSS custom property token for an achievement tier key. */
export function getTierToken(key: AchievementTierKey): string {
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

/** Hexagonal medallion framing an achievement category icon in its tier color. */
export function HexagonMedallion({
  id,
  tierToken,
  isActivated = true,
  size = 40,
}: {
  id: string;
  tierToken?: string;
  isActivated?: boolean;
  size?: number;
}): React.JSX.Element {
  const iconSize = Math.round(size * 0.5);
  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{ width: `${size}px`, height: `${size}px` }}
    >
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
        <AchievementIcon id={id} size={iconSize} strokeWidth={isActivated ? 2.4 : 2} />
      </div>
    </div>
  );
}
