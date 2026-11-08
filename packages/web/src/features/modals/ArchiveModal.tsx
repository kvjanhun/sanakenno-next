import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [confirmEntry, setConfirmEntry] = useState<ArchiveEntry | null>(null);
  const preserveSelectionRef = useRef(false);
  const initializedForOpenRef = useRef(false);

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
    if (!show) {
      initializedForOpenRef.current = false;
      return;
    }
    if (entries.length === 0 || initializedForOpenRef.current) return;

    initializedForOpenRef.current = true;
    setConfirmEntry(null);

    if (preserveSelectionRef.current) {
      preserveSelectionRef.current = false;
      return;
    }

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
    setConfirmEntry(null);
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
        preserveSelectionRef.current = true;
        onRevealAnswers(entry.puzzle_number, entry.display_number);
        return;
      }
      setConfirmEntry(entry);
    },
    [onRevealAnswers],
  );

  const handleConfirmReveal = useCallback(() => {
    if (!confirmEntry) return;
    const target = confirmEntry;
    setConfirmEntry(null);
    preserveSelectionRef.current = true;
    onRevealAnswers(target.puzzle_number, target.display_number);
  }, [confirmEntry, onRevealAnswers]);

  const handleEscape = useCallback(() => {
    if (confirmEntry) {
      setConfirmEntry(null);
    } else {
      onClose();
    }
  }, [confirmEntry, onClose]);

  const activeYearMonthKey = `${activeYearMonth.year}-${String(activeYearMonth.monthIndex + 1).padStart(2, '0')}`;
  const showJumpToToday =
    entries.length > 0 &&
    ((todayYearMonthKey !== '' && activeYearMonthKey !== todayYearMonthKey) ||
      (selectedEntry !== null && !selectedEntry.is_today));

  return (
    <>
      <ModalShell
        show={show}
        title="Arkisto"
        titleId="archive-title"
        onClose={onClose}
        onEscape={handleEscape}
        headerMeta={
          showJumpToToday ? (
            <button
              type="button"
              onClick={handleJumpToToday}
              className="text-[11px] px-2.5 py-0.5 rounded-full border cursor-pointer font-semibold transition-opacity hover:opacity-90"
              style={{
                backgroundColor:
                  'color-mix(in srgb, var(--color-accent) 15%, var(--color-bg-primary))',
                borderColor: 'color-mix(in srgb, var(--color-accent) 45%, var(--color-border))',
                color: 'var(--color-accent)',
              }}
            >
              Tänään
            </button>
          ) : undefined
        }
      >
        {isLoading ? (
          <div className="text-sm py-6 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
            Ladataan...
          </div>
        ) : isError ? (
          <div className="text-sm py-6 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
            Arkiston lataus epäonnistui.
          </div>
        ) : entries.length === 0 ? (
          <div className="text-sm py-6 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
            Ei arkistoituja kennoja.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <ArchiveCalendar
              entries={entries}
              selectedEntry={selectedEntry}
              currentPuzzleNumber={currentPuzzleNumber}
              onSelectEntry={handleSelectEntry}
              yearMonth={activeYearMonth}
              onYearMonthChange={setYearMonth}
              availableYearMonths={availableYearMonths}
            />

            {selectedEntry && (
              <ArchiveDayPanel
                entry={selectedEntry}
                currentPuzzleNumber={currentPuzzleNumber}
                onPlay={handlePlay}
                onReveal={handleReveal}
                onPrevDay={handlePrevDay}
                onNextDay={handleNextDay}
                canPrevDay={canPrevDay}
                canNextDay={canNextDay}
              />
            )}
          </div>
        )}
      </ModalShell>

      {/* Pop-up selection dialog for unrevealed puzzle answer reveal */}
      {confirmEntry && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgb(0 0 0 / 0.5)' }}
          onClick={() => setConfirmEntry(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-reveal-title"
            aria-describedby="confirm-reveal-desc"
            className="w-full max-w-xs rounded-xl p-4 flex flex-col gap-3 shadow-xl"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1 text-center">
              <h3
                id="confirm-reveal-title"
                className="text-sm font-semibold"
                style={{ color: 'var(--color-text-primary)' }}
              >
                Paljastetaanko vastaukset?
              </h3>
              <p
                id="confirm-reveal-desc"
                className="text-xs leading-relaxed"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Vastauksien paljastamisen jälkeen tästä kennosta ei enää kerry tilastoja.
              </p>
            </div>

            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => setConfirmEntry(null)}
                className="flex-1 h-8 rounded-lg font-medium text-xs cursor-pointer border flex items-center justify-center transition-colors"
                style={{
                  backgroundColor: 'transparent',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              >
                Takaisin
              </button>
              <button
                type="button"
                onClick={handleConfirmReveal}
                className="flex-1 h-8 rounded-lg font-semibold text-xs cursor-pointer border-none flex items-center justify-center transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--color-on-accent)',
                }}
              >
                Paljasta vastaukset
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
