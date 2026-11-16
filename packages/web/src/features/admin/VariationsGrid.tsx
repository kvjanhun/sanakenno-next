import type { VariationData } from '@sanakenno/shared';

interface VariationsGridProps {
  variations: VariationData[];
  activeCenter: string;
  onSelect: (center: string) => void;
}

export function VariationsGrid({
  variations,
  activeCenter,
  onSelect,
}: VariationsGridProps): React.JSX.Element | null {
  if (variations.length === 0) return null;

  return (
    <div className="grid grid-cols-7 gap-1 sm:gap-2">
      {variations.map((v) => {
        const isActive = v.center.toLowerCase() === activeCenter.toLowerCase();
        return (
          <button
            key={v.center}
            type="button"
            onClick={() => onSelect(v.center)}
            className="flex flex-col w-full min-w-0 rounded-lg sm:rounded-xl overflow-hidden shadow-xs hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer border select-none"
            style={{
              borderColor: isActive ? 'var(--color-accent)' : 'var(--color-border)',
            }}
            title={
              isActive
                ? `${v.center.toUpperCase()} on valittu keskuskirjain`
                : `Valitse ${v.center.toUpperCase()} keskuskirjaimeksi`
            }
          >
            <div
              className="w-full flex items-center justify-center py-1.5 sm:py-2 text-base sm:text-xl font-bold uppercase border-b transition-colors duration-200"
              style={{
                fontFamily: 'var(--font-game)',
                backgroundColor: isActive ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                color: isActive ? 'var(--color-on-accent)' : 'var(--color-text-primary)',
                borderColor: isActive ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            >
              {v.center}
            </div>

            <div
              className="w-full flex-[1_0_auto] flex flex-col gap-0.5 justify-center py-1.5 sm:py-2 px-0.5 text-center tabular-nums transition-colors duration-200"
              style={{
                backgroundColor: isActive
                  ? 'color-mix(in srgb, var(--color-accent) 12%, var(--color-bg-primary))'
                  : 'var(--color-bg-primary)',
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              }}
            >
              <div className="text-[10px] sm:text-xs font-semibold leading-tight">
                {v.word_count} sanaa
              </div>
              <div className="text-[10px] sm:text-[11px] opacity-90 leading-tight">
                {v.max_score} p
              </div>
              <div className="text-[9px] sm:text-[10px] font-medium opacity-75 leading-tight">
                {v.pangram_count} pg
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
