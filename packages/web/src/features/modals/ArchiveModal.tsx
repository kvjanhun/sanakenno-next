import { useCallback, useEffect, useMemo, useState } from 'react';
import { rankForScore, type ArchiveEntry } from '@sanakenno/shared';
import { EyeIcon } from '../gameplay/icons.js';
import { isPuzzleRevealed, loadFromStorage, puzzleStateKey } from '../gameplay/storage.js';
import { ArchiveActionSheet, formatFinnishDate } from './ArchiveActionSheet.js';
import { ModalShell } from './ModalShell.js';
import { useArchiveQuery } from './useArchiveQuery.js';

interface PersistedStateSubset {
  score: number;
  foundWords: string[];
}

interface PlayStatus {
  played: boolean;
  rank: string | null;
  score: number;
  wordsFound: number;
}

export interface ArchiveModalProps {
  show: boolean;
  onClose: () => void;
  onSelectPuzzle: (puzzleNumber: number, date: string | null) => void;
  onRevealAnswers: (puzzleNumber: number, displayNumber: number) => void;
  currentPuzzleNumber: number | null;
}

const PAST_PAGE_SIZE = 8;

function getPlayStatus(puzzleNumber: number, maxScore: number): PlayStatus {
  const data = loadFromStorage<PersistedStateSubset>(puzzleStateKey(puzzleNumber));
  if (!data || !Array.isArray(data.foundWords) || data.foundWords.length === 0) {
    return { played: false, rank: null, score: 0, wordsFound: 0 };
  }
  return {
    played: true,
    rank: rankForScore(data.score, maxScore),
    score: data.score,
    wordsFound: data.foundWords.length,
  };
}

/**
 * Archive modal displaying `display_number`, completion status from localStorage,
 * past puzzle selection, and answer reveal confirmation.
 */
export function ArchiveModal({
  show,
  onClose,
  onSelectPuzzle,
  onRevealAnswers,
  currentPuzzleNumber,
}: ArchiveModalProps): React.JSX.Element {
  const { data: entries = [], isLoading, isError } = useArchiveQuery(show);
  const [page, setPage] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<ArchiveEntry | null>(null);
  const [confirmReveal, setConfirmReveal] = useState(false);

  useEffect(() => {
    if (show) {
      setSelectedEntry(null);
      setConfirmReveal(false);
    }
  }, [show]);

  const todayEntry = useMemo(() => entries.find((entry) => entry.is_today) ?? null, [entries]);
  const pastEntries = useMemo(() => entries.filter((entry) => !entry.is_today), [entries]);
  const pageCount = Math.max(1, Math.ceil(pastEntries.length / PAST_PAGE_SIZE));
  const visiblePastEntries = pastEntries.slice(
    page * PAST_PAGE_SIZE,
    page * PAST_PAGE_SIZE + PAST_PAGE_SIZE,
  );

  const revealedPuzzles = useMemo(() => {
    if (!show) return new Set<number>();
    const set = new Set<number>();
    for (const entry of entries) {
      if (isPuzzleRevealed(entry.puzzle_number)) {
        set.add(entry.puzzle_number);
      }
    }
    return set;
  }, [entries, show]);

  useEffect(() => {
    if (page < pageCount) return;
    setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  const handleEscape = useCallback(() => {
    if (selectedEntry) setSelectedEntry(null);
    else onClose();
  }, [selectedEntry, onClose]);

  const handleEntryClick = useCallback(
    (entry: ArchiveEntry) => {
      setConfirmReveal(false);
      if (entry.is_today) {
        onSelectPuzzle(entry.puzzle_number, null);
        return;
      }
      setSelectedEntry(entry);
    },
    [onSelectPuzzle],
  );

  const closeActionSheet = useCallback(() => {
    setConfirmReveal(false);
    setSelectedEntry(null);
  }, []);

  const handlePlay = useCallback(() => {
    if (!selectedEntry) return;
    const entry = selectedEntry;
    setSelectedEntry(null);
    onSelectPuzzle(entry.puzzle_number, entry.date);
  }, [selectedEntry, onSelectPuzzle]);

  const handleReveal = useCallback(() => {
    if (!selectedEntry) return;
    const { puzzle_number: slot, display_number: displayNum } = selectedEntry;
    if (!revealedPuzzles.has(slot)) {
      setConfirmReveal(true);
      return;
    }
    setSelectedEntry(null);
    onRevealAnswers(slot, displayNum);
  }, [revealedPuzzles, selectedEntry, onRevealAnswers]);

  const handleConfirmReveal = useCallback(() => {
    if (!selectedEntry) return;
    const { puzzle_number: slot, display_number: displayNum } = selectedEntry;
    setConfirmReveal(false);
    setSelectedEntry(null);
    onRevealAnswers(slot, displayNum);
  }, [selectedEntry, onRevealAnswers]);

  return (
    <>
      <ModalShell
        show={show}
        title="Arkisto"
        titleId="archive-title"
        onClose={onClose}
        onEscape={handleEscape}
        className="flex flex-col"
        style={{ height: '80vh', overflowY: 'hidden' }}
        headerClassName="mb-3"
        trapFocus={!selectedEntry}
      >
        {isLoading ? (
          <div
            className="flex-1 text-sm py-4 text-center"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Ladataan...
          </div>
        ) : isError ? (
          <div
            className="flex-1 text-sm py-4 text-center"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Arkiston lataus epäonnistui.
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col space-y-3">
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
              {[...(todayEntry ? [todayEntry] : []), ...visiblePastEntries].map((entry) => {
                const status = getPlayStatus(entry.puzzle_number, entry.max_score);
                const isCurrent = entry.puzzle_number === currentPuzzleNumber;
                const isRevealed = revealedPuzzles.has(entry.puzzle_number);

                return (
                  <button
                    key={entry.date}
                    type="button"
                    data-testid={`archive-entry-${entry.display_number}`}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left cursor-pointer border-none"
                    style={{
                      backgroundColor: entry.is_today ? 'var(--color-bg-secondary)' : 'transparent',
                      boxShadow: isCurrent ? 'inset 0 0 0 2px var(--color-accent)' : undefined,
                    }}
                    onClick={() => handleEntryClick(entry)}
                  >
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-sm font-medium"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {formatFinnishDate(entry.date)}
                        {entry.is_today && (
                          <span className="ml-1.5 text-xs" style={{ color: 'var(--color-accent)' }}>
                            tänään
                          </span>
                        )}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        Kenno #{entry.display_number}
                      </div>
                    </div>

                    <div
                      className="flex items-baseline gap-0.5 text-xs font-[var(--font-mono)]"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {entry.letters.map((l, i) => (
                        <span
                          key={i}
                          style={{
                            color:
                              l === entry.center
                                ? 'var(--color-accent)'
                                : 'var(--color-text-secondary)',
                            fontWeight: l === entry.center ? 700 : 400,
                          }}
                        >
                          {l.toUpperCase()}
                        </span>
                      ))}
                    </div>

                    <div className="shrink-0 w-24 flex items-center justify-end gap-1.5 text-xs">
                      {isRevealed && (
                        <span
                          aria-label="Vastaukset paljastettu"
                          title="Vastaukset paljastettu"
                          style={{ color: 'var(--color-accent)' }}
                        >
                          <EyeIcon />
                        </span>
                      )}
                      {status.played && (
                        <span
                          className="min-w-0 text-right"
                          title={`${status.wordsFound} sanaa, ${status.rank}`}
                          aria-label={`${status.rank}, ${status.wordsFound} sanaa`}
                        >
                          <span className="block truncate" style={{ color: 'var(--color-accent)' }}>
                            {status.rank}
                          </span>
                          <span className="block" style={{ color: 'var(--color-text-tertiary)' }}>
                            {status.wordsFound} sanaa
                          </span>
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {pageCount > 1 && (
              <div className="flex items-center justify-between gap-2 pt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 rounded-md border bg-transparent text-sm cursor-pointer disabled:cursor-default"
                  style={{
                    color: page === 0 ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
                    borderColor: 'var(--color-border)',
                    opacity: page === 0 ? 0.5 : 1,
                  }}
                >
                  Edellinen
                </button>
                <span
                  className="text-xs"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  aria-label={`Sivu ${page + 1} / ${pageCount}`}
                >
                  {page + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
                  disabled={page >= pageCount - 1}
                  className="px-3 py-1.5 rounded-md border bg-transparent text-sm cursor-pointer disabled:cursor-default"
                  style={{
                    color:
                      page >= pageCount - 1
                        ? 'var(--color-text-tertiary)'
                        : 'var(--color-text-primary)',
                    borderColor: 'var(--color-border)',
                    opacity: page >= pageCount - 1 ? 0.5 : 1,
                  }}
                >
                  Seuraava
                </button>
              </div>
            )}
          </div>
        )}
      </ModalShell>

      <ArchiveActionSheet
        show={show && selectedEntry !== null}
        entry={selectedEntry}
        isRevealed={selectedEntry ? revealedPuzzles.has(selectedEntry.puzzle_number) : false}
        confirmReveal={confirmReveal}
        onPlay={handlePlay}
        onReveal={handleReveal}
        onConfirmReveal={handleConfirmReveal}
        onCancelConfirm={() => setConfirmReveal(false)}
        onClose={closeActionSheet}
      />
    </>
  );
}
