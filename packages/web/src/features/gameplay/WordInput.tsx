import { colorizeWord } from '@sanakenno/shared';

export interface WordInputProps {
  currentWord: string;
  center: string;
  allLetters: Set<string>;
  shake: boolean;
  allFound: boolean;
  wordCount?: number;
}

const COLOR_MAP: Record<string, string> = {
  accent: 'var(--color-accent)',
  primary: 'var(--color-text-primary)',
  tertiary: 'var(--color-text-tertiary)',
};

function fontSizeForWordLength(length: number): string {
  if (length <= 10) return '30px';
  if (length <= 13) return '25px';
  if (length <= 16) return '21px';
  return '18px';
}

export function WordInput({
  currentWord,
  center,
  allLetters,
  shake,
  allFound,
  wordCount,
}: WordInputProps): React.JSX.Element {
  if (allFound) {
    return (
      <div
        className="text-center text-lg font-semibold"
        style={{ color: 'var(--color-accent)' }}
        aria-live="polite"
        aria-atomic="true"
        data-testid="word-input"
      >
        Kaikki {wordCount} sanaa löydetty!
      </div>
    );
  }

  const chars = currentWord ? colorizeWord(currentWord, center, allLetters) : null;
  const fontSize = fontSizeForWordLength(currentWord.length);

  return (
    <div
      className={`flex items-center justify-center text-center font-semibold leading-none${shake ? ' word-shake' : ''}`}
      style={{
        fontFamily: 'var(--font-game)',
        fontSize,
        fontKerning: 'normal',
        letterSpacing: '0',
        minHeight: '38px',
        height: '38px',
      }}
      aria-live="polite"
      aria-atomic="true"
      data-testid="word-input"
    >
      {chars ? (
        chars.map((c, i) => (
          <span
            key={`${i}-${c.char}`}
            className="letter-pop"
            style={{
              color: COLOR_MAP[c.color],
              marginInline: '1px',
            }}
          >
            {c.char.toUpperCase()}
          </span>
        ))
      ) : (
        <span className="idle-character" style={{ color: 'var(--color-text-tertiary)' }}>
          |
        </span>
      )}
    </div>
  );
}
