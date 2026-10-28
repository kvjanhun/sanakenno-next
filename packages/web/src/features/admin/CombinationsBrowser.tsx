import { useCallback, useEffect, useState } from 'react';
import type { AdminCombinationItem } from '@sanakenno/shared';
import { adminGetCombinations } from '../../api/client.js';

interface CombinationsBrowserProps {
  csrfToken: string | null;
  onSelectLetters?: (letters: string) => void;
}

export function CombinationsBrowser({
  csrfToken,
  onSelectLetters,
}: CombinationsBrowserProps): React.JSX.Element {
  const [combinations, setCombinations] = useState<AdminCombinationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [requires, setRequires] = useState('');
  const [excludes, setExcludes] = useState('');
  const [inRotation, setInRotation] = useState('');
  const [sort, setSort] = useState('max_word_count');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const loadCombinations = useCallback(
    async (currentPage = page) => {
      if (!csrfToken) return;
      setLoading(true);
      setError(null);
      try {
        const res = (await adminGetCombinations(csrfToken, {
          requires,
          excludes,
          in_rotation: inRotation === '' ? undefined : Number(inRotation),
          sort,
          order,
          page: currentPage,
          per_page: 25,
        })) as { combinations: AdminCombinationItem[]; total: number; page: number; pages: number };

        setCombinations(res.combinations);
        setTotal(res.total);
        setPage(res.page);
        setPages(res.pages);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Yhdistelmien haku epäonnistui');
      } finally {
        setLoading(false);
      }
    },
    [csrfToken, requires, excludes, inRotation, sort, order, page],
  );

  useEffect(() => {
    void loadCombinations(1);
  }, [loadCombinations]);

  return (
    <div className="space-y-6 text-sm" style={{ color: 'var(--color-text-primary)' }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">7-kirjaimen yhdistelmät</h2>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Etsi ja selaa esilaskettuja pangrammiyhdistelmiä ({total} kpl)
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadCombinations(page)}
          disabled={loading}
          className="px-3 py-1.5 rounded text-xs border cursor-pointer"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        >
          {loading ? 'Päivitetään...' : 'Päivitä'}
        </button>
      </div>

      <div
        className="p-4 rounded-xl border space-y-3"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label
              htmlFor="filter-requires"
              className="block text-xs font-semibold uppercase mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Sisältää kirjaimet
            </label>
            <input
              id="filter-requires"
              type="text"
              placeholder="esim. s,k"
              value={requires}
              onChange={(e) => setRequires(e.target.value)}
              className="w-full px-3 py-1.5 rounded border text-sm"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="filter-excludes"
              className="block text-xs font-semibold uppercase mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Ei sisällä
            </label>
            <input
              id="filter-excludes"
              type="text"
              placeholder="esim. z,w"
              value={excludes}
              onChange={(e) => setExcludes(e.target.value)}
              className="w-full px-3 py-1.5 rounded border text-sm"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="filter-in-rotation"
              className="block text-xs font-semibold uppercase mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Kierrossa
            </label>
            <select
              id="filter-in-rotation"
              value={inRotation}
              onChange={(e) => setInRotation(e.target.value)}
              className="w-full px-3 py-1.5 rounded border text-sm cursor-pointer"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            >
              <option value="">Kaikki</option>
              <option value="1">Kyllä</option>
              <option value="0">Ei</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="filter-sort"
              className="block text-xs font-semibold uppercase mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Järjestys
            </label>
            <div className="flex gap-1">
              <select
                id="filter-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="w-full px-2 py-1.5 rounded border text-xs cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              >
                <option value="max_word_count">Sanoja (Max)</option>
                <option value="min_word_count">Sanoja (Min)</option>
                <option value="total_pangrams">Pangrammit</option>
                <option value="max_max_score">Pisteet (Max)</option>
                <option value="letters">Aakkosjärjestys</option>
              </select>
              <button
                type="button"
                onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
                className="px-2 py-1.5 rounded border text-xs font-bold cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              >
                {order === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="p-3 rounded-lg text-xs font-medium"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-error)',
            borderColor: 'var(--color-border)',
          }}
        >
          {error}
        </div>
      )}

      <div
        className="rounded-xl border overflow-x-auto"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border)',
        }}
      >
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--color-border)' }}>
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
                  className="border-b transition-colors hover:bg-black/5"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <td className="p-3 font-mono font-bold tracking-widest uppercase">{c.letters}</td>
                  <td className="p-3">{c.total_pangrams}</td>
                  <td className="p-3 font-mono">
                    {c.min_word_count} - {c.max_word_count}
                  </td>
                  <td className="p-3 font-mono">
                    {c.min_max_score} - {c.max_max_score}
                  </td>
                  <td className="p-3">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold"
                      style={{
                        backgroundColor: c.in_rotation
                          ? 'var(--color-accent)'
                          : 'var(--color-bg-primary)',
                        color: c.in_rotation
                          ? 'var(--color-bg-primary)'
                          : 'var(--color-text-secondary)',
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
                        className="px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer"
                        style={{
                          backgroundColor: 'var(--color-accent)',
                          color: 'var(--color-bg-primary)',
                        }}
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

      {pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Sivu {page} / {pages} (Yhteensä {total} kpl)
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => loadCombinations(page - 1)}
              className="px-3 py-1.5 rounded border text-xs cursor-pointer disabled:opacity-40"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            >
              Edellinen
            </button>
            <button
              type="button"
              disabled={page >= pages || loading}
              onClick={() => loadCombinations(page + 1)}
              className="px-3 py-1.5 rounded border text-xs cursor-pointer disabled:opacity-40"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            >
              Seuraava
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
