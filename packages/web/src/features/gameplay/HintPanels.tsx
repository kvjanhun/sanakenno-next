import { useState } from 'react';
import { HintMatrixTable } from './HintMatrixTable.js';
import { LevelPips, LockedHintCard, UpgradeButton, WordClues } from './HintParts.js';
import { useHintData, type DerivedHintData } from './hints.js';
import { ChevronDownIcon } from './icons.js';
import { useUiStore } from './useUiStore.js';

export interface HintPanelsProps {
  hintsUnlocked: Set<string>;
  onUnlock: (id: string) => void;
  hintData?: DerivedHintData | null;
}

export type HintTabType = 'matrix' | 'hints';

/** Fixed deck height so the honeycomb never moves when levels open. */
const DECK_HEIGHT = '172px';

export function HintPanels({
  hintsUnlocked,
  onUnlock,
  hintData: propHintData,
}: HintPanelsProps): React.JSX.Element | null {
  const storeHintData = useHintData();
  const data = propHintData ?? storeHintData;
  const [activeTab, setActiveTab] = useState<HintTabType>('matrix');
  const hidden = useUiStore((s) => s.hintsHidden);
  const setHidden = useUiStore((s) => s.setHintsHidden);

  if (!data) return null;

  // Only lengths / letters that have words in this puzzle
  const activeLengths = data.matrix.lengths.filter((len) =>
    data.matrix.letters.some((letter) => (data.matrix.cells[letter]?.[len]?.total ?? 0) > 0),
  );
  const activeLetters = data.matrix.letters.filter((letter) =>
    data.letterMap.some((item) => item.letter === letter && item.total > 0),
  );

  // Two independent two-level unlocks (legacy IDs map onto the same levels).
  const has = (...ids: string[]) => ids.some((id) => hintsUnlocked.has(id));
  const matrixLevel: 0 | 1 | 2 = has('tier3', 'matrix_full', 'distribution')
    ? 2
    : has('tier1', 'matrix_totals', 'matrix', 'summary')
      ? 1
      : 0;
  const hintsLevel: 0 | 1 | 2 = has('tier4', 'suffixes', 'pairs')
    ? 2
    : has('tier2', 'pangrams')
      ? 1
      : 0;

  // Next-level action for the active tab only (never cross-tab).
  const upgradeAction =
    activeTab === 'matrix'
      ? matrixLevel === 1
        ? () => onUnlock('tier3')
        : null
      : hintsLevel === 1
        ? () => onUnlock('tier4')
        : null;

  const counter = (
    <span
      className="text-[12px] font-semibold"
      style={{ color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}
      data-testid="hint-words-counter"
    >
      {data.wordsRemaining}/{data.wordCount}{' '}
      <span className="font-normal" style={{ color: 'var(--color-text-secondary)' }}>
        sanaa jäljellä
      </span>
    </span>
  );

  if (hidden) {
    return (
      <div
        data-testid="hint-deck"
        className="w-full flex items-center justify-between select-none px-1"
        style={{ height: '30px', marginTop: '4px', marginBottom: '0.25rem' }}
      >
        <button
          type="button"
          data-testid="show-hints-button"
          onClick={() => setHidden(false)}
          className="cursor-pointer border-none rounded-lg px-3 py-1 text-[12px] font-semibold inline-flex items-center gap-1"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)',
          }}
        >
          Näytä avut
          <ChevronDownIcon size={13} strokeWidth={2.5} />
        </button>
        {counter}
      </div>
    );
  }

  const tabButton = (tab: HintTabType, label: string, level: 0 | 1 | 2, testId: string) => {
    const active = activeTab === tab;
    return (
      <button
        type="button"
        data-testid={testId}
        aria-pressed={active}
        onClick={() => setActiveTab(tab)}
        className="cursor-pointer border-none rounded-md px-3 py-1 text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors duration-150"
        style={{
          backgroundColor: active ? 'var(--color-bg-primary)' : 'transparent',
          color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          boxShadow: active ? '0 1px 2px var(--color-button-shadow)' : 'none',
        }}
      >
        {label}
        <LevelPips level={level} />
      </button>
    );
  };

  return (
    <div
      data-testid="hint-deck"
      className="w-full flex flex-col select-none px-0.5"
      style={{
        height: DECK_HEIGHT,
        minHeight: DECK_HEIGHT,
        maxHeight: DECK_HEIGHT,
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
        marginTop: '4px',
        marginBottom: '0.25rem',
      }}
    >
      {/* Toolbar: tab selector · upgrade action / words remaining · hide button */}
      <div className="flex items-center justify-between shrink-0 mb-1.5 px-0.5">
        <div
          className="inline-flex rounded-lg p-0.5"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          {tabButton('matrix', 'Matriisi', matrixLevel, 'tier-tab-1')}
          {tabButton('hints', 'Vihjeet', hintsLevel, 'tier-tab-2')}
        </div>

        {/* Hidden aliases kept for legacy test selectors */}
        <button
          type="button"
          data-testid="tier-tab-3"
          className="hidden"
          onClick={() => setActiveTab('matrix')}
          aria-hidden="true"
        />
        <button
          type="button"
          data-testid="tier-tab-4"
          className="hidden"
          onClick={() => setActiveTab('hints')}
          aria-hidden="true"
        />

        <div className="flex items-center gap-2">
          {upgradeAction ? <UpgradeButton onClick={upgradeAction} /> : counter}
          <button
            type="button"
            data-testid="hide-hints-button"
            aria-label="Piilota avut"
            title="Piilota avut"
            onClick={() => setHidden(true)}
            className="cursor-pointer border-none bg-transparent rounded-md w-7 h-7 -mr-1 inline-flex items-center justify-center transition-colors hover:bg-[var(--color-bg-secondary)]"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <ChevronDownIcon size={16} strokeWidth={2.5} style={{ transform: 'rotate(180deg)' }} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-0.5">
        {activeTab === 'matrix' &&
          (matrixLevel === 0 ? (
            <LockedHintCard
              title="Kirjainmatriisi"
              description="Montako sanaa alkaa kullakin kirjaimella. Seuraava taso lisää sanojen pituudet."
              buttonLabel="Avaa matriisi"
              onUnlock={() => onUnlock('tier1')}
            />
          ) : (
            <div
              data-testid={matrixLevel === 2 ? 'hint-content-tier3' : 'hint-content-tier1'}
              className="w-full h-full flex flex-col justify-start"
            >
              <HintMatrixTable
                data={data}
                activeLengths={activeLengths}
                activeLetters={activeLetters}
                isRevealed={matrixLevel === 2}
              />
            </div>
          ))}

        {activeTab === 'hints' &&
          (hintsLevel === 0 ? (
            <LockedHintCard
              title="Sanavihjeet"
              description="Pangrammien alkukirjaimet ja pituudet. Seuraava taso lisää sanojen päätteet."
              buttonLabel="Avaa vihjeet"
              onUnlock={() => onUnlock('tier2')}
            />
          ) : (
            <div
              data-testid={hintsLevel === 2 ? 'hint-content-tier4' : 'hint-content-tier2'}
              className="w-full h-full flex flex-col justify-start"
            >
              <WordClues data={data} showSuffixes={hintsLevel === 2} />
            </div>
          ))}
      </div>
    </div>
  );
}

export { HintPanels as HintDeck };
