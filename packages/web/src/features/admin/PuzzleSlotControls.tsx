import type { FormEvent } from 'react';
import type { VariationData } from '@sanakenno/shared';
import {
  ADMIN_CARD_CLASS,
  ADMIN_CARD_STYLE,
  ADMIN_INPUT_CLASS,
  ADMIN_INPUT_STYLE,
  ADMIN_NO_SPINNER_CLASS,
  adminButtonClass,
  adminButtonStyle,
} from './AdminPrimitives.js';
import { ManualPuzzleForm } from './ManualPuzzleForm.js';
import { VariationsGrid } from './VariationsGrid.js';

interface PuzzleSlotControlsProps {
  currentSlot: number | null;
  currentDisplayNumber: number | null;
  canGoFirst?: boolean;
  canGoPrev: boolean;
  canGoToday?: boolean;
  canGoNext: boolean;
  canGoLast?: boolean;
  totalPuzzles: number;
  variations: VariationData[];
  activeCenter: string;
  isActive: boolean;
  isDirty: boolean;
  saving: boolean;
  loading: boolean;
  jumpTarget: string;
  swapTarget: string;
  newLetters: string;
  newCenter: string;
  newSlot: number | '';
  forceRequired: boolean;
  currentForceRequired?: boolean;
  onJumpTargetChange: (val: string) => void;
  onSwapTargetChange: (val: string) => void;
  onFirst?: () => void;
  onPrev: () => void;
  onToday?: () => void;
  onNext: () => void;
  onLast?: () => void;
  onJump: (e: FormEvent) => void;
  onSwap: () => void;
  onCenterSelect: (center: string) => void;
  onSave: () => void;
  onForceSaveCurrent?: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onDeleteForm?: () => void;
  onReactivate: () => void;
  onToggleCreateMode: () => void;
  onNewLettersChange: (val: string) => void;
  onNewCenterChange: (val: string) => void;
  onNewSlotChange: (val: number | '') => void;
  onPreviewForm: () => void;
  onCreateForm: (force?: boolean) => void;
}

const navButtonClass =
  'px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium text-center whitespace-nowrap cursor-pointer border-none transition-colors disabled:opacity-35 disabled:cursor-not-allowed';

export function PuzzleSlotControls({
  currentSlot,
  currentDisplayNumber,
  canGoFirst = false,
  canGoPrev,
  canGoToday = false,
  canGoNext,
  canGoLast = false,
  totalPuzzles,
  variations,
  activeCenter,
  isActive,
  isDirty,
  saving,
  loading,
  jumpTarget,
  swapTarget,
  newLetters,
  newCenter,
  newSlot,
  forceRequired,
  currentForceRequired = false,
  onJumpTargetChange,
  onSwapTargetChange,
  onFirst,
  onPrev,
  onToday,
  onNext,
  onLast,
  onJump,
  onSwap,
  onCenterSelect,
  onSave,
  onForceSaveCurrent,
  onRestore,
  onDelete,
  onDeleteForm,
  onReactivate,
  onToggleCreateMode,
  onNewLettersChange,
  onNewCenterChange,
  onNewSlotChange,
  onPreviewForm,
  onCreateForm,
}: PuzzleSlotControlsProps): React.JSX.Element {
  return (
    <div className={`${ADMIN_CARD_CLASS} space-y-5`} style={ADMIN_CARD_STYLE}>
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm tabular-nums border"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
              borderColor: 'color-mix(in srgb, var(--color-accent) 30%, transparent)',
              color: 'var(--color-accent)',
            }}
          >
            {currentDisplayNumber ?? '#'}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className="text-base font-bold tracking-tight"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {currentDisplayNumber !== null
                  ? `Peli ${currentDisplayNumber} / ${totalPuzzles}`
                  : currentSlot !== null
                    ? `Poistettu peli (slotti ${currentSlot})`
                    : 'Ei valittua peliä'}
              </h2>
              {isDirty && (
                <span
                  className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    color: 'var(--color-on-accent)',
                  }}
                >
                  Muutoksia
                </span>
              )}
              {!isActive && currentSlot !== null && (
                <span
                  className="px-2 py-0.5 rounded-full text-[11px] font-semibold border"
                  style={adminButtonStyle('danger')}
                >
                  Poistettu kierrosta
                </span>
              )}
            </div>
            {currentSlot !== null && (
              <span
                className="text-xs tabular-nums"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Slotti {currentSlot}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleCreateMode}
          className={adminButtonClass('md')}
          style={adminButtonStyle('secondary', 'primary')}
        >
          + Uusi peli
        </button>
      </div>

      <div
        className="grid grid-cols-5 sm:inline-flex items-center gap-1 p-1 rounded-xl border w-full sm:w-auto"
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          borderColor: 'var(--color-border)',
        }}
      >
        {onFirst && (
          <button
            type="button"
            onClick={onFirst}
            disabled={!canGoFirst || loading}
            aria-label="Ensimmäinen peli"
            title="Ensimmäinen peli"
            className={navButtonClass}
            style={{ backgroundColor: 'transparent', color: 'var(--color-text-primary)' }}
          >
            |←<span className="hidden sm:inline"> Ensimmäinen</span>
          </button>
        )}
        <button
          type="button"
          onClick={onPrev}
          disabled={!canGoPrev || loading}
          aria-label="Edellinen peli"
          className={navButtonClass}
          style={{ backgroundColor: 'transparent', color: 'var(--color-text-primary)' }}
        >
          ←<span className="hidden sm:inline"> Edellinen</span>
        </button>
        {onToday && (
          <button
            type="button"
            onClick={onToday}
            disabled={!canGoToday || loading}
            aria-label="Tämän päivän peli"
            title="Tämän päivän peli"
            className={`${navButtonClass} font-semibold`}
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
              color: 'var(--color-accent)',
            }}
          >
            Tänään
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={!canGoNext || loading}
          aria-label="Seuraava peli"
          className={navButtonClass}
          style={{ backgroundColor: 'transparent', color: 'var(--color-text-primary)' }}
        >
          <span className="hidden sm:inline">Seuraava </span>→
        </button>
        {onLast && (
          <button
            type="button"
            onClick={onLast}
            disabled={!canGoLast || loading}
            aria-label="Viimeinen peli"
            title="Viimeinen peli"
            className={navButtonClass}
            style={{ backgroundColor: 'transparent', color: 'var(--color-text-primary)' }}
          >
            <span className="hidden sm:inline">Viimeinen </span>→|
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={onJump} className="flex items-center gap-1.5">
            <label htmlFor="jump-input" style={{ color: 'var(--color-text-secondary)' }}>
              Siirry:
            </label>
            <input
              id="jump-input"
              aria-label="Siirry pelinumeroon"
              type="number"
              min={1}
              max={totalPuzzles || 9999}
              placeholder="#"
              value={jumpTarget}
              onChange={(e) => onJumpTargetChange(e.target.value)}
              className={`w-20 px-2 text-center tabular-nums py-1 ${ADMIN_INPUT_CLASS} ${ADMIN_NO_SPINNER_CLASS}`}
              style={ADMIN_INPUT_STYLE}
            />
            <button
              type="submit"
              className={adminButtonClass('sm')}
              style={adminButtonStyle('secondary', 'primary')}
            >
              Siirry
            </button>
          </form>

          <div className="flex items-center gap-1.5">
            <label htmlFor="swap-input" style={{ color: 'var(--color-text-secondary)' }}>
              Vaihda pelin #:
            </label>
            <input
              id="swap-input"
              type="number"
              min={1}
              max={totalPuzzles || 9999}
              placeholder="#"
              value={swapTarget}
              onChange={(e) => onSwapTargetChange(e.target.value)}
              className={`w-20 px-2 text-center tabular-nums py-1 ${ADMIN_INPUT_CLASS} ${ADMIN_NO_SPINNER_CLASS}`}
              style={ADMIN_INPUT_STYLE}
            />
            <button
              type="button"
              onClick={onSwap}
              disabled={!swapTarget || loading}
              className={adminButtonClass('sm')}
              style={adminButtonStyle('secondary', 'primary')}
            >
              Vaihda
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isDirty && (
            <button
              type="button"
              onClick={onRestore}
              title="Kumoa muutokset"
              className={adminButtonClass('sm')}
              style={adminButtonStyle('secondary', 'primary')}
            >
              Kumoa muutokset
            </button>
          )}

          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty || saving}
            className={adminButtonClass('sm')}
            style={adminButtonStyle('primary')}
          >
            Tallenna muutokset
          </button>

          {currentForceRequired && onForceSaveCurrent && (
            <button
              type="button"
              onClick={onForceSaveCurrent}
              disabled={saving}
              className={adminButtonClass('sm')}
              style={adminButtonStyle('primary')}
            >
              Tallenna silti (Ohita varoitus)
            </button>
          )}

          {currentSlot !== null &&
            (isActive ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={saving}
                className={adminButtonClass('sm')}
                style={adminButtonStyle('danger')}
              >
                Poista kierrosta
              </button>
            ) : (
              <button
                type="button"
                onClick={onReactivate}
                disabled={saving}
                className={adminButtonClass('sm')}
                style={adminButtonStyle('primary')}
              >
                Palauta kiertoon
              </button>
            ))}
        </div>
      </div>

      <div className="space-y-2">
        <span
          className="block text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Keskuskirjaimen variaatiot (klikkaa vaihtaaksesi)
        </span>
        <VariationsGrid
          variations={variations}
          activeCenter={activeCenter}
          onSelect={onCenterSelect}
        />
      </div>

      <div className="pt-1">
        <ManualPuzzleForm
          newLetters={newLetters}
          newCenter={newCenter}
          newSlot={newSlot}
          saving={saving}
          forceRequired={forceRequired}
          onLettersChange={onNewLettersChange}
          onCenterChange={onNewCenterChange}
          onSlotChange={onNewSlotChange}
          onPreview={onPreviewForm}
          onCreate={onCreateForm}
          onDelete={
            typeof newSlot === 'number' && newSlot >= 0 ? (onDeleteForm ?? onDelete) : undefined
          }
        />
      </div>
    </div>
  );
}
