import { useState } from 'react';
import { useHintData, type DerivedHintData } from './hints.js';

export interface HintPanelsProps {
  hintsUnlocked: Set<string>;
  onUnlock: (id: string) => void;
  hintData?: DerivedHintData | null;
}

export type HintTierLevel = 0 | 1 | 2 | 3 | 4;

const TIER_NAMES: Record<1 | 2 | 3 | 4, string> = {
  1: 'Alkukirjaimet',
  2: 'Pangrammi',
  3: 'Matriisi',
  4: 'Päätteet',
};

function resolveUnlockedTier(hintsUnlocked: Set<string>): HintTierLevel {
  if (hintsUnlocked.has('tier4')) return 4;
  if (
    hintsUnlocked.has('tier3') ||
    hintsUnlocked.has('pairs') ||
    hintsUnlocked.has('distribution')
  ) {
    return 3;
  }
  if (hintsUnlocked.has('tier2')) return 2;
  if (hintsUnlocked.has('tier1') || hintsUnlocked.has('summary')) return 1;
  return 0;
}

export function HintPanels({
  hintsUnlocked,
  onUnlock,
  hintData: propHintData,
}: HintPanelsProps): React.JSX.Element | null {
  const storeHintData = useHintData();
  const data = propHintData ?? storeHintData;

  const maxUnlockedTier = resolveUnlockedTier(hintsUnlocked);
  const [selectedTier, setSelectedTier] = useState<HintTierLevel | null>(null);

  // If currently selected tier is not unlocked or null, default to highest unlocked tier
  const activeTier =
    selectedTier !== null && selectedTier <= maxUnlockedTier && selectedTier >= 1
      ? selectedTier
      : maxUnlockedTier >= 1
        ? maxUnlockedTier
        : 1;

  if (!data) return null;

  const isPangramUnlocked = maxUnlockedTier >= 2;
  const unfoundPangramClue =
    data.unfoundPangrams.length > 0
      ? `Pangrammi: ${data.unfoundPangrams[0]?.first_letter.toUpperCase()}... (${data.unfoundPangrams[0]?.length} kirj.)`
      : data.pangramStats.total === 0
        ? 'Ei pangrammeja'
        : 'Kaikki pangrammit löydetty! ✨';

  // For the compact matrix, only display columns for lengths that have at least one word
  const activeLengths = data.matrix.lengths.filter((len) => {
    return data.matrix.letters.some((letter) => {
      const cell = data.matrix.cells[letter]?.[len];
      return cell && cell.total > 0;
    });
  });

  // Only display letter rows that actually have words in this puzzle
  const activeLetters = data.matrix.letters.filter((letter) => {
    return data.letterMap.some((item) => item.letter === letter && item.total > 0);
  });

  return (
    <div
      data-testid="hint-deck"
      className="w-full flex flex-col justify-between select-none"
      style={{
        height: '146px',
        minHeight: '146px',
        maxHeight: '146px',
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
        marginBottom: '0.5rem',
      }}
    >
      {maxUnlockedTier === 0 ? (
        /* Tier 0 — Clean "Omin avuin" state */
        <div
          data-testid="hint-tier-0"
          className="h-full flex flex-col items-center justify-center text-center px-2"
        >
          <span
            className="text-[11px] font-semibold tracking-wider uppercase"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Avut · Pelaat omin avuin
          </span>
          <span className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            Avaa vihjeet nähdäksesi puuttuvat sanat ja kirjaimet
          </span>
          <button
            type="button"
            data-testid="activate-hints-button"
            onClick={() => onUnlock('tier1')}
            className="mt-2 text-[12px] font-bold cursor-pointer bg-transparent border-none p-0"
            style={{ color: 'var(--color-accent)' }}
          >
            Ota vihjeet käyttöön (Taso 1) →
          </button>
        </div>
      ) : (
        /* Unified Progressive Hint Deck (ONE VIEW that enriches as parts unlock) */
        <div className="h-full flex flex-col justify-between py-1">
          {/* Header row: understated tier navigation + next upgrade CTA */}
          <div className="flex items-center justify-between text-[11px] px-0.5">
            <div className="flex items-center gap-2">
              <span
                className="font-bold tracking-wide uppercase"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                Avut
              </span>
              <div className="flex items-center gap-1.5">
                {([1, 2, 3, 4] as const).map((tier) => {
                  const isUnlocked = tier <= maxUnlockedTier;
                  if (!isUnlocked) return null;
                  const isCurrent = tier === activeTier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      data-testid={`tier-tab-${tier}`}
                      onClick={() => setSelectedTier(tier)}
                      className="cursor-pointer bg-transparent border-none p-0 transition-colors"
                      style={{
                        color: isCurrent ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                        fontWeight: isCurrent ? 700 : 500,
                        textDecoration: isCurrent ? 'underline' : 'none',
                        textUnderlineOffset: '2px',
                      }}
                    >
                      {TIER_NAMES[tier]}
                    </button>
                  );
                })}
              </div>
            </div>

            {maxUnlockedTier < 4 && (
              <button
                type="button"
                data-testid="upgrade-tier-button"
                onClick={() => {
                  const nextTier = (maxUnlockedTier + 1) as 1 | 2 | 3 | 4;
                  onUnlock(`tier${nextTier}`);
                  setSelectedTier(nextTier);
                }}
                className="cursor-pointer bg-transparent border-none p-0 font-semibold"
                style={{ color: 'var(--color-accent)' }}
              >
                Avaa Taso {maxUnlockedTier + 1} →
              </button>
            )}
          </div>

          {/* Persistent Overview Row: Word count (n/N) + Pangram status ALWAYS visible across all tiers */}
          <div
            className="flex items-center justify-between px-0.5 text-[11px] pb-0.5 border-b"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <span
              className="font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
              data-testid="hint-words-counter"
            >
              {data.wordsRemaining} / {data.wordCount} sanaa jäljellä
            </span>
            <span
              className="font-medium truncate max-w-[55%]"
              style={{
                color: isPangramUnlocked ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              }}
            >
              {isPangramUnlocked
                ? unfoundPangramClue
                : `Pangrammit: ${data.pangramStats.found}/${data.pangramStats.total}`}
            </span>
          </div>

          {/* Active Detail Zone — fits the remaining space without scrolling */}
          <div className="flex-1 flex flex-col justify-center overflow-hidden px-0.5 pt-0.5">
            {activeTier === 1 && (
              /* Tier 1: Starting letters & length distribution */
              <div
                data-testid="hint-content-tier1"
                className="flex flex-col justify-center gap-1.5"
              >
                <div className="flex items-center justify-between gap-1 overflow-x-auto scrollbar-none py-0.5">
                  {data.letterMap.map((item) => (
                    <div
                      key={item.letter}
                      className="flex items-baseline gap-1"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: item.isComplete
                          ? 'var(--color-text-tertiary)'
                          : 'var(--color-text-primary)',
                      }}
                    >
                      <span className="font-bold text-xs">{item.letter.toUpperCase()}</span>
                      <span className="text-[11px]">{item.isComplete ? '✓' : item.remaining}</span>
                    </div>
                  ))}
                </div>
                <div
                  className="flex items-center gap-2 overflow-x-auto scrollbar-none text-[10.5px]"
                  style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}
                >
                  <span
                    className="font-sans text-[10px] uppercase font-semibold"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    Pituudet:
                  </span>
                  {data.lengthDistribution
                    .filter((l) => l.total > 0)
                    .map((l) => (
                      <span key={l.len}>
                        {l.len}k:{' '}
                        <strong
                          style={{
                            color:
                              l.remaining === 0
                                ? 'var(--color-text-tertiary)'
                                : 'var(--color-text-primary)',
                          }}
                        >
                          {l.remaining === 0 ? '✓' : l.remaining}
                        </strong>
                      </span>
                    ))}
                </div>
              </div>
            )}

            {activeTier === 2 && (
              /* Tier 2: Pangram Detail + Starting Letters */
              <div
                data-testid="hint-content-tier2"
                className="flex flex-col justify-center gap-1.5"
              >
                <div className="flex items-center justify-between gap-1 overflow-x-auto scrollbar-none py-0.5">
                  {data.letterMap.map((item) => (
                    <div
                      key={item.letter}
                      className="flex items-baseline gap-1"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: item.isComplete
                          ? 'var(--color-text-tertiary)'
                          : 'var(--color-text-primary)',
                      }}
                    >
                      <span className="font-bold text-xs">{item.letter.toUpperCase()}</span>
                      <span className="text-[11px]">{item.isComplete ? '✓' : item.remaining}</span>
                    </div>
                  ))}
                </div>
                <div
                  className="text-[11px] font-semibold py-0.5"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {unfoundPangramClue}
                </div>
              </div>
            )}

            {activeTier === 3 && (
              /* Tier 3: Compact 2D Matrix (Letter x Length) — STRICTLY ZERO SCROLL */
              <div
                data-testid="hint-content-tier3"
                className="w-full h-full flex flex-col justify-center overflow-hidden"
              >
                <table
                  className="w-full text-center text-[10px] leading-tight"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    borderCollapse: 'collapse',
                  }}
                >
                  <thead>
                    <tr style={{ color: 'var(--color-text-tertiary)' }}>
                      <th className="text-left font-normal pb-0.5">Kirj.</th>
                      {activeLengths.map((len) => (
                        <th key={len} className="font-normal pb-0.5">
                          {len}
                        </th>
                      ))}
                      <th className="text-right font-normal pb-0.5">Yht.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeLetters.map((letter) => {
                      const totalLeft = data.matrix.totalsByLetter[letter] ?? 0;
                      return (
                        <tr
                          key={letter}
                          style={{
                            color:
                              totalLeft === 0
                                ? 'var(--color-text-tertiary)'
                                : 'var(--color-text-primary)',
                          }}
                        >
                          <td className="text-left font-bold py-[1px]">{letter.toUpperCase()}</td>
                          {activeLengths.map((len) => {
                            const rem = data.matrix.cells[letter]?.[len]?.remaining ?? 0;
                            return (
                              <td key={len} className="py-[1px]">
                                {rem > 0 ? rem : '–'}
                              </td>
                            );
                          })}
                          <td className="text-right font-semibold py-[1px]">
                            {totalLeft > 0 ? totalLeft : '✓'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {activeTier === 4 && (
              /* Tier 4: Comprehensive Suffixes & Endings — Accounts for 100% of puzzle words */
              <div
                data-testid="hint-content-tier4"
                className="flex flex-col justify-center gap-1 overflow-hidden"
              >
                <div className="flex items-center justify-between text-[10.5px]">
                  <span
                    className="font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    Sananpäätteet
                  </span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    {data.suffixMap.filter((s) => s.remaining > 0).length} eri päätettä jäljellä
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 overflow-hidden max-h-[52px] py-0.5">
                  {data.suffixMap.length > 0 ? (
                    data.suffixMap.map((entry) => (
                      <span
                        key={entry.suffix}
                        className="text-[11px]"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color:
                            entry.remaining === 0
                              ? 'var(--color-text-tertiary)'
                              : 'var(--color-text-primary)',
                        }}
                      >
                        <span className="font-semibold">-{entry.suffix}</span>:{' '}
                        {entry.remaining === 0 ? '✓' : entry.remaining}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      Ei päätteitä jäljellä.
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { HintPanels as HintDeck };
