import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { STATS_STORAGE_KEY, type PlayerStats, type StatsRecord } from '@sanakenno/shared';
import { saveToStorage } from '../../packages/web/src/features/gameplay/storage.js';
import { StatsModal } from '../../packages/web/src/features/modals/StatsModal.js';

function createMockRecord(overrides: Partial<StatsRecord> = {}): StatsRecord {
  return {
    puzzle_number: 1,
    date: '2026-11-05',
    best_rank: 'Onnistuja',
    best_score: 50,
    max_score: 100,
    words_found: 10,
    hints_used: 0,
    elapsed_ms: 60000,
    is_daily: true,
    played_at_date: '2026-11-05',
    ...overrides,
  };
}

describe('StatsModal Achievements & Streak UI', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders tab buttons Yhteenveto and Saavutukset', () => {
    render(<StatsModal show={true} onClose={() => {}} />);

    expect(screen.getByRole('tab', { name: 'Yhteenveto' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Saavutukset' })).toBeInTheDocument();
  });

  it('switches view on clicking Saavutukset and lists all 6 achievement cards', () => {
    render(<StatsModal show={true} onClose={() => {}} />);

    const achievementsTab = screen.getByRole('tab', { name: 'Saavutukset' });
    fireEvent.click(achievementsTab);

    expect(screen.getByTestId('achievements-list')).toBeInTheDocument();

    const expectedTitles = [
      'Päivittäinen tapa',
      'Sanasampo',
      'Taitava #7',
      'Sanahirviö',
      'Täyteen, kiitos!',
      'Omin siivin',
    ];

    for (const title of expectedTitles) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it('displays progress bars, tier badge indicators, and completion states', () => {
    // Seed stats with completed streak (365 days)
    const stats: PlayerStats = {
      version: 1,
      records: [
        createMockRecord({
          puzzle_number: 1,
          words_found: 500, // Hopea
          is_daily: true,
        }),
      ],
    };
    saveToStorage(STATS_STORAGE_KEY, stats);

    render(<StatsModal show={true} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Saavutukset' }));

    // Card for total_words
    const wordsCard = screen.getByTestId('achievement-card-total_words');
    expect(wordsCard).toBeInTheDocument();
    // Hopea tier badge should be unlocked
    const hopeaBadge = wordsCard.querySelector('[data-tier-level="2"]');
    expect(hopeaBadge).toHaveAttribute('data-tier-unlocked', 'true');
    const kultaBadge = wordsCard.querySelector('[data-tier-level="3"]');
    expect(kultaBadge).toHaveAttribute('data-tier-unlocked', 'false');

    // All tier labels should be present in badges
    expect(screen.getAllByText('Pronssi').length).toBeGreaterThanOrEqual(6);
    expect(screen.getAllByText('Hopea').length).toBeGreaterThanOrEqual(6);
    expect(screen.getAllByText('Kulta').length).toBeGreaterThanOrEqual(6);
    expect(screen.getAllByText('Timantti').length).toBeGreaterThanOrEqual(6);
    expect(screen.getAllByText('Mestari').length).toBeGreaterThanOrEqual(6);
  });

  it('displays correct streak values in Yhteenveto derived from streak logic without archive inflation', () => {
    // 2 daily puzzles on consecutive days + 5 archive puzzles
    const records = [
      createMockRecord({ puzzle_number: 10, date: '2026-11-04', is_daily: true }),
      createMockRecord({ puzzle_number: 11, date: '2026-11-05', is_daily: true }),
      // Archive puzzles that should not inflate streak
      createMockRecord({ puzzle_number: 1, date: '2026-10-01', is_daily: false }),
      createMockRecord({ puzzle_number: 2, date: '2026-10-02', is_daily: false }),
      createMockRecord({ puzzle_number: 3, date: '2026-10-03', is_daily: false }),
    ];
    saveToStorage(STATS_STORAGE_KEY, { version: 1, records });

    render(<StatsModal show={true} onClose={() => {}} />);

    // In summary tab
    const summarySection = document.querySelector('[data-stats-all-summary]');
    expect(summarySection).not.toBeNull();
    // Putki should reflect 2, not 5
    expect(screen.getByText('Putki').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('Pisin putki').nextElementSibling?.textContent).toBe('2');
  });
});
