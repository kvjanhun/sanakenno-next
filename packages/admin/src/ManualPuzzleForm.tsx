import {
  ADMIN_INPUT_CLASS,
  ADMIN_SUBCARD_CLASS,
  ADMIN_SUBCARD_STYLE,
  adminButtonClass,
  adminButtonStyle,
} from './AdminPrimitives.js';

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

const fieldStyle = {
  backgroundColor: 'var(--color-bg-secondary)',
  borderColor: 'var(--color-border)',
  color: 'var(--color-text-primary)',
};

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
    <div className={`${ADMIN_SUBCARD_CLASS} space-y-4`} style={ADMIN_SUBCARD_STYLE}>
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
          Luo tai muokkaa peliä käsin
        </h3>
        <span
          className="text-xs font-medium tabular-nums"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {letterChars.length}/7 kirjainta
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label
            htmlFor="puzzle-slot"
            className="block text-[11px] font-semibold uppercase tracking-wide mb-1"
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
            className={`w-full tabular-nums ${ADMIN_INPUT_CLASS}`}
            style={fieldStyle}
          />
        </div>

        <div>
          <label
            htmlFor="puzzle-letters"
            className="block text-[11px] font-semibold uppercase tracking-wide mb-1"
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
            className={`w-full ${ADMIN_INPUT_CLASS}`}
            style={fieldStyle}
          />
        </div>

        <div>
          <label
            htmlFor="puzzle-center"
            className="block text-[11px] font-semibold uppercase tracking-wide mb-1"
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
            className={`w-full text-center font-bold uppercase ${ADMIN_INPUT_CLASS}`}
            style={{ ...fieldStyle, fontFamily: 'var(--font-game)' }}
          />
        </div>
      </div>

      {letterChars.length === 7 && (
        <div className="space-y-1.5">
          <span
            className="block text-xs font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Valitse keskuskirjain:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {letterChars.map((ch) => {
              const selected = newCenter === ch;
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => onCenterChange(ch)}
                  className="w-8 h-8 rounded-lg text-xs font-bold uppercase cursor-pointer border transition-all"
                  style={{
                    fontFamily: 'var(--font-game)',
                    backgroundColor: selected ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                    color: selected ? 'var(--color-on-accent)' : 'var(--color-text-primary)',
                    borderColor: selected ? 'var(--color-accent)' : 'var(--color-border)',
                  }}
                >
                  {ch}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onPreview}
          disabled={saving || letterChars.length !== 7 || !newCenter}
          className={adminButtonClass('md')}
          style={adminButtonStyle('secondary', 'secondary')}
        >
          Esikatsele
        </button>

        <button
          type="button"
          onClick={() => onCreate(false)}
          disabled={saving || letterChars.length !== 7 || !newCenter}
          className={adminButtonClass('md')}
          style={adminButtonStyle('primary')}
        >
          Tallenna peli
        </button>

        {forceRequired && (
          <button
            type="button"
            onClick={() => onCreate(true)}
            disabled={saving}
            className={adminButtonClass('md')}
            style={adminButtonStyle('primary')}
          >
            Luo silti (Ohita varoitus)
          </button>
        )}

        {typeof newSlot === 'number' && newSlot >= 0 && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className={`${adminButtonClass('md')} ml-auto`}
            style={adminButtonStyle('danger')}
          >
            Poista peli
          </button>
        )}
      </div>
    </div>
  );
}
