// @vitest-environment jsdom
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FoundWords } from '../../packages/web/src/features/gameplay/FoundWords.js';
import { Honeycomb } from '../../packages/web/src/features/gameplay/Honeycomb.js';
import { useKeyboard } from '../../packages/web/src/features/gameplay/useKeyboard.js';
import { WordInput } from '../../packages/web/src/features/gameplay/WordInput.js';

describe('Gameplay Input, Lemmas & Honeycomb A11y', () => {
  it('FoundWords renders canonical hyphenated lemmas in collapsed and expanded views while preserving highlight', () => {
    const allLetters = new Set(['a', 'm', 'u', 'n', 'i', 'e', 's']);
    const { rerender } = render(
      <FoundWords
        foundWords={['aamuuninen']}
        recentWords={['aamuuninen']}
        showAll={false}
        allLetters={allLetters}
        onToggleShowAll={vi.fn()}
        lastResubmittedWord="aamuuninen"
      />,
    );

    const collapsedLink = screen.getByRole('link', { name: /aamu-uninen/i });
    expect(collapsedLink).toHaveTextContent('aamu-uninen');
    expect(collapsedLink).toHaveAttribute('href', expect.stringContaining('aamu-uninen'));
    expect(collapsedLink).toHaveStyle({ backgroundColor: 'var(--color-accent)' });

    rerender(
      <FoundWords
        foundWords={['aamuuninen']}
        recentWords={['aamuuninen']}
        showAll={true}
        allLetters={allLetters}
        onToggleShowAll={vi.fn()}
        lastResubmittedWord="aamuuninen"
      />,
    );

    const expandedLink = screen.getByRole('link', { name: /aamu-uninen/i });
    expect(expandedLink).toHaveTextContent('aamu-uninen');
    expect(expandedLink.closest('li')).toHaveStyle({ color: 'var(--color-accent)' });
  });

  it('WordInput scales font size down for long words while keeping fixed 38px height', () => {
    const allLetters = new Set(['a', 'e', 'i', 'k', 'l', 'n', 's']);
    const { rerender } = render(
      <WordInput
        currentWord="kansa"
        center="a"
        allLetters={allLetters}
        shake={false}
        allFound={false}
      />,
    );
    expect(screen.getByTestId('word-input')).toHaveStyle({ fontSize: '30px', height: '38px' });

    rerender(
      <WordInput
        currentWord="kansallisaikakausi"
        center="a"
        allLetters={allLetters}
        shake={false}
        allFound={false}
      />,
    );
    expect(screen.getByTestId('word-input')).toHaveStyle({ fontSize: '18px', height: '38px' });
  });

  it('useKeyboard accepts å and ignores Enter/Space when an interactive button has focus', () => {
    const onLetter = vi.fn();
    const onEnter = vi.fn();
    const onShuffle = vi.fn();

    renderHook(() =>
      useKeyboard({
        onLetter,
        onBackspace: vi.fn(),
        onEnter,
        onShuffle,
        onEscape: vi.fn(),
        enabled: true,
      }),
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'å' }));
    expect(onLetter).toHaveBeenCalledWith('å');

    const btn = document.createElement('button');
    document.body.appendChild(btn);
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(onEnter).not.toHaveBeenCalled();
    expect(onShuffle).not.toHaveBeenCalled();
    btn.remove();
  });

  it('Honeycomb exposes 7 focusable role="button" cells and activates via Enter/Space', () => {
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

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(7);

    const centerCell = screen.getByRole('button', { name: 'Keskuskirjain A' });
    expect(centerCell).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(centerCell, { key: 'Enter' });
    expect(onLetterPress).toHaveBeenCalledWith('a');

    const outerCell = screen.getByRole('button', { name: 'Kirjain K' });
    fireEvent.keyDown(outerCell, { key: ' ' });
    expect(onLetterPress).toHaveBeenCalledWith('k');
  });
});
