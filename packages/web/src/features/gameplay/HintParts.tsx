import type { DerivedHintData } from './hints.js';

/** Maximum suffix cells that fit the fixed-height deck (6 columns × 5 rows). */
export const MAX_SUFFIX_CELLS = 30;

/** Two small dots showing how many of a tab's two levels are open. */
export function LevelPips({ level }: { level: 0 | 1 | 2 }): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`Taso ${level}/2`}>
      {[1, 2].map((n) => (
        <span
          key={n}
          className="block rounded-full transition-colors duration-150"
          style={{
            width: '5.5px',
            height: '5.5px',
            backgroundColor: n <= level ? 'var(--color-accent)' : 'var(--color-border)',
          }}
        />
      ))}
    </span>
  );
}

/** Accent outline pill that opens the next level of the active tab. */
export function UpgradeButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      data-testid="upgrade-tier-button"
      onClick={onClick}
      className="cursor-pointer rounded-full px-2.5 py-[2px] text-[11px] font-semibold bg-transparent transition-colors hover:bg-[var(--color-bg-secondary)]"
      style={{ color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}
    >
      Avaa seuraava taso →
    </button>
  );
}

/** Locked state of a tab: what the hint reveals plus one clear accent button. */
export function LockedHintCard({
  title,
  description,
  buttonLabel,
  onUnlock,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  onUnlock: () => void;
}): React.JSX.Element {
  return (
    <div
      className="w-full h-full flex flex-col justify-between rounded-xl px-3.5 py-3 box-border"
      style={{ backgroundColor: 'var(--color-bg-secondary)' }}
    >
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[13px] font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {title}
          </span>
          <LevelPips level={0} />
        </div>
        <p
          className="text-[12px] leading-snug m-0"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {description}
        </p>
      </div>
      <div>
        <button
          type="button"
          data-testid="activate-hints-button"
          onClick={onUnlock}
          className="cursor-pointer border-none rounded-full px-4 py-1.5 text-[12px] font-bold transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

/** Section label used inside the deck content. */
function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      className="text-[11px] font-bold uppercase tracking-wider pl-1 mb-1"
      style={{ color: 'var(--color-text-primary)' }}
    >
      {children}
    </div>
  );
}

/** Pangram chips (level 1) and the suffix grid (level 2) of the Vihjeet tab. */
export function WordClues({
  data,
  showSuffixes,
}: {
  data: DerivedHintData;
  showSuffixes: boolean;
}): React.JSX.Element {
  const suffixes = [...data.suffixMap].sort(
    (a, b) => Number(b.remaining > 0) - Number(a.remaining > 0),
  );
  const overflow = suffixes.length > MAX_SUFFIX_CELLS;
  const visibleSuffixes = overflow ? suffixes.slice(0, MAX_SUFFIX_CELLS - 1) : suffixes;

  return (
    <div className="w-full flex flex-col gap-2">
      <div>
        <SectionLabel>Pangrammit · alkukirjain (pituus)</SectionLabel>
        <div className="flex flex-wrap gap-1.5 pl-1">
          {data.unfoundPangrams.map((p, idx) => (
            <span
              key={`unfound-pangram-${idx}`}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px]"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span className="font-bold" style={{ color: 'var(--color-accent)' }}>
                {p.first_letter.toUpperCase()}
              </span>
              <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                ({p.length})
              </span>
            </span>
          ))}
          {Array.from({ length: data.pangramStats.found }).map((_, idx) => (
            <span
              key={`found-pangram-${idx}`}
              className="inline-flex items-center rounded-md px-2 py-0.5 text-[12px]"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              ✓ löydetty
            </span>
          ))}
        </div>
      </div>

      {showSuffixes && (
        <div>
          <SectionLabel>Sananpäätteet · jäljellä</SectionLabel>
          <div
            className="grid grid-cols-6 gap-x-1 gap-y-1 pl-1 text-[11px] leading-[15px]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {visibleSuffixes.map((entry) => (
              <span
                key={entry.suffix}
                className="truncate whitespace-nowrap"
                style={{
                  color:
                    entry.remaining === 0
                      ? 'var(--color-text-tertiary)'
                      : 'var(--color-text-primary)',
                }}
              >
                <span className="font-bold">-{entry.suffix}</span>{' '}
                <span
                  className="font-semibold"
                  style={{
                    color: entry.remaining === 0 ? undefined : 'var(--color-accent)',
                  }}
                >
                  {entry.remaining === 0 ? '✓' : entry.remaining}
                </span>
              </span>
            ))}
            {overflow && (
              <span style={{ color: 'var(--color-text-secondary)' }}>
                +{suffixes.length - visibleSuffixes.length}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
