import { useCallback, useEffect, useState } from 'react';
import {
  adminDeletePuzzle,
  adminGetSlots,
  adminPreview,
  adminSavePuzzle,
  adminSwapPuzzles,
} from '../../api/client.js';
import { SuggestionPanel } from './SuggestionPanel.js';
import { useAdminStore } from './useAdminStore.js';

export function PuzzleEditor(): React.JSX.Element {
  const csrfToken = useAdminStore((s) => s.csrfToken);

  const [slot, setSlot] = useState<number | ''>('');
  const [letters, setLetters] = useState('');
  const [center, setCenter] = useState('');
  const [force, setForce] = useState(false);
  const [slotsList, setSlotsList] = useState<Array<{ slot: number; display_number: number }>>([]);
  const [swapSlotA, setSwapSlotA] = useState<number | ''>('');
  const [swapSlotB, setSwapSlotB] = useState<number | ''>('');

  const [preview, setPreview] = useState<{
    words: string[];
    max_score: number;
    hint_data: { word_count: number; pangram_count: number };
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forceRequired, setForceRequired] = useState(false);

  const loadSlots = useCallback(async () => {
    if (!csrfToken) return;
    try {
      const res = await adminGetSlots(csrfToken);
      setSlotsList(res.slots);
    } catch {
      // ignore
    }
  }, [csrfToken]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const handlePreview = async () => {
    if (!csrfToken || !letters || !center) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminPreview(csrfToken, { letters, center });
      setPreview(res as typeof preview);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Esikatselu epäonnistui');
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (overrideForce = false) => {
    if (!csrfToken || !letters || !center) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    const useForce = overrideForce || force;

    try {
      const payload: { slot?: number; letters: string; center: string; force?: boolean } = {
        letters,
        center,
        force: useForce,
      };
      if (typeof slot === 'number' && slot > 0) {
        payload.slot = slot;
      }
      await adminSavePuzzle(csrfToken, payload);
      setMessage('Peli tallennettu onnistuneesti!');
      setForceRequired(false);
      setForce(false);
      void loadSlots();
    } catch (err: unknown) {
      const requiresForce = (err as { requires_force?: boolean }).requires_force;
      if (requiresForce) {
        setForceRequired(true);
      }
      setError(err instanceof Error ? err.message : 'Tallennus epäonnistui');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!csrfToken || typeof slot !== 'number' || slot <= 0) return;
    if (!window.confirm(`Haluatko varmasti poistaa slotin ${slot}?`)) return;
    setLoading(true);
    setError(null);
    try {
      await adminDeletePuzzle(csrfToken, slot);
      setMessage(`Slotti ${slot} poistettu.`);
      setSlot('');
      setLetters('');
      setCenter('');
      setPreview(null);
      void loadSlots();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Poisto epäonnistui');
    } finally {
      setLoading(false);
    }
  };

  const handleSwap = async () => {
    if (!csrfToken || typeof swapSlotA !== 'number' || typeof swapSlotB !== 'number') return;
    setLoading(true);
    setError(null);
    try {
      await adminSwapPuzzles(csrfToken, swapSlotA, swapSlotB);
      setMessage(`Slotit ${swapSlotA} ja ${swapSlotB} vaihdettu keskenään!`);
      void loadSlots();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Vaihto epäonnistui');
    } finally {
      setLoading(false);
    }
  };

  const letterArray = Array.from(new Set(letters.toLowerCase().replace(/[^a-zåäö]/g, '')));

  return (
    <div className="space-y-6 text-sm" style={{ color: 'var(--color-text-primary)' }}>
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">Pelin luominen ja muokkaus</h2>
        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          Aktiivisia pelejä: {slotsList.length}
        </span>
      </div>

      {message && (
        <div
          className="p-3 rounded-lg text-xs font-medium"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-accent)',
            borderColor: 'var(--color-border)',
          }}
        >
          {message}
        </div>
      )}

      <SuggestionPanel
        csrfToken={csrfToken}
        onSelectSuggestion={(sLetters, sCenter) => {
          setLetters(sLetters);
          setCenter(sCenter);
          setSlot('');
          setError(null);
          setMessage(null);
          setForceRequired(false);
        }}
      />

      {error && (
        <div
          className="p-3 rounded-lg text-xs font-medium space-y-2"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-error)',
            borderColor: 'var(--color-border)',
          }}
        >
          <p>{error}</p>
          {forceRequired && (
            <button
              type="button"
              onClick={() => handleSave(true)}
              className="px-3 py-1 rounded text-xs font-semibold cursor-pointer"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-bg-primary)' }}
            >
              Luo silti (Ohita varoitus)
            </button>
          )}
        </div>
      )}

      <div
        className="p-4 rounded-xl space-y-4 border"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label
              htmlFor="puzzle-slot"
              className="block text-xs font-semibold uppercase mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Slotti (Valinnainen)
            </label>
            <input
              id="puzzle-slot"
              type="number"
              placeholder="Uusi slotti"
              value={slot}
              onChange={(e) => setSlot(e.target.value ? Number(e.target.value) : '')}
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
              htmlFor="puzzle-letters"
              className="block text-xs font-semibold uppercase mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Kirjaimet (7 kpl)
            </label>
            <input
              id="puzzle-letters"
              type="text"
              placeholder="esim. a,e,i,k,l,n,s"
              value={letters}
              onChange={(e) => {
                setLetters(e.target.value);
                setForceRequired(false);
              }}
              className="w-full px-3 py-1.5 rounded border text-sm font-mono"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="puzzle-center"
              className="block text-xs font-semibold uppercase mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Keskuskirjain
            </label>
            <input
              id="puzzle-center"
              type="text"
              maxLength={1}
              placeholder="esim. a"
              value={center}
              onChange={(e) => setCenter(e.target.value.toLowerCase())}
              className="w-full px-3 py-1.5 rounded border text-sm font-mono text-center"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>
        </div>

        {letterArray.length === 7 && (
          <div className="space-y-1">
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Valitse keskuskirjain nopeasti:
            </span>
            <div className="flex gap-2">
              {letterArray.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setCenter(ch)}
                  className="w-8 h-8 rounded text-sm font-bold uppercase cursor-pointer border"
                  style={{
                    backgroundColor:
                      center === ch ? 'var(--color-accent)' : 'var(--color-bg-primary)',
                    color: center === ch ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
                    borderColor: 'var(--color-border)',
                  }}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={handlePreview}
            disabled={loading || letterArray.length !== 7 || !center}
            className="px-4 py-2 rounded text-xs font-medium cursor-pointer disabled:opacity-50 border"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          >
            Esikatsele
          </button>
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={loading || letterArray.length !== 7 || !center}
            className="px-4 py-2 rounded text-xs font-semibold cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-bg-primary)' }}
          >
            Tallenna peli
          </button>
          {typeof slot === 'number' && slot > 0 && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="px-4 py-2 rounded text-xs font-medium cursor-pointer disabled:opacity-50 ml-auto"
              style={{ backgroundColor: 'var(--color-error)', color: 'var(--color-bg-primary)' }}
            >
              Poista peli
            </button>
          )}
        </div>
      </div>

      {preview && (
        <div
          className="p-4 rounded-xl space-y-3 border"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="flex justify-between items-center text-xs font-semibold">
            <span>Sanoja: {preview.hint_data.word_count}</span>
            <span>Maksimipisteet: {preview.max_score}</span>
            <span>Pangrammeja: {preview.hint_data.pangram_count}</span>
          </div>
          <div
            className="max-h-48 overflow-y-auto p-2 rounded text-xs flex flex-wrap gap-1.5"
            style={{ backgroundColor: 'var(--color-bg-primary)' }}
          >
            {preview.words.map((w) => (
              <span
                key={w}
                className="px-2 py-0.5 rounded border"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {w}
              </span>
            ))}
          </div>
        </div>
      )}

      <div
        className="p-4 rounded-xl space-y-3 border"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border)',
        }}
      >
        <h3 className="text-sm font-bold">Vaihda kahden pelin paikkaa (Swap)</h3>
        <div className="flex gap-3 items-center">
          <input
            type="number"
            placeholder="Slotti A"
            value={swapSlotA}
            onChange={(e) => setSwapSlotA(e.target.value ? Number(e.target.value) : '')}
            className="w-28 px-3 py-1.5 rounded border text-sm"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          />
          <span style={{ color: 'var(--color-text-secondary)' }}>↔</span>
          <input
            type="number"
            placeholder="Slotti B"
            value={swapSlotB}
            onChange={(e) => setSwapSlotB(e.target.value ? Number(e.target.value) : '')}
            className="w-28 px-3 py-1.5 rounded border text-sm"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          />
          <button
            type="button"
            onClick={handleSwap}
            disabled={loading || !swapSlotA || !swapSlotB}
            className="px-4 py-1.5 rounded text-xs font-medium cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-bg-primary)' }}
          >
            Vaihda
          </button>
        </div>
      </div>
    </div>
  );
}
