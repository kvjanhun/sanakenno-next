import { useEffect, useMemo } from 'react';
import { buildKotusUrl } from '@sanakenno/shared';
import {
  loadFromStorage,
  puzzleStateKey,
  revealedKey,
  setRawStorage,
} from '../gameplay/storage.js';
import { ModalShell } from './ModalShell.js';
import { usePuzzleWordsQuery } from './usePuzzleWordsQuery.js';

interface SavedGameState {
  foundWords?: string[];
}

export interface PuzzleWordsModalProps {
  show: boolean;
  onClose: () => void;
  onBack?: () => void;
  puzzleNumber: number | null;
  displayNumber?: number | null;
}

/**
 * Word list modal for past puzzles ("reveal answers").
 * Sets `revealed_<slot> = 'true'` in localStorage and renders found/missed words with Kotus links.
 */
export function PuzzleWordsModal({
  show,
  onClose,
  onBack,
  puzzleNumber,
  displayNumber,
}: PuzzleWordsModalProps): React.JSX.Element | null {
  const { data, isLoading, isError } = usePuzzleWordsQuery(puzzleNumber, show);

  const foundWords = useMemo(() => {
    if (!show || puzzleNumber === null) return new Set<string>();
    const saved = loadFromStorage<SavedGameState>(puzzleStateKey(puzzleNumber));
    return new Set<string>(saved?.foundWords ?? []);
  }, [puzzleNumber, show]);

  useEffect(() => {
    if (show && puzzleNumber !== null) {
      setRawStorage(revealedKey(puzzleNumber), 'true');
    }
  }, [puzzleNumber, show, data]);

  const sortedWords = useMemo(() => {
    if (!data?.words) return [];
    return [...data.words].sort((a, b) => a.localeCompare(b, 'fi'));
  }, [data]);

  if (!show || puzzleNumber === null) return null;

  const isWordFound = (word: string): boolean => {
    const normalized = word.toLowerCase().replace(/-/g, '');
    return foundWords.has(word) || foundWords.has(normalized);
  };

  const shownDisplayNumber = data?.display_number ?? displayNumber ?? puzzleNumber + 1;
  const foundCount = sortedWords.filter(isWordFound).length;

  return (
    <ModalShell
      show={show}
      title={`Kenno #${shownDisplayNumber}`}
      titleId="puzzle-words-title"
      onClose={onClose}
      onBack={onBack}
      onEscape={onBack ?? onClose}
      headerMeta={
        !isLoading && !isError ? (
          <span
            className="text-xs font-medium tabular-nums px-2 py-0.5 rounded-md border"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {foundCount}/{sortedWords.length} löydetty
          </span>
        ) : undefined
      }
    >
      {isLoading && (
        <div
          className="flex-1 text-sm py-4 text-center"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Ladataan...
        </div>
      )}

      {isError && (
        <div
          className="flex-1 text-sm py-4 text-center"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Sanalistaa ei voitu ladata.
        </div>
      )}

      {!isLoading && !isError && (
        <ul className="grid grid-cols-3 gap-x-3 gap-y-1.5 list-none p-0 m-0">
          {sortedWords.map((word) => {
            const found = isWordFound(word);
            return (
              <li
                key={word}
                data-word-found={found ? 'true' : 'false'}
                className="text-sm"
                style={{
                  color: found ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                  fontWeight: found ? 600 : 400,
                }}
              >
                <a
                  href={buildKotusUrl(word)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Avaa sanan "${word}" määritelmä Kotuksessa`}
                  className="hover:underline"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  {word}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </ModalShell>
  );
}
