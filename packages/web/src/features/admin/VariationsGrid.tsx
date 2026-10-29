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
    <div className="grid grid-cols-7 gap-2">
      {variations.map((v) => {
        const isActive = v.center.toLowerCase() === activeCenter.toLowerCase();
        return (
          <button
            key={v.center}
            type="button"
            onClick={() => onSelect(v.center)}
            className="flex flex-col w-full rounded-xl overflow-hidden shadow-xs hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer border select-none group"
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
              className="w-full flex items-center justify-center py-2 font-mono text-xl sm:text-2xl font-black uppercase border-b transition-colors duration-200"
              style={{
                backgroundColor: isActive ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                color: isActive ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
                borderColor: isActive ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            >
              {v.center}
            </div>

            <div
              className="w-full flex-[1_0_auto] flex flex-col gap-0.5 justify-center py-2 text-center transition-colors duration-200"
              style={{
                backgroundColor: isActive
                  ? 'color-mix(in srgb, var(--color-accent) 12%, var(--color-bg-primary))'
                  : 'var(--color-bg-primary)',
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              }}
            >
              <div className="text-xs font-semibold">{v.word_count} sanaa</div>
              <div className="text-[11px] opacity-90">{v.max_score} p</div>
              <div className="text-[10px] font-mono opacity-75">{v.pangram_count} pg</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
