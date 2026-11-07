import { useMemo } from 'react';
import type { ArchiveEntry } from '@sanakenno/shared';
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon } from '../gameplay/icons.js';
import {
  formatFinnishMonth,
  getArchivePlayStatus,
  type ArchivePlayStatus,
} from './archiveStatus.js';

const WEEKDAYS = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];

export interface YearMonth {
  year: number;
  monthIndex: number;
}

export interface ArchiveCalendarProps {
  entries: ArchiveEntry[];
  selectedEntry: ArchiveEntry | null;
  currentPuzzleNumber: number | null;
  onSelectEntry: (entry: ArchiveEntry) => void;
  yearMonth: YearMonth;
  onYearMonthChange: (ym: YearMonth) => void;
  onJumpToToday: () => void;
  availableYearMonths: string[]; // sorted "YYYY-MM"
  todayYearMonthKey: string;
}

export function ArchiveCalendar({
  entries,
  selectedEntry,
  currentPuzzleNumber,
  onSelectEntry,
  yearMonth,
  onYearMonthChange,
  onJumpToToday,
  availableYearMonths,
  todayYearMonthKey,
}: ArchiveCalendarProps): React.JSX.Element {
  const currentKey = `${yearMonth.year}-${String(yearMonth.monthIndex + 1).padStart(2, '0')}`;
  const currentIndex = availableYearMonths.indexOf(currentKey);
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex !== -1 && currentIndex < availableYearMonths.length - 1;

  const entryByDate = useMemo(() => {
    const map = new Map<string, ArchiveEntry>();
    for (const e of entries) {
      map.set(e.date, e);
    }
    return map;
  }, [entries]);

  // Derive days in month and Monday-first offset
  const { daysInMonth, leadingEmptyCount } = useMemo(() => {
    const count = new Date(yearMonth.year, yearMonth.monthIndex + 1, 0).getDate();
    const firstDay = new Date(yearMonth.year, yearMonth.monthIndex, 1).getDay();
    const mondayFirst = (firstDay + 6) % 7;
    return { daysInMonth: count, leadingEmptyCount: mondayFirst };
  }, [yearMonth]);

  // Count played puzzles in current month
  const monthStats = useMemo(() => {
    let totalInMonth = 0;
    let playedInMonth = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${yearMonth.year}-${String(yearMonth.monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const entry = entryByDate.get(dateStr);
      if (entry) {
        totalInMonth++;
        const status = getArchivePlayStatus(entry.puzzle_number, entry.max_score);
        if (status.played) playedInMonth++;
      }
    }
    return { totalInMonth, playedInMonth };
  }, [daysInMonth, entryByDate, yearMonth]);

  const handlePrev = () => {
    if (!canGoPrev) return;
    const prevKey = availableYearMonths[currentIndex - 1];
    if (!prevKey) return;
    const [y, m] = prevKey.split('-').map(Number);
    if (y && m) onYearMonthChange({ year: y, monthIndex: m - 1 });
  };

  const handleNext = () => {
    if (!canGoNext) return;
    const nextKey = availableYearMonths[currentIndex + 1];
    if (!nextKey) return;
    const [y, m] = nextKey.split('-').map(Number);
    if (y && m) onYearMonthChange({ year: y, monthIndex: m - 1 });
  };

  const isViewingTodayMonth = currentKey === todayYearMonthKey;

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Month Navigator Header */}
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          aria-label="Edellinen kuukausi"
          onClick={handlePrev}
          disabled={!canGoPrev}
          className="h-8 w-8 rounded-lg flex items-center justify-center bg-transparent border-none cursor-pointer disabled:cursor-default disabled:opacity-30 transition-opacity"
          style={{ color: 'var(--color-text-primary)' }}
        >
          <ChevronLeftIcon size={18} />
        </button>

        <div className="flex flex-col items-center min-w-0">
          <span
            className="text-sm font-semibold truncate leading-tight"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {formatFinnishMonth(yearMonth.year, yearMonth.monthIndex)}
          </span>
          <span
            className="text-[11px] leading-tight mt-0.5"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {monthStats.playedInMonth} / {monthStats.totalInMonth} pelattu
          </span>
        </div>

        <div className="flex items-center gap-1">
          {!isViewingTodayMonth && (
            <button
              type="button"
              onClick={onJumpToToday}
              className="text-xs px-2 py-1 rounded-md border cursor-pointer font-medium"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-accent)',
              }}
            >
              Tänään
            </button>
          )}
          <button
            type="button"
            aria-label="Seuraava kuukausi"
            onClick={handleNext}
            disabled={!canGoNext}
            className="h-8 w-8 rounded-lg flex items-center justify-center bg-transparent border-none cursor-pointer disabled:cursor-default disabled:opacity-30 transition-opacity"
            style={{ color: 'var(--color-text-primary)' }}
          >
            <ChevronRightIcon size={18} />
          </button>
        </div>
      </div>

      {/* Weekdays Row */}
      <div className="grid grid-cols-7 gap-1 text-center" aria-hidden="true">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="text-[11px] font-semibold py-0.5"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Arkiston kalenteripäivät">
        {Array.from({ length: leadingEmptyCount }).map((_, i) => (
          <div key={`empty-${i}`} className="h-9 sm:h-10" aria-hidden="true" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const d = i + 1;
          const dateStr = `${yearMonth.year}-${String(yearMonth.monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const entry = entryByDate.get(dateStr);

          if (!entry) {
            return (
              <div
                key={dateStr}
                className="h-9 sm:h-10 flex items-center justify-center text-xs opacity-25 rounded-md"
                style={{ color: 'var(--color-text-tertiary)' }}
                aria-hidden="true"
              >
                {d}
              </div>
            );
          }

          const status: ArchivePlayStatus = getArchivePlayStatus(
            entry.puzzle_number,
            entry.max_score,
          );
          const isSelected = selectedEntry?.date === entry.date;
          const isCurrent = entry.puzzle_number === currentPuzzleNumber;

          return (
            <button
              key={dateStr}
              type="button"
              data-testid={`archive-entry-${entry.display_number}`}
              data-date={dateStr}
              aria-pressed={isSelected}
              aria-label={`${d}. ${formatFinnishMonth(yearMonth.year, yearMonth.monthIndex)}, Kenno #${entry.display_number}${entry.is_today ? ', tänään' : ''}${status.played ? `, ${status.rank}, ${status.wordsFound} sanaa` : ', ei pelattu'}`}
              onClick={() => onSelectEntry(entry)}
              className="h-9 sm:h-10 rounded-lg p-0.5 flex flex-col items-center justify-center relative cursor-pointer border-none transition-all"
              style={{
                backgroundColor: isSelected
                  ? 'var(--color-bg-primary)'
                  : status.isTopRank
                    ? 'color-mix(in srgb, var(--color-accent) 18%, var(--color-bg-primary))'
                    : 'var(--color-bg-primary)',
                boxShadow: isSelected
                  ? '0 0 0 2px var(--color-accent)'
                  : isCurrent
                    ? 'inset 0 0 0 1.5px var(--color-accent)'
                    : undefined,
              }}
            >
              <div className="flex items-center gap-0.5 leading-none">
                <span
                  className="text-xs font-semibold"
                  style={{
                    color: isSelected
                      ? 'var(--color-accent)'
                      : entry.is_today
                        ? 'var(--color-accent)'
                        : 'var(--color-text-primary)',
                  }}
                >
                  {d}
                </span>
                {status.isRevealed && (
                  <span
                    className="inline-block scale-75"
                    style={{ color: 'var(--color-accent)' }}
                    title="Paljastettu"
                  >
                    <EyeIcon size={12} />
                  </span>
                )}
              </div>

              {/* Day Status Indicators */}
              <div className="h-2 flex items-center justify-center mt-0.5 gap-0.5">
                {entry.is_today && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: 'var(--color-accent)' }}
                    title="Tämän päivän kenno"
                  />
                )}
                {status.played && !entry.is_today && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: status.isTopRank
                        ? 'var(--color-accent)'
                        : 'var(--color-text-tertiary)',
                    }}
                    title={status.rank ?? undefined}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
