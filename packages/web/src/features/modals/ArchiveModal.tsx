import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ArchiveEntry } from '@sanakenno/shared';
import { isPuzzleRevealed } from '../gameplay/storage.js';
import { ArchiveCalendar, type YearMonth } from './ArchiveCalendar.js';
import { ArchiveDayPanel } from './ArchiveDayPanel.js';
import { formatFinnishDate } from './archiveStatus.js';
import { ModalShell } from './ModalShell.js';
import { useArchiveQuery } from './useArchiveQuery.js';

export { formatFinnishDate };

export interface ArchiveModalProps {
  show: boolean;
  onClose: () => void;
  onSelectPuzzle: (puzzleNumber: number, date: string | null) => void;
  onRevealAnswers: (puzzleNumber: number, displayNumber: number) => void;
  currentPuzzleNumber: number | null;
}

export function ArchiveModal({
  show,
  onClose,
  onSelectPuzzle,
  onRevealAnswers,
  currentPuzzleNumber,
}: ArchiveModalProps): React.JSX.Element {
  const { data: entries = [], isLoading, isError } = useArchiveQuery(show);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [yearMonth, setYearMonth] = useState<YearMonth | null>(null);
  const [confirmReveal, setConfirmReveal] = useState(false);

  const todayEntry = useMemo(() => entries.find((e) => e.is_today) ?? null, [entries]);

  const chronologicalEntries = useMemo(() => {
    return [...entries].sort((a, b) => a.date.localeCompare(b.date));
  }, [entries]);

  const availableYearMonths = useMemo(() => {
    return Array.from(new Set(chronologicalEntries.map((e) => e.date.slice(0, 7)))).sort();
  }, [chronologicalEntries]);

  const todayYearMonthKey = useMemo(() => {
    return todayEntry ? todayEntry.date.slice(0, 7) : '';
  }, [todayEntry]);

  // Synchronize initial selection and active yearMonth when modal opens or entries load
  useEffect(() => {
    if (!show || entries.length === 0) return;

    setConfirmReveal(false);
    const initial =
      (currentPuzzleNumber !== null
        ? entries.find((e) => e.puzzle_number === currentPuzzleNumber)
        : null) ??
      todayEntry ??
      entries[0];

    if (initial) {
      setSelectedDate(initial.date);
      const [y, m] = initial.date.split('-').map(Number);
      if (y && m) setYearMonth({ year: y, monthIndex: m - 1 });
    }
  }, [show, entries, currentPuzzleNumber, todayEntry]);

  const selectedEntry = useMemo(() => {
    if (!selectedDate) return null;
    return entries.find((e) => e.date === selectedDate) ?? null;
  }, [entries, selectedDate]);

  const activeYearMonth: YearMonth = useMemo(() => {
    if (yearMonth) return yearMonth;
    if (selectedEntry) {
      const [y, m] = selectedEntry.date.split('-').map(Number);
      if (y && m) return { year: y, monthIndex: m - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  }, [yearMonth, selectedEntry]);

  const selectedIndex = useMemo(() => {
    if (!selectedEntry) return -1;
    return chronologicalEntries.findIndex((e) => e.date === selectedEntry.date);
  }, [chronologicalEntries, selectedEntry]);

  const canPrevDay = selectedIndex > 0;
  const canNextDay = selectedIndex !== -1 && selectedIndex < chronologicalEntries.length - 1;

  const handleSelectEntry = useCallback((entry: ArchiveEntry) => {
    setConfirmReveal(false);
    setSelectedDate(entry.date);
    const [y, m] = entry.date.split('-').map(Number);
    if (y && m) setYearMonth({ year: y, monthIndex: m - 1 });
  }, []);

  const handlePrevDay = useCallback(() => {
    if (!canPrevDay) return;
    const prev = chronologicalEntries[selectedIndex - 1];
    if (prev) handleSelectEntry(prev);
  }, [canPrevDay, chronologicalEntries, selectedIndex, handleSelectEntry]);

  const handleNextDay = useCallback(() => {
    if (!canNextDay) return;
    const next = chronologicalEntries[selectedIndex + 1];
    if (next) handleSelectEntry(next);
  }, [canNextDay, chronologicalEntries, selectedIndex, handleSelectEntry]);

  const handleJumpToToday = useCallback(() => {
    if (!todayEntry) return;
    handleSelectEntry(todayEntry);
  }, [todayEntry, handleSelectEntry]);

  const handlePlay = useCallback(
    (entry: ArchiveEntry) => {
      onSelectPuzzle(entry.puzzle_number, entry.is_today ? null : entry.date);
    },
    [onSelectPuzzle],
  );

  const handleReveal = useCallback(
    (entry: ArchiveEntry) => {
      if (isPuzzleRevealed(entry.puzzle_number)) {
        onRevealAnswers(entry.puzzle_number, entry.display_number);
        return;
      }
      setConfirmReveal(true);
    },
    [onRevealAnswers],
  );

  const handleConfirmReveal = useCallback(
    (entry: ArchiveEntry) => {
      setConfirmReveal(false);
      onRevealAnswers(entry.puzzle_number, entry.display_number);
    },
    [onRevealAnswers],
  );

  const handleEscape = useCallback(() => {
    if (confirmReveal) {
      setConfirmReveal(false);
    } else {
      onClose();
    }
  }, [confirmReveal, onClose]);

  return (
    <ModalShell
      show={show}
      title="Arkisto"
      titleId="archive-title"
      onClose={onClose}
      onEscape={handleEscape}
      className="flex flex-col"
      style={{ height: '85vh', maxHeight: '720px', overflowY: 'hidden' }}
      headerClassName="mb-2"
    >
      {isLoading ? (
        <div
          className="flex-1 text-sm py-8 text-center"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Ladataan...
        </div>
      ) : isError ? (
        <div
          className="flex-1 text-sm py-8 text-center"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Arkiston lataus epäonnistui.
        </div>
      ) : entries.length === 0 ? (
        <div
          className="flex-1 text-sm py-8 text-center"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Ei arkistoituja kennoja.
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5">
          <ArchiveCalendar
            entries={entries}
            selectedEntry={selectedEntry}
            currentPuzzleNumber={currentPuzzleNumber}
            onSelectEntry={handleSelectEntry}
            yearMonth={activeYearMonth}
            onYearMonthChange={setYearMonth}
            onJumpToToday={handleJumpToToday}
            availableYearMonths={availableYearMonths}
            todayYearMonthKey={todayYearMonthKey}
          />

          {selectedEntry && (
            <ArchiveDayPanel
              entry={selectedEntry}
              currentPuzzleNumber={currentPuzzleNumber}
              confirmReveal={confirmReveal}
              onPlay={handlePlay}
              onReveal={handleReveal}
              onConfirmReveal={handleConfirmReveal}
              onCancelConfirm={() => setConfirmReveal(false)}
              onPrevDay={handlePrevDay}
              onNextDay={handleNextDay}
              canPrevDay={canPrevDay}
              canNextDay={canNextDay}
            />
          )}
        </div>
      )}
    </ModalShell>
  );
}
