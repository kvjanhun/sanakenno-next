import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deriveHintData } from '../../packages/shared/src/index.js';
import { FoundWords } from '../../packages/web/src/features/gameplay/FoundWords.js';
import { HintPanels } from '../../packages/web/src/features/gameplay/HintPanels.js';
import { Honeycomb } from '../../packages/web/src/features/gameplay/Honeycomb.js';
import { RankProgress } from '../../packages/web/src/features/gameplay/RankProgress.js';
import { useKeyboard } from '../../packages/web/src/features/gameplay/useKeyboard.js';

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
    expect(screen.getByTestId('milestone-pip-25')).toBeInTheDocument();
    expect(screen.getByTestId('milestone-pip-50')).toBeInTheDocument();
    expect(screen.getByTestId('milestone-pip-70')).toBeInTheDocument();
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
    // No-hint pips stay visible after hints are used; unreached ones turn "lost"
    expect(screen.getByTestId('milestone-pip-25')).toHaveAttribute('data-state', 'lost');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent('Täysi kenno');
    expect(panel).toHaveTextContent('Ällistyttävä');
    expect(panel).toHaveTextContent('18 p.');
  });

  it('supports HintPanels progressive 4-tier deck and tier unlocking', () => {
    const onUnlock = vi.fn();
    const hintData = deriveHintData(
      {
        word_count: 4,
        pangram_count: 1,
        by_letter: { k: 3, l: 1 },
        by_length: { '4': 2, '6': 1, '11': 1 },
        matrix: {
          k: { '4': 2, '11': 1 },
          l: { '6': 1 },
        },
        pangram_details: [{ length: 11, first_letter: 'k' }],
        suffixes: { inen: 1 },
      },
      new Set(['kana']),
      new Set(['a', 'e', 'i', 'k', 'l', 'n', 's']),
    );

    const { rerender } = render(
      <HintPanels hintsUnlocked={new Set()} onUnlock={onUnlock} hintData={hintData} />,
    );

    // Level 0: both tabs locked, matrix tab shows a single unlock button
    expect(screen.getByTestId('hint-words-counter')).toHaveTextContent('3/4');
    expect(screen.queryByTestId('upgrade-tier-button')).not.toBeInTheDocument();
    const activateBtn = screen.getByTestId('activate-hints-button');
    fireEvent.click(activateBtn);
    expect(onUnlock).toHaveBeenCalledWith('tier1');

    // Rerender with Tier 1 unlocked -> shows starting letters & next-level CTA
    rerender(
      <HintPanels hintsUnlocked={new Set(['tier1'])} onUnlock={onUnlock} hintData={hintData} />,
    );
    expect(screen.getByTestId('hint-content-tier1')).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-tier-button')).toHaveTextContent('Avaa seuraava taso');

    // Upgrade to Matrix Step 2 (tier3)
    fireEvent.click(screen.getByTestId('upgrade-tier-button'));
    expect(onUnlock).toHaveBeenCalledWith('tier3');

    // Rerender with Tier 3 unlocked -> shows full 2D matrix
    rerender(
      <HintPanels
        hintsUnlocked={new Set(['tier1', 'tier3'])}
        onUnlock={onUnlock}
        hintData={hintData}
      />,
    );
    expect(screen.getByTestId('hint-content-tier3')).toBeInTheDocument();
    // Matrix fully open: no further CTA and no status text on this tab
    expect(screen.queryByTestId('upgrade-tier-button')).not.toBeInTheDocument();

    // Switch to Vihjeet tab while it is still locked
    fireEvent.click(screen.getByTestId('tier-tab-2'));
    const activateHintsBtn = screen.getByTestId('activate-hints-button');
    fireEvent.click(activateHintsBtn);
    expect(onUnlock).toHaveBeenCalledWith('tier2');

    // Rerender with Tier 2 unlocked -> shows pangram clues
    rerender(
      <HintPanels
        hintsUnlocked={new Set(['tier1', 'tier2', 'tier3'])}
        onUnlock={onUnlock}
        hintData={hintData}
      />,
    );
    fireEvent.click(screen.getByTestId('tier-tab-2'));
    expect(screen.getByTestId('hint-content-tier2')).toHaveTextContent(/K\s*\(11\)/);
    expect(screen.getByTestId('upgrade-tier-button')).toHaveTextContent('Avaa seuraava taso');

    // Upgrade to Hints Step 2 (tier4)
    fireEvent.click(screen.getByTestId('upgrade-tier-button'));
    expect(onUnlock).toHaveBeenCalledWith('tier4');

    // Rerender with Tier 4 unlocked -> shows active suffixes
    rerender(
      <HintPanels
        hintsUnlocked={new Set(['tier1', 'tier2', 'tier3', 'tier4'])}
        onUnlock={onUnlock}
        hintData={hintData}
      />,
    );
    fireEvent.click(screen.getByTestId('tier-tab-4'));
    expect(screen.getByTestId('hint-content-tier4')).toHaveTextContent('-inen');
    expect(screen.queryByTestId('upgrade-tier-button')).not.toBeInTheDocument();

    // Hide toggle collapses the deck and persists the preference while keeping area reserved
    const deck = screen.getByTestId('hint-deck');
    expect(deck).toHaveStyle({ height: '172px' });
    fireEvent.click(screen.getByTestId('hide-hints-button'));
    expect(screen.queryByTestId('hint-content-tier4')).not.toBeInTheDocument();
    expect(screen.getByTestId('hint-words-counter')).toHaveTextContent('3/4');
    expect(deck).toHaveStyle({ height: '172px' });
    expect(window.localStorage.getItem('sanakenno_hints_hidden')).toBe('1');
    fireEvent.click(screen.getByTestId('show-hints-button'));
    expect(screen.getByTestId('hint-content-tier4')).toBeInTheDocument();
    expect(deck).toHaveStyle({ height: '172px' });
    expect(window.localStorage.getItem('sanakenno_hints_hidden')).toBe('0');
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

  it('triggers onShuffle when Space key is pressed and enabled', () => {
    const onShuffle = vi.fn();
    const onLetter = vi.fn();
    const onBackspace = vi.fn();
    const onEnter = vi.fn();
    const onEscape = vi.fn();

    renderHook(() =>
      useKeyboard({
        onShuffle,
        onLetter,
        onBackspace,
        onEnter,
        onEscape,
        enabled: true,
      }),
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(onShuffle).toHaveBeenCalledTimes(1);
    expect(onLetter).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    expect(onLetter).toHaveBeenCalledWith('k');
  });
});
