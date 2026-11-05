import { useEffect } from 'react';
import { useGameStore } from './useGameStore.js';

export function AchievementNotification(): React.JSX.Element | null {
  const newAchievement = useGameStore((s) => s.newAchievement);
  const clearNewAchievement = useGameStore((s) => s.clearNewAchievement);

  useEffect(() => {
    if (!newAchievement) return;
    const timer = setTimeout(() => {
      clearNewAchievement();
    }, 4000);

    return () => clearTimeout(timer);
  }, [newAchievement, clearNewAchievement]);

  if (!newAchievement) return null;

  const unitSuffix = newAchievement.unit ? ` ${newAchievement.unit}` : '';
  const message = `🏆 Uusi saavutus: ${newAchievement.title} (${newAchievement.tierName} — ${newAchievement.target}${unitSuffix})!`;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="achievement-notification"
      onClick={clearNewAchievement}
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-lg cursor-pointer transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
      style={{
        background: 'var(--color-bg-primary)',
        color: 'var(--color-text-primary)',
        border: '1.5px solid var(--color-accent)',
        boxShadow: '0 4px 16px var(--color-button-shadow)',
        maxWidth: 'calc(100vw - 2rem)',
      }}
    >
      <span className="text-sm font-semibold tracking-wide whitespace-nowrap overflow-hidden text-ellipsis">
        {message}
      </span>
    </div>
  );
}
