import type { DerivedHintData, PairEntry, SuffixEntry } from './hints.js';

/** Legacy constant preserved for compatibility. */
export const MAX_SUFFIX_CELLS = 30;

/** Dots showing how many levels or parts are open. Supports max=2 or max=3. */
export function LevelPips({ level, max = 2 }: { level: number; max?: number }): React.JSX.Element {
  const pips = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`Taso ${level}/${max}`}>
      {pips.map((n) => (
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
      className="cursor-pointer rounded-full px-2.5 py-[2px] text-[11px] font-semibold transition-colors hover:bg-[var(--color-bg-secondary)]"
      style={{
        backgroundColor: 'var(--color-bg-primary)',
        color: 'var(--color-accent)',
        border: '1px solid var(--color-accent)',
        boxShadow: '0 1px 2px var(--color-button-shadow)',
      }}
    >
      Avaa seuraava taso →
    </button>
  );
}

/** Locked state card used for the Matrix tab when level is 0. */
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

/** Compact locked clue row for Vihjeet tab sections. */
export function ClueLockedRow({
  title,
  description,
  onUnlock,
  testId,
  buttonTestId,
}: {
  title: string;
  description: string;
  onUnlock: () => void;
  testId?: string;
  buttonTestId?: string;
}): React.JSX.Element {
  return (
    <div
      data-testid={testId}
      className="w-full flex items-center justify-between rounded-lg px-2.5 py-1 box-border transition-colors shrink-0"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        minHeight: '32px',
      }}
    >
      <div className="flex items-baseline gap-2 min-w-0 pr-2">
        <span
          className="text-[12px] font-bold shrink-0 leading-tight"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {title}
        </span>
        <span
          className="text-[11px] truncate leading-tight"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {description}
        </span>
      </div>
      <button
        type="button"
        data-testid={buttonTestId ?? 'activate-hints-button'}
        onClick={onUnlock}
        className="cursor-pointer border-none rounded-full px-2.5 py-0.5 text-[11px] font-bold shrink-0 transition-opacity hover:opacity-90 active:scale-95"
        style={{
          backgroundColor: 'var(--color-accent)',
          color: 'var(--color-on-accent)',
        }}
      >
        Avaa
      </button>
    </div>
  );
}

/** Section label inside unlocked clue blocks. */
function ClueLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      className="text-[11px] tracking-wider pl-0.5 mb-1 leading-none"
      style={{ color: 'var(--color-text-secondary)' }}
    >
      {children}
    </div>
  );
}

/** Unlocked Pangram clues. */
export function PangramClues({ data }: { data: DerivedHintData }): React.JSX.Element {
  return (
    <div
      data-testid="clue-section-pangrams"
      className="w-full flex flex-col justify-center shrink-0"
    >
      <ClueLabel>Pangrammit · alkukirjain (pituus)</ClueLabel>
      <div className="flex flex-wrap items-center gap-1.5 pl-0.5">
        {data.unfoundPangrams.map((p, idx) => (
          <span
            key={`unfound-pangram-${idx}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] leading-tight"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span className="font-bold" style={{ color: 'var(--color-accent)' }}>
              {p.first_letter}
            </span>
            <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              ({p.length})
            </span>
          </span>
        ))}
        {Array.from({ length: data.pangramStats.found }).map((_, idx) => (
          <span
            key={`found-pangram-${idx}`}
            className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] leading-tight"
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
  );
}

/** Unlocked Top 7 starting pairs clues. */
export function PairClues({ pairs }: { pairs: PairEntry[] }): React.JSX.Element {
  return (
    <div data-testid="clue-section-pairs" className="w-full flex flex-col justify-center shrink-0">
      <ClueLabel>Alkuparit · 7 yleisintä jäljellä</ClueLabel>
      <div className="flex flex-wrap items-center gap-1.5 pl-0.5">
        {pairs.length === 0 ? (
          <span
            className="text-[11px] font-medium pl-0.5"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Kaikki löydetty ✓
          </span>
        ) : (
          pairs.map((entry) => (
            <span
              key={entry.pair}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-tight"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--color-text-primary)',
              }}
            >
              <span className="font-bold lowercase">{entry.pair.toLowerCase()}</span>
              <span className="font-semibold" style={{ color: 'var(--color-accent)' }}>
                {entry.remaining}
              </span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

/** Unlocked Top 7 suffixes clues. */
export function SuffixClues({ suffixes }: { suffixes: SuffixEntry[] }): React.JSX.Element {
  return (
    <div
      data-testid="clue-section-suffixes"
      className="w-full flex flex-col justify-center shrink-0"
    >
      <ClueLabel>Sananpäätteet · 7 yleisintä jäljellä</ClueLabel>
      <div className="flex flex-wrap items-center gap-1.5 pl-0.5">
        {suffixes.length === 0 ? (
          <span
            className="text-[11px] font-medium pl-0.5"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Kaikki löydetty ✓
          </span>
        ) : (
          suffixes.map((entry) => (
            <span
              key={entry.suffix}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-tight"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--color-text-primary)',
              }}
            >
              <span className="font-bold">-{entry.suffix}</span>
              <span className="font-semibold" style={{ color: 'var(--color-accent)' }}>
                {entry.remaining}
              </span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

/** Complete 3-module Vihjeet clues container. */
export function WordClues({
  data,
  hasPangrams,
  hasPairs,
  hasSuffixes,
  onUnlockPangrams,
  onUnlockPairs,
  onUnlockSuffixes,
}: {
  data: DerivedHintData;
  hasPangrams: boolean;
  hasPairs: boolean;
  hasSuffixes: boolean;
  onUnlockPangrams: () => void;
  onUnlockPairs: () => void;
  onUnlockSuffixes: () => void;
}): React.JSX.Element {
  const topPairs = data.topPairs ?? [];
  const topSuffixes = data.topSuffixes ?? [];

  return (
    <div
      data-testid="hint-content-vihjeet"
      className="w-full h-full flex flex-col justify-between pt-0.5 pb-2"
    >
      {/* 1. Pangrams */}
      <div
        data-testid={hasPangrams ? 'hint-content-tier2' : undefined}
        className="w-full flex flex-col justify-center"
      >
        {hasPangrams ? (
          <PangramClues data={data} />
        ) : (
          <ClueLockedRow
            title="Pangrammit"
            description="Alkukirjaimet ja pituudet"
            onUnlock={onUnlockPangrams}
            testId="clue-locked-pangrams"
            buttonTestId="unlock-pangrams-button"
          />
        )}
      </div>

      {/* 2. Starting Pairs */}
      <div className="w-full flex flex-col justify-center">
        {hasPairs ? (
          <PairClues pairs={topPairs} />
        ) : (
          <ClueLockedRow
            title="Alkuparit"
            description="7 yleisintä alkua ja määrät"
            onUnlock={onUnlockPairs}
            testId="clue-locked-pairs"
            buttonTestId="unlock-pairs-button"
          />
        )}
      </div>

      {/* 3. Suffixes */}
      <div
        data-testid={hasSuffixes ? 'hint-content-tier4' : undefined}
        className="w-full flex flex-col justify-center"
      >
        {hasSuffixes ? (
          <SuffixClues suffixes={topSuffixes} />
        ) : (
          <ClueLockedRow
            title="Sananpäätteet"
            description="7 yleisintä päätettä ja määrät"
            onUnlock={onUnlockSuffixes}
            testId="clue-locked-suffixes"
            buttonTestId="unlock-suffixes-button"
          />
        )}
      </div>
    </div>
  );
}
