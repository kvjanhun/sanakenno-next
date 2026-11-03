import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RankProgress } from '../../packages/web/src/features/gameplay/RankProgress.js';

describe('RankProgress Component', () => {
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

  it('renders 0-100% total progress bar with high-contrast intermediate rank notches and companion blips', () => {
    const { container } = render(
      <RankProgress
        score={30}
        maxScore={150}
        rank="Nyt mennään!"
        showRanks={false}
        onToggleRanks={vi.fn()}
        scoreBeforeHints={30}
        hasUnlockedHints={false}
      />,
    );

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuenow', '30');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '150');

    // Total progress 30 / 150 = 20%
    const fill = screen.getByTestId('rank-progress-fill');
    expect(fill).toHaveStyle({ width: '20%' });

    // 5 High-contrast intermediate rank notches: 2%, 10%, 20%, 40%, 70% with 2px cuts
    const notch2 = screen.getByTestId('rank-notch-2');
    expect(notch2).toHaveAttribute('data-rank', 'Hyvä alku');
    expect(notch2).toHaveStyle({
      left: '2%',
      width: '2px',
      backgroundColor: 'var(--color-bg-primary)',
    });

    const notch10 = screen.getByTestId('rank-notch-10');
    expect(notch10).toHaveAttribute('data-rank', 'Nyt mennään!');
    expect(notch10).toHaveStyle({
      left: '10%',
      width: '2px',
      backgroundColor: 'var(--color-bg-primary)',
    });

    const notch20 = screen.getByTestId('rank-notch-20');
    expect(notch20).toHaveAttribute('data-rank', 'Onnistuja');
    expect(notch20).toHaveStyle({
      left: '20%',
      width: '2px',
      backgroundColor: 'var(--color-bg-primary)',
    });

    const notch40 = screen.getByTestId('rank-notch-40');
    expect(notch40).toHaveAttribute('data-rank', 'Sanavalmis');
    expect(notch40).toHaveStyle({
      left: '40%',
      width: '2px',
      backgroundColor: 'var(--color-bg-primary)',
    });

    const notch70 = screen.getByTestId('rank-notch-70');
    expect(notch70).toHaveAttribute('data-rank', 'Ällistyttävä');
    expect(notch70).toHaveStyle({
      left: '70%',
      width: '2px',
      backgroundColor: 'var(--color-bg-primary)',
    });

    // 3 unassisted milestone blips beside the bar (calm neutral tertiary styling when open)
    const blip25 = screen.getByTestId('milestone-pip-25');
    expect(blip25).toHaveAttribute('data-state', 'open');
    expect(blip25).toHaveStyle({ color: 'var(--color-text-tertiary)' });

    const blip50 = screen.getByTestId('milestone-pip-50');
    expect(blip50).toHaveAttribute('data-state', 'open');
    expect(blip50).toHaveStyle({ color: 'var(--color-text-tertiary)' });

    const blip70 = screen.getByTestId('milestone-pip-70');
    expect(blip70).toHaveAttribute('data-state', 'open');
    expect(blip70).toHaveStyle({ color: 'var(--color-text-tertiary)' });

    // In accordance with user requirement, no percentage text labels are rendered
    expect(container.textContent).not.toMatch(/25\s*%/);
    expect(container.textContent).not.toMatch(/50\s*%/);
    expect(container.textContent).not.toMatch(/70\s*%/);
    expect(container.textContent).not.toMatch(/100\s*%/);
  });

  it('renders unassisted summary at the top of the rank modal followed by the ranks list', () => {
    render(
      <RankProgress
        score={32}
        maxScore={186}
        rank="Nyt mennään!"
        showRanks={true}
        onToggleRanks={vi.fn()}
        scoreBeforeHints={32}
        hasUnlockedHints={false}
      />,
    );

    const panel = screen.getByTestId('rank-thresholds-panel');
    const noHintsSection = screen.getByTestId('rank-panel-no-hints');
    const ranksList = panel.querySelector('ul');

    expect(noHintsSection).toBeInTheDocument();
    expect(ranksList).toBeInTheDocument();

    // Verify order: noHintsSection comes BEFORE ranksList in DOM order
    expect(panel.firstElementChild).toBe(noHintsSection);
    expect(noHintsSection.compareDocumentPosition(ranksList!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('correctly handles unassisted blip state transitions (open, reached, lost)', () => {
    // Stage 1: Score reaches 25% milestone without hints
    const { rerender } = render(
      <RankProgress
        score={50}
        maxScore={100}
        rank="Sanavalmis"
        showRanks={false}
        onToggleRanks={vi.fn()}
        scoreBeforeHints={50}
        hasUnlockedHints={false}
      />,
    );

    // 25% (25 pts) and 50% (50 pts) reached, 70% (70 pts) open
    expect(screen.getByTestId('milestone-pip-25')).toHaveAttribute('data-state', 'reached');
    expect(screen.getByTestId('milestone-pip-50')).toHaveAttribute('data-state', 'reached');
    expect(screen.getByTestId('milestone-pip-70')).toHaveAttribute('data-state', 'open');

    // Stage 2: Hints unlocked after reaching 50% milestone
    rerender(
      <RankProgress
        score={50}
        maxScore={100}
        rank="Sanavalmis"
        showRanks={false}
        onToggleRanks={vi.fn()}
        scoreBeforeHints={50}
        hasUnlockedHints={true}
      />,
    );

    // Previously reached milestones stay reached; unreached 70% turns lost
    expect(screen.getByTestId('milestone-pip-25')).toHaveAttribute('data-state', 'reached');
    expect(screen.getByTestId('milestone-pip-50')).toHaveAttribute('data-state', 'reached');
    expect(screen.getByTestId('milestone-pip-70')).toHaveAttribute('data-state', 'lost');

    // Stage 3: Hints unlocked at start (scoreBeforeHints = 0)
    rerender(
      <RankProgress
        score={10}
        maxScore={100}
        rank="Nyt mennään!"
        showRanks={false}
        onToggleRanks={vi.fn()}
        scoreBeforeHints={0}
        hasUnlockedHints={true}
      />,
    );

    expect(screen.getByTestId('milestone-pip-25')).toHaveAttribute('data-state', 'lost');
    expect(screen.getByTestId('milestone-pip-50')).toHaveAttribute('data-state', 'lost');
    expect(screen.getByTestId('milestone-pip-70')).toHaveAttribute('data-state', 'lost');
  });
});
