import { useEffect } from 'react';
import { getTierToken, HexagonMedallion } from '../modals/achievementIcons.js';
import { triggerConsoleAnnouncement, type Announcement } from './announcements.js';
import { CircleStarIcon } from './icons.js';
import { useUiStore } from './useUiStore.js';

function renderGameplayIcon(
  announcement: Extract<Announcement, { kind: 'gameplay' }>,
): React.JSX.Element {
  if (announcement.category === 'no_hint_milestone') {
    return <CircleStarIcon size={17} strokeWidth={2.3} />;
  }
  return <span className="text-sm font-bold leading-none">{announcement.badgeText ?? '★'}</span>;
}

/**
 * Unified "Sivuraita" gameplay and achievement announcement banner anchored
 * directly beneath RankProgress without shifting HintPanels or Honeycomb.
 */
export function AnnouncementBanner(): React.JSX.Element | null {
  const activeAnnouncement = useUiStore((s) => s.activeAnnouncement);
  const showRanks = useUiStore((s) => s.showRanks);
  const dismissAnnouncement = useUiStore((s) => s.dismissAnnouncement);
  const enqueueAnnouncement = useUiStore((s) => s.enqueueAnnouncement);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const announce = (type?: string, ...args: unknown[]) =>
      triggerConsoleAnnouncement(enqueueAnnouncement, type, ...args);
    window.sanakennoAnnounce = announce;
    return () => {
      if (window.sanakennoAnnounce === announce) {
        delete window.sanakennoAnnounce;
      }
    };
  }, [enqueueAnnouncement]);

  if (!activeAnnouncement || showRanks) return null;

  const isAchievement = activeAnnouncement.kind === 'achievement';
  const tone = isAchievement ? getTierToken(activeAnnouncement.tierKey) : 'var(--color-accent)';

  const cardStyle: React.CSSProperties = isAchievement
    ? {
        background: `linear-gradient(90deg, color-mix(in srgb, ${tone} 14%, var(--color-bg-primary)) 0%, var(--color-bg-primary) 72%)`,
        border: `1.5px solid color-mix(in srgb, ${tone} 68%, var(--color-border))`,
        borderLeft: `4px solid ${tone}`,
        boxShadow: `0 4px 12px var(--color-button-shadow), 0 0 10px color-mix(in srgb, ${tone} 15%, transparent)`,
      }
    : {
        background: `color-mix(in srgb, ${tone} 6%, var(--color-bg-primary))`,
        border: `1px solid color-mix(in srgb, ${tone} 42%, var(--color-border))`,
        borderLeft: `4px solid ${tone}`,
        boxShadow: '0 4px 12px var(--color-button-shadow)',
      };

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none"
      style={{
        position: 'absolute',
        top: '100%',
        left: '-12px',
        right: '-12px',
        padding: '0 12px 20px 12px',
        zIndex: 30,
        marginTop: '0.35rem',
        transform: 'translate3d(0, 0, 0)',
      }}
    >
      <button
        key={activeAnnouncement.id}
        type="button"
        data-testid="announcement-banner"
        data-announcement-kind={activeAnnouncement.kind}
        data-announcement-category={activeAnnouncement.category}
        onClick={dismissAnnouncement}
        title="Sulje ilmoitus"
        className="pointer-events-auto animate-announcement-in w-full rounded-xl px-3 py-2 flex items-center gap-2.5 text-left cursor-pointer"
        style={cardStyle}
      >
        {isAchievement ? (
          <HexagonMedallion
            id={activeAnnouncement.achievementId}
            tierToken={tone}
            isActivated
            size={28}
          />
        ) : (
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: `color-mix(in srgb, ${tone} 16%, var(--color-bg-primary))`,
              color: tone,
            }}
          >
            {renderGameplayIcon(activeAnnouncement)}
          </div>
        )}

        <div className="min-w-0 flex-1 leading-snug">
          <div
            data-testid="announcement-title"
            className={`text-xs leading-snug ${isAchievement ? 'font-bold' : 'font-semibold'}`}
            style={{ color: 'var(--color-text-primary)' }}
          >
            {activeAnnouncement.title}
          </div>
          {activeAnnouncement.subtitle && (
            <div
              data-testid="announcement-subtitle"
              className="text-xs leading-snug mt-0.5 tabular-nums"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {activeAnnouncement.subtitle}
            </div>
          )}
        </div>

        {isAchievement ? (
          <span
            data-testid="announcement-tier-pill"
            className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-md"
            style={{
              background: `color-mix(in srgb, ${tone} 18%, transparent)`,
              color: tone,
              border: `1px solid color-mix(in srgb, ${tone} 40%, transparent)`,
            }}
          >
            {activeAnnouncement.tierName}
          </span>
        ) : activeAnnouncement.metaPill ? (
          <span
            data-testid="announcement-meta-pill"
            className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums"
            style={{
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {activeAnnouncement.metaPill}
          </span>
        ) : null}
      </button>
    </div>
  );
}
