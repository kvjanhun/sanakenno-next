interface ManualPuzzleFormProps {
  newLetters: string;
  newCenter: string;
  newSlot: number | '';
  saving: boolean;
  forceRequired: boolean;
  onLettersChange: (val: string) => void;
  onCenterChange: (val: string) => void;
  onSlotChange: (val: number | '') => void;
  onPreview: () => void;
  onCreate: (force?: boolean) => void;
  onDelete?: () => void;
}

export function ManualPuzzleForm({
  newLetters,
  newCenter,
  newSlot,
  saving,
  forceRequired,
  onLettersChange,
  onCenterChange,
  onSlotChange,
  onPreview,
  onCreate,
  onDelete,
}: ManualPuzzleFormProps): React.JSX.Element {
  const letterChars = Array.from(new Set(newLetters.toLowerCase().replace(/[^a-zåäö]/g, '')));

  return (
    <div
      className="p-4 rounded-xl border space-y-4"
      style={{
        backgroundColor: 'var(--color-bg-primary)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
          Luo tai muokkaa peliä käsin
        </h3>
        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {letterChars.length}/7 kirjainta
        </span>
      </div>

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
            value={newSlot}
            onChange={(e) => onSlotChange(e.target.value ? Number(e.target.value) : '')}
            className="w-full px-3 py-1.5 rounded border text-sm"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
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
            value={newLetters}
            onChange={(e) => onLettersChange(e.target.value)}
            className="w-full px-3 py-1.5 rounded border text-sm font-mono"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
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
            placeholder="Keskus"
            value={newCenter}
            onChange={(e) => onCenterChange(e.target.value.toLowerCase())}
            className="w-full px-3 py-1.5 rounded border text-sm font-mono text-center uppercase"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          />
        </div>
      </div>

      {letterChars.length === 7 && (
        <div className="space-y-1">
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            Valitse keskuskirjain:
          </span>
          <div className="flex gap-1.5">
            {letterChars.map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => onCenterChange(ch)}
                className="w-8 h-8 rounded text-xs font-bold uppercase cursor-pointer border transition-colors"
                style={{
                  backgroundColor:
                    newCenter === ch ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                  color: newCenter === ch ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
                  borderColor: 'var(--color-border)',
                }}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onPreview}
          disabled={saving || letterChars.length !== 7 || !newCenter}
          className="px-4 py-1.5 rounded text-xs font-medium cursor-pointer disabled:opacity-50 border"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        >
          Esikatsele
        </button>

        <button
          type="button"
          onClick={() => onCreate(false)}
          disabled={saving || letterChars.length !== 7 || !newCenter}
          className="px-4 py-1.5 rounded text-xs font-semibold cursor-pointer disabled:opacity-50"
          style={{
            backgroundColor: 'var(--color-accent)',
            color: 'var(--color-bg-primary)',
          }}
        >
          Tallenna peli
        </button>

        {forceRequired && (
          <button
            type="button"
            onClick={() => onCreate(true)}
            disabled={saving}
            className="px-3 py-1.5 rounded text-xs font-semibold cursor-pointer"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-bg-primary)',
            }}
          >
            Luo silti (Ohita varoitus)
          </button>
        )}

        {typeof newSlot === 'number' && newSlot >= 0 && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer disabled:opacity-50 ml-auto"
            style={{
              backgroundColor: 'var(--color-error)',
              color: 'var(--color-bg-primary)',
            }}
          >
            Poista peli
          </button>
        )}
      </div>
    </div>
  );
}
