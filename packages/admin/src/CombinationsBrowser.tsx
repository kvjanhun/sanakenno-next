import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdminCombinationItem } from '@sanakenno/shared';
import { adminGetCombinations } from './api/admin-client.js';
import {
  ADMIN_CARD_CLASS,
  ADMIN_CARD_STYLE,
  ADMIN_INPUT_CLASS,
  ADMIN_INPUT_STYLE,
  ADMIN_TABLE_HEAD_ROW_CLASS,
  ADMIN_TABLE_HEAD_ROW_STYLE,
  ADMIN_TABLE_ROW_CLASS,
  ADMIN_TABLE_WRAPPER_CLASS,
  AdminAlert,
  AdminPageHeader,
  LetterTile,
  adminButtonClass,
  adminButtonStyle,
  useIsDesktop,
} from './AdminPrimitives.js';

interface CombinationsBrowserProps {
  csrfToken: string | null;
  onSelectLetters?: (letters: string) => void;
}

export function CombinationsBrowser({
  csrfToken,
  onSelectLetters,
}: CombinationsBrowserProps): React.JSX.Element {
  const isDesktop = useIsDesktop();
  const [page, setPage] = useState(1);
  const [requires, setRequires] = useState('');
  const [excludes, setExcludes] = useState('');
  const [inRotation, setInRotation] = useState('');
  const [sort, setSort] = useState('max_word_count');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const {
    data,
    isFetching: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: [
      'admin',
      'combinations',
      csrfToken,
      { requires, excludes, inRotation, sort, order, page },
    ],
    enabled: Boolean(csrfToken),
    queryFn: async () => {
      return (await adminGetCombinations(csrfToken!, {
        requires,
        excludes,
        in_rotation: inRotation === '' ? undefined : Number(inRotation),
        sort,
        order,
        page,
        per_page: 25,
      })) as {
        combinations: AdminCombinationItem[];
        total: number;
        page: number;
        pages: number;
      };
    },
  });

  const combinations = data?.combinations ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const error =
    queryError instanceof Error
      ? queryError.message
      : queryError
        ? 'Yhdistelmien haku epäonnistui'
        : null;

  return (
    <div className="space-y-6 text-sm" style={{ color: 'var(--color-text-primary)' }}>
      <AdminPageHeader
        title="7-kirjaimen yhdistelmät"
        subtitle={`Etsi ja selaa esilaskettuja pangrammiyhdistelmiä (${total} kpl)`}
        actions={
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={loading}
            className={adminButtonClass('md')}
            style={adminButtonStyle('secondary', 'secondary')}
          >
            {loading ? 'Päivitetään...' : 'Päivitä'}
          </button>
        }
      />

      <div className={`${ADMIN_CARD_CLASS} space-y-3`} style={ADMIN_CARD_STYLE}>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label
              htmlFor="filter-requires"
              className="block text-[11px] font-semibold uppercase tracking-wide mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Sisältää kirjaimet
            </label>
            <input
              id="filter-requires"
              type="text"
              placeholder="esim. s,k"
              value={requires}
              onChange={(e) => {
                setRequires(e.target.value);
                setPage(1);
              }}
              className={`w-full ${ADMIN_INPUT_CLASS}`}
              style={ADMIN_INPUT_STYLE}
            />
          </div>

          <div>
            <label
              htmlFor="filter-excludes"
              className="block text-[11px] font-semibold uppercase tracking-wide mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Ei sisällä
            </label>
            <input
              id="filter-excludes"
              type="text"
              placeholder="esim. z,w"
              value={excludes}
              onChange={(e) => {
                setExcludes(e.target.value);
                setPage(1);
              }}
              className={`w-full ${ADMIN_INPUT_CLASS}`}
              style={ADMIN_INPUT_STYLE}
            />
          </div>

          <div>
            <label
              htmlFor="filter-in-rotation"
              className="block text-[11px] font-semibold uppercase tracking-wide mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Kierrossa
            </label>
            <select
              id="filter-in-rotation"
              value={inRotation}
              onChange={(e) => {
                setInRotation(e.target.value);
                setPage(1);
              }}
              className={`w-full cursor-pointer ${ADMIN_INPUT_CLASS}`}
              style={ADMIN_INPUT_STYLE}
            >
              <option value="">Kaikki</option>
              <option value="1">Kyllä</option>
              <option value="0">Ei</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="filter-sort"
              className="block text-[11px] font-semibold uppercase tracking-wide mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Järjestys
            </label>
            <div className="flex gap-1.5">
              <select
                id="filter-sort"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
                className={`w-full text-xs cursor-pointer ${ADMIN_INPUT_CLASS}`}
                style={ADMIN_INPUT_STYLE}
              >
                <option value="max_word_count">Sanoja (Max)</option>
                <option value="min_word_count">Sanoja (Min)</option>
                <option value="total_pangrams">Pangrammit</option>
                <option value="max_max_score">Pisteet (Max)</option>
                <option value="letters">Aakkosjärjestys</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setOrder(order === 'asc' ? 'desc' : 'asc');
                  setPage(1);
                }}
                aria-label={order === 'asc' ? 'Nouseva järjestys' : 'Laskeva järjestys'}
                className={adminButtonClass('md')}
                style={adminButtonStyle('secondary', 'primary')}
              >
                {order === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <AdminAlert variant="error">{error}</AdminAlert>}

      {!isDesktop ? (
        <div className="space-y-2.5 tabular-nums">
          {combinations.length === 0 ? (
            <div
              className="p-4 rounded-xl border text-center text-xs"
              style={{ ...ADMIN_CARD_STYLE, color: 'var(--color-text-secondary)' }}
            >
              {loading ? 'Ladataan yhdistelmiä...' : 'Ei hakuehtoja vastaavia yhdistelmiä.'}
            </div>
          ) : (
            combinations.map((c) => (
              <div
                key={c.letters}
                className="p-3.5 rounded-xl border space-y-2.5"
                style={ADMIN_CARD_STYLE}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {Array.from(c.letters).map((ch) => (
                      <LetterTile key={ch} letter={ch} size="sm" />
                    ))}
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0"
                    style={{
                      backgroundColor: c.in_rotation
                        ? 'var(--color-accent)'
                        : 'var(--color-bg-primary)',
                      color: c.in_rotation
                        ? 'var(--color-on-accent)'
                        : 'var(--color-text-secondary)',
                      borderColor: c.in_rotation ? 'var(--color-accent)' : 'var(--color-border)',
                    }}
                  >
                    {c.in_rotation ? 'Kierrossa' : 'Ei kierrossa'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs">
                  <div style={{ color: 'var(--color-text-secondary)' }}>
                    <span>{c.total_pangrams} pg</span>
                    <span> · </span>
                    <span>
                      {c.min_word_count}–{c.max_word_count} sanaa
                    </span>
                    <span> · </span>
                    <span>
                      {c.min_max_score}–{c.max_max_score} p
                    </span>
                  </div>
                  {onSelectLetters && (
                    <button
                      type="button"
                      onClick={() => onSelectLetters(Array.from(c.letters).join(','))}
                      className={adminButtonClass('sm')}
                      style={adminButtonStyle('primary')}
                    >
                      Valitse
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className={ADMIN_TABLE_WRAPPER_CLASS} style={ADMIN_CARD_STYLE}>
          <table className="w-full text-left text-xs border-collapse tabular-nums">
            <thead>
              <tr className={ADMIN_TABLE_HEAD_ROW_CLASS} style={ADMIN_TABLE_HEAD_ROW_STYLE}>
                <th className="p-3">Kirjaimet</th>
                <th className="p-3">Pangrammit</th>
                <th className="p-3">Sanoja (Min - Max)</th>
                <th className="p-3">Pisteet (Min - Max)</th>
                <th className="p-3">Kierrossa</th>
                {onSelectLetters && <th className="p-3 text-right">Toiminto</th>}
              </tr>
            </thead>
            <tbody>
              {combinations.length === 0 ? (
                <tr>
                  <td
                    colSpan={onSelectLetters ? 6 : 5}
                    className="p-4 text-center"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {loading ? 'Ladataan yhdistelmiä...' : 'Ei hakuehtoja vastaavia yhdistelmiä.'}
                  </td>
                </tr>
              ) : (
                combinations.map((c) => (
                  <tr
                    key={c.letters}
                    className={ADMIN_TABLE_ROW_CLASS}
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {Array.from(c.letters).map((ch) => (
                          <LetterTile key={ch} letter={ch} size="sm" />
                        ))}
                      </div>
                    </td>
                    <td className="p-3 font-medium">{c.total_pangrams}</td>
                    <td className="p-3">
                      {c.min_word_count} - {c.max_word_count}
                    </td>
                    <td className="p-3">
                      {c.min_max_score} - {c.max_max_score}
                    </td>
                    <td className="p-3">
                      <span
                        className="px-2 py-0.5 rounded-full text-[11px] font-semibold border"
                        style={{
                          backgroundColor: c.in_rotation
                            ? 'var(--color-accent)'
                            : 'var(--color-bg-primary)',
                          color: c.in_rotation
                            ? 'var(--color-on-accent)'
                            : 'var(--color-text-secondary)',
                          borderColor: c.in_rotation
                            ? 'var(--color-accent)'
                            : 'var(--color-border)',
                        }}
                      >
                        {c.in_rotation ? 'Kyllä' : 'Ei'}
                      </span>
                    </td>
                    {onSelectLetters && (
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectLetters(Array.from(c.letters).join(','))}
                          className={adminButtonClass('sm')}
                          style={adminButtonStyle('primary')}
                        >
                          Valitse
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <div className="text-xs tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
            Sivu {page} / {pages} (Yhteensä {total} kpl)
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={adminButtonClass('md')}
              style={adminButtonStyle('secondary', 'secondary')}
            >
              Edellinen
            </button>
            <button
              type="button"
              disabled={page >= pages || loading}
              onClick={() => setPage((p) => p + 1)}
              className={adminButtonClass('md')}
              style={adminButtonStyle('secondary', 'secondary')}
            >
              Seuraava
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
