import { List } from 'lucide-react';
import { ADMIN_CARD_STYLE } from './AdminPrimitives.js';
import { WordList } from './WordList.js';

interface AdminWordListPanelProps {
  words: string[];
  letters: string;
  maxScore?: number;
  loading: boolean;
  onBlock: (word: string) => void;
}

export function AdminWordListPanel({
  words,
  letters,
  maxScore,
  loading,
  onBlock,
}: AdminWordListPanelProps): React.JSX.Element {
  return (
    <section
      className="rounded-2xl border flex flex-col h-full overflow-hidden"
      style={ADMIN_CARD_STYLE}
    >
      <div
        className="flex items-start justify-between gap-3 p-4 border-b shrink-0"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
              borderColor: 'color-mix(in srgb, var(--color-accent) 30%, transparent)',
              color: 'var(--color-accent)',
            }}
          >
            <List size={16} strokeWidth={2} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Sanalista
            </h3>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Sallitut sanat. Klikkaa roskakoria estääksesi sanan.
            </p>
          </div>
        </div>

        {maxScore !== undefined && (
          <span
            className="px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums border shrink-0"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {maxScore} p
          </span>
        )}
      </div>

      <div className="p-4 flex-1 overflow-y-auto max-h-96 lg:max-h-[600px]">
        <WordList words={words} letters={letters} loading={loading} onBlock={onBlock} />
      </div>
    </section>
  );
}
