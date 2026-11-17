import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnouncementBanner } from '../../packages/web/src/features/gameplay/AnnouncementBanner.js';
import { MessageBar } from '../../packages/web/src/features/gameplay/MessageBar.js';
import { useUiStore } from '../../packages/web/src/features/gameplay/useUiStore.js';

describe('AnnouncementBanner & Unified Announcements (Spec 27)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUiStore.getState().resetUi();
  });

  afterEach(() => {
    useUiStore.getState().resetUi();
    vi.useRealTimers();
  });

  it('renders plain gameplay announcement with Sivuraita 4px left accent stripe and zero text truncation', () => {
    render(<AnnouncementBanner />);
    expect(screen.queryByTestId('announcement-banner')).not.toBeInTheDocument();

    act(() => {
      useUiStore.getState().enqueueAnnouncement({
        kind: 'gameplay',
        category: 'letter_cleared',
        badgeText: 'K',
        title: 'Kaikki K-alkuiset sanat löydetty!',
        metaPill: '7/7',
      });
    });

    const banner = screen.getByTestId('announcement-banner');
    expect(banner).toHaveAttribute('data-announcement-kind', 'gameplay');
    expect(banner).toHaveAttribute('data-announcement-category', 'letter_cleared');
    expect(banner.style.borderLeft).toContain('4px solid');
    expect(banner.style.borderLeft).toContain('var(--color-accent)');
    expect(banner.querySelector('polygon')).toBeNull();
    expect(banner.parentElement).toHaveStyle({ position: 'absolute', top: '100%' });

    const title = screen.getByTestId('announcement-title');
    expect(title).toHaveTextContent('Kaikki K-alkuiset sanat löydetty!');
    expect(title.className).not.toMatch(/\b(truncate|text-ellipsis|whitespace-nowrap)\b/);
    expect(screen.getByTestId('announcement-meta-pill')).toHaveTextContent('7/7');
  });

  it('renders achievement announcement with actual title on line 1, status on line 2, HexagonMedallion, tier token, and no truncation', () => {
    render(<AnnouncementBanner />);

    act(() => {
      useUiStore.getState().enqueueAnnouncement({
        kind: 'achievement',
        category: 'achievement_unlocked',
        achievementId: 'streak',
        title: 'Päivittäinen tapa',
        subtitle: 'Uusi saavutus · 7 päivää',
        tierKey: 'bronze',
        tierName: 'Pronssi',
      });
    });

    const banner = screen.getByTestId('announcement-banner');
    expect(banner).toHaveAttribute('data-announcement-kind', 'achievement');
    expect(banner.style.borderLeft).toContain('4px solid');
    expect(banner.style.borderLeft).toContain('var(--color-tier-bronze)');
    expect(banner.querySelector('polygon')).toBeInTheDocument();

    const title = screen.getByTestId('announcement-title');
    const subtitle = screen.getByTestId('announcement-subtitle');
    expect(title).toHaveTextContent('Päivittäinen tapa');
    expect(subtitle).toHaveTextContent('Uusi saavutus · 7 päivää');
    expect(title.className).not.toMatch(/\b(truncate|text-ellipsis|whitespace-nowrap)\b/);
    expect(subtitle.className).not.toMatch(/\b(truncate|text-ellipsis|whitespace-nowrap)\b/);
    expect(screen.getByTestId('announcement-tier-pill')).toHaveTextContent('Pronssi');
  });

  it('queues simultaneous announcements FIFO and promotes sequentially on click or timer expiry', () => {
    render(<AnnouncementBanner />);

    act(() => {
      useUiStore.getState().enqueueAnnouncement({
        kind: 'gameplay',
        category: 'letter_cleared',
        badgeText: 'L',
        title: 'Kaikki L-alkuiset sanat löydetty!',
        metaPill: '3/3',
      });
      useUiStore.getState().enqueueAnnouncement({
        kind: 'achievement',
        category: 'achievement_unlocked',
        achievementId: 'total_words',
        title: 'Sanasampo',
        subtitle: 'Uusi saavutus · 1 000 sanaa',
        tierKey: 'gold',
        tierName: 'Kulta',
      });
    });

    expect(screen.getByTestId('announcement-title')).toHaveTextContent(
      'Kaikki L-alkuiset sanat löydetty!',
    );

    // Click dismisses active banner and immediately promotes queued achievement
    fireEvent.click(screen.getByTestId('announcement-banner'));
    expect(screen.getByTestId('announcement-title')).toHaveTextContent('Sanasampo');
    expect(screen.getByTestId('announcement-tier-pill')).toHaveTextContent('Kulta');
    expect(screen.getByTestId('announcement-banner').style.borderLeft).toContain(
      'var(--color-tier-gold)',
    );
    expect(screen.getByTestId('announcement-banner').querySelector('polygon')).toBeInTheDocument();

    // Auto-dismisses after achievement duration (4500ms)
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(screen.queryByTestId('announcement-banner')).not.toBeInTheDocument();
  });

  it('suppresses AnnouncementBanner while showRanks dropdown is open', () => {
    render(<AnnouncementBanner />);

    act(() => {
      useUiStore.getState().enqueueAnnouncement({
        kind: 'gameplay',
        category: 'no_hint_milestone',
        badgeText: '50 %',
        title: 'Avuitta taitava',
        subtitle: '50 % pisteistä ilman apuja!',
        metaPill: '50 %',
      });
    });
    expect(screen.getByTestId('announcement-banner')).toBeInTheDocument();
    expect(screen.getByTestId('announcement-title')).toHaveTextContent('Avuitta taitava');
    expect(screen.getByTestId('announcement-subtitle')).toHaveTextContent(
      '50 % pisteistä ilman apuja!',
    );

    act(() => {
      useUiStore.getState().setShowRanks(true);
    });
    expect(screen.queryByTestId('announcement-banner')).not.toBeInTheDocument();

    act(() => {
      useUiStore.getState().setShowRanks(false);
    });
    expect(screen.getByTestId('announcement-banner')).toBeInTheDocument();
  });

  it('exposes window.sanakennoAnnounce for all console preview types and cleans up on unmount', () => {
    const { unmount } = render(<AnnouncementBanner />);
    expect(typeof window.sanakennoAnnounce).toBe('function');

    act(() => {
      window.sanakennoAnnounce?.('letter', 'S', 4);
    });
    expect(screen.getByTestId('announcement-title')).toHaveTextContent(
      'Kaikki S-alkuiset sanat löydetty!',
    );
    expect(screen.getByTestId('announcement-meta-pill')).toHaveTextContent('4/4');

    fireEvent.click(screen.getByTestId('announcement-banner'));
    act(() => {
      window.sanakennoAnnounce?.('achievement', 'total_words', 'gold');
    });
    expect(screen.getByTestId('announcement-title')).toHaveTextContent('Sanasampo');
    expect(screen.getByTestId('announcement-tier-pill')).toHaveTextContent('Kulta');

    fireEvent.click(screen.getByTestId('announcement-banner'));
    act(() => {
      window.sanakennoAnnounce?.('milestone', 50);
    });
    expect(screen.getByTestId('announcement-title')).toHaveTextContent('Avuitta taitava');
    expect(screen.getByTestId('announcement-subtitle')).toHaveTextContent(
      '50 % pisteistä ilman apuja!',
    );
    expect(screen.getByTestId('announcement-meta-pill')).toHaveTextContent('50 %');

    unmount();
    expect(window.sanakennoAnnounce).toBeUndefined();
  });

  it('keeps MessageBar for points, Pangrammi! secondary chip, and word validation errors', () => {
    const { rerender } = render(
      <MessageBar message="+18" type="ok" secondaryMessage="Pangrammi!" secondaryType="special" />,
    );
    expect(screen.getByTestId('message-bar')).toHaveTextContent('+18');
    expect(screen.getByTestId('message-bar')).toHaveTextContent('Pangrammi!');

    rerender(<MessageBar message="Kirjain 'A' puuttuu!" type="error" />);
    expect(screen.getByTestId('message-bar')).toHaveTextContent("Kirjain 'A' puuttuu!");
    expect(screen.getByTestId('message-bar')).not.toHaveTextContent('Pangrammi!');
  });
});
