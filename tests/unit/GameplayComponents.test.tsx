import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deriveHintData } from '../../packages/shared/src/index.js';
import { FoundWords } from '../../packages/web/src/features/gameplay/FoundWords.js';
import { HintPanels } from '../../packages/web/src/features/gameplay/HintPanels.js';
import { Honeycomb } from '../../packages/web/src/features/gameplay/Honeycomb.js';
import { RankProgress } from '../../packages/web/src/features/gameplay/RankProgress.js';

describe('Gameplay UI Components', () => {
  it('renders Honeycomb center and outer letters and fires letter callbacks on interaction', () => {
    const onLetterPress = vi.fn();
    const onHexDown = vi.fn();
    const onHexUp = vi.fn();

    render(
      <Honeycomb
        center="a"
        outerLetters={['e', 'i', 'k', 'l', 'n', 's']}
        pressedHexIndex={null}
        onLetterPress={onLetterPress}
        onHexDown={onHexDown}
        onHexUp={onHexUp}
      />,
    );

    const img = screen.getByRole('img', { name: /Kirjainkenno/i });
    expect(img).toBeInTheDocument();

    const centerCell = screen.getByTestId('hex-cell-a');
    expect(centerCell).toHaveAttribute('data-hex-center', 'true');

    const outerCellK = screen.getByTestId('hex-cell-k');
    expect(outerCellK).toHaveAttribute('data-hex-center', 'false');

    fireEvent.pointerDown(outerCellK);
    expect(onHexDown).toHaveBeenCalled();
    expect(onLetterPress).toHaveBeenCalledWith('k');
  });

  it('renders RankProgress score, rank pill, and expandable rank thresholds with no-hint points', () => {
    const onToggleRanks = vi.fn();
    const { rerender } = render(
      <RankProgress
        score={25}
        maxScore={100}
        rank="Hyvä"
        showRanks={false}
        onToggleRanks={onToggleRanks}
        scoreBeforeHints={25}
        hasUnlockedHints={false}
      />,
    );

    expect(screen.getByTestId('score-display')).toHaveTextContent('25 pistettä');
    const rankBtn = screen.getByTestId('rank-button');
    expect(rankBtn).toHaveTextContent('Hyvä');
    expect(rankBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(rankBtn);
    expect(onToggleRanks).toHaveBeenCalledTimes(1);

    rerender(
      <RankProgress
        score={25}
        maxScore={100}
        rank="Hyvä"
        showRanks={true}
        onToggleRanks={onToggleRanks}
        scoreBeforeHints={18}
        hasUnlockedHints={true}
      />,
    );

    const panel = screen.getByTestId('rank-thresholds-panel');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent('Täysi kenno');
    expect(panel).toHaveTextContent('Ällistyttävä');
    expect(panel).toHaveTextContent('18 p.');
  });

  it('supports HintPanels progressive tab selection, locked teaser, and hint unlocking', () => {
    const onUnlock = vi.fn();
    const hintData = deriveHintData(
      {
        word_count: 4,
        pangram_count: 1,
        by_letter: { k: 3, l: 1 },
        by_length: { '4': 2, '6': 1, '11': 1 },
        by_pair: { ka: 3, la: 1 },
      },
      new Set(['kana']),
      new Set(['a', 'e', 'i', 'k', 'l', 'n', 's']),
    );

    const { rerender } = render(
      <HintPanels hintsUnlocked={new Set()} onUnlock={onUnlock} hintData={hintData} />,
    );

    const summaryTab = screen.getByRole('button', { name: /Yleiskuva/i });
    expect(summaryTab).toHaveAttribute('data-hint-state', 'locked');

    // Open locked summary tab -> shows teaser and "Aktivoi apu" button
    fireEvent.click(summaryTab);
    expect(screen.getByText('Yhteenveto jäljellä olevista sanoista.')).toBeInTheDocument();

    const unlockButton = screen.getByRole('button', { name: 'Aktivoi apu' });
    fireEvent.click(unlockButton);
    expect(onUnlock).toHaveBeenCalledWith('summary');

    // Rerender with 'summary' unlocked -> shows summary metrics
    rerender(
      <HintPanels hintsUnlocked={new Set(['summary'])} onUnlock={onUnlock} hintData={hintData} />,
    );

    expect(summaryTab).toHaveAttribute('data-hint-state', 'unlocked');
    expect(screen.getByTestId('hint-panel-summary')).toHaveTextContent('3/4');
    expect(screen.getByTestId('hint-panel-summary')).toHaveTextContent('sanaa löytämättä');
  });

  it('renders FoundWords with Kotus dictionary links and pangram bolding', () => {
    const onToggleShowAll = vi.fn();
    const allLetters = new Set(['a', 'e', 'i', 'k', 'l', 'n', 's']);

    render(
      <FoundWords
        foundWords={['kana', 'kansallinen']}
        recentWords={['kansallinen', 'kana']}
        showAll={false}
        allLetters={allLetters}
        onToggleShowAll={onToggleShowAll}
        lastResubmittedWord={null}
      />,
    );

    expect(screen.getByTestId('found-words-count')).toHaveTextContent('2');
    const link = screen.getByRole('link', {
      name: 'Avaa sanan "kansallinen" määritelmä Kotuksessa',
    });
    expect(link).toHaveAttribute('href', expect.stringContaining('kielitoimistonsanakirja.fi'));
  });
});
