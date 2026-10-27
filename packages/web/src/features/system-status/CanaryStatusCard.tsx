import { useSystemHealth } from './useSystemHealth.js';

/**
 * Canary component proving the Kysely -> Hono RPC -> TanStack Query -> React 19 pipeline.
 */
export function CanaryStatusCard() {
  const { data, isLoading, isError } = useSystemHealth();

  return (
    <section
      aria-label="Järjestelmän tila"
      className="mx-auto mt-12 max-w-md rounded-2xl border p-6 shadow-sm"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      <h1 className="text-xl font-bold">Sanakenno 2.0 — Työpöytä</h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Agenttinatiivi kehitysympäristö (Kysely + Hono RPC + React 19)
      </p>

      <div className="mt-4 text-sm" data-testid="canary-status">
        {isLoading && <span>Tarkistetaan yhteyttä...</span>}
        {isError && <span>Virhe yhdistettäessä palvelimeen.</span>}
        {data && (
          <ul className="space-y-1">
            <li>
              Tila: <strong>{data.status}</strong>
            </li>
            <li>
              Tietokantamoottori: <strong>{data.engine}</strong>
            </li>
            <li>
              Aktiivisia sanakennoja:{' '}
              <strong data-testid="puzzle-count">{data.total_puzzles}</strong>
            </li>
            <li>
              Aikavyöhyke: <strong>{data.timezone}</strong>
            </li>
          </ul>
        )}
      </div>
    </section>
  );
}
