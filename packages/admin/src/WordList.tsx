import { useMemo } from 'react';
import { compareFinnishAlphabetically, isPangram } from '@sanakenno/shared';
import { Trash2 } from 'lucide-react';

interface WordListProps {
  words: string[];
  letters: string;
  loading: boolean;
  onBlock: (word: string) => void;
}

export function WordList({ words, letters, loading, onBlock }: WordListProps): React.JSX.Element {
  const sorted = useMemo(() => [...words].sort(compareFinnishAlphabetically), [words]);
  const letterSet = useMemo(
    () => new Set(letters.toLowerCase().replace(/[^a-zåäö]/g, '')),
    [letters],
  );
  const pangramCount = useMemo(
    () => (letterSet.size === 7 ? sorted.filter((w) => isPangram(w, letterSet)).length : 0),
    [sorted, letterSet],
  );

  if (loading) {
    return (
      <div className="text-sm py-4 text-center" style={{ color: 'var(--color-text-secondary)' }}>
        Ladataan sanoja...
      </div>
    );
  }

  if (words.length === 0) {
    return (
      <div className="text-sm py-4 text-center" style={{ color: 'var(--color-text-secondary)' }}>
        Ei sanoja
      </div>
    );
  }

  return (
    <div>
      <div
        className="text-xs mb-3 font-medium tabular-nums"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {words.length} sanaa, {pangramCount} pangrammia
      </div>
      <div
        className="grid gap-x-3 gap-y-1 text-xs"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))',
        }}
      >
        {sorted.map((word) => {
          const pg = letterSet.size === 7 && isPangram(word, letterSet);
          return (
            <div key={word} className="flex items-center gap-1.5 group py-0.5 min-w-0">
              <button
                type="button"
                onClick={() => onBlock(word)}
                className="inline-flex h-5 w-5 items-center justify-center rounded-md opacity-35 group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer transition-opacity shrink-0"
                style={{
                  color: 'var(--color-error)',
                  background: 'none',
                  border: 'none',
                }}
                title={`Estä "${word}"`}
                aria-label={`Estä ${word}`}
              >
                <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
              </button>
              <span
                style={{
                  color: pg ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  fontWeight: pg ? 700 : 400,
                }}
              >
                {word}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
