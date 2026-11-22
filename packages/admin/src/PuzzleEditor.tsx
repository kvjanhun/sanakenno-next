import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { VariationData } from '@sanakenno/shared';
import { AdminAlert } from './AdminPrimitives.js';
import { AdminWordListPanel } from './AdminWordListPanel.js';
import { PuzzleSlotControls } from './PuzzleSlotControls.js';
import { SuggestionPanel } from './SuggestionPanel.js';
import { useAdminStore } from './useAdminStore.js';
import {
  usePuzzleEditorQueries,
  type PreviewTargetParams,
  type PuzzleTargetParams,
} from './usePuzzleEditorQueries.js';

interface PuzzleEditorProps {
  prefillLetters?: string | null;
  onPrefillConsumed?: () => void;
}

export function PuzzleEditor({
  prefillLetters,
  onPrefillConsumed,
}: PuzzleEditorProps = {}): React.JSX.Element {
  const csrfToken = useAdminStore((s) => s.csrfToken);

  const [targetPuzzle, setTargetPuzzle] = useState<PuzzleTargetParams | null>(null);
  const [previewTarget, setPreviewTarget] = useState<PreviewTargetParams | null>(null);

  const [currentSlot, setCurrentSlot] = useState<number | null>(null);
  const [currentDisplayNumber, setCurrentDisplayNumber] = useState<number | null>(null);
  const [prevSlot, setPrevSlot] = useState<number | null>(null);
  const [nextSlot, setNextSlot] = useState<number | null>(null);
  const [totalPuzzles, setTotalPuzzles] = useState(0);
  const [savedLetters, setSavedLetters] = useState('');
  const [savedCenter, setSavedCenter] = useState('');
  const [activeLetters, setActiveLetters] = useState('');
  const [activeCenter, setActiveCenter] = useState('');
  const [variations, setVariations] = useState<VariationData[]>([]);
  const [isActive, setIsActive] = useState(true);

  const [jumpTarget, setJumpTarget] = useState('');
  const [swapTarget, setSwapTarget] = useState('');
  const [newLetters, setNewLetters] = useState('');
  const [newCenter, setNewCenter] = useState('');
  const [newSlot, setNewSlot] = useState<number | ''>('');

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error' | 'warning' | null>(null);
  const [currentForceRequired, setCurrentForceRequired] = useState(false);
  const [formForceRequired, setFormForceRequired] = useState(false);

  const {
    slotsQuery,
    puzzleQuery,
    previewQuery,
    saveMutation,
    deleteMutation,
    swapMutation,
    blockWordMutation,
    saving,
  } = usePuzzleEditorQueries(csrfToken, targetPuzzle, previewTarget);

  const activeSlots = slotsQuery.data?.slots ?? [];
  const todaySlot = slotsQuery.data?.todaySlot ?? null;

  useEffect(() => {
    if (!slotsQuery.data) return;
    setTotalPuzzles(slotsQuery.data.totalPuzzles);
    if (targetPuzzle === null && slotsQuery.data.slots.length > 0) {
      const initialSlot = slotsQuery.data.todaySlot ?? slotsQuery.data.slots[0]!;
      setTargetPuzzle({ slot: initialSlot });
    }
  }, [slotsQuery.data, targetPuzzle]);

  useEffect(() => {
    const data = puzzleQuery.data;
    if (!data) return;
    setCurrentSlot(data.slot);
    setCurrentDisplayNumber(data.display_number);
    setPrevSlot(data.prev_slot);
    setNextSlot(data.next_slot);
    setTotalPuzzles(data.total_puzzles);
    const lStr = data.letters.join(',');
    setSavedLetters(lStr);
    setSavedCenter(data.center);
    setActiveLetters(lStr);
    setActiveCenter(data.center);
    setVariations(data.variations);
    setIsActive(data.is_active);
    setCurrentForceRequired(false);
    setJumpTarget(data.display_number !== null ? String(data.display_number) : '');
    setPreviewTarget({
      letters: data.letters,
      lettersKey: lStr,
      center: data.center,
    });
  }, [puzzleQuery.data]);

  useEffect(() => {
    if (!puzzleQuery.error) return;
    setStatusMessage(
      puzzleQuery.error instanceof Error ? puzzleQuery.error.message : 'Pelin lataus epäonnistui',
    );
    setStatusType('error');
  }, [puzzleQuery.error]);

  useEffect(() => {
    if (!prefillLetters) return;
    setNewLetters(prefillLetters);
    setNewCenter('');
    setNewSlot('');
    setFormForceRequired(false);
    onPrefillConsumed?.();
  }, [prefillLetters, onPrefillConsumed]);

  const isDirty = activeLetters !== savedLetters || activeCenter !== savedCenter;
  const words = previewQuery.data?.words ?? [];
  const wordsLetters = previewTarget?.lettersKey ?? '';
  const wordsLoading = previewQuery.isFetching;
  const loading = puzzleQuery.isFetching;

  const handleCenterSelect = (center: string) => {
    setActiveCenter(center);
    setCurrentForceRequired(false);
    setPreviewTarget({
      letters: activeLetters,
      lettersKey: activeLetters,
      center,
    });
  };

  const handleRestore = () => {
    setActiveLetters(savedLetters);
    setActiveCenter(savedCenter);
    setCurrentForceRequired(false);
    setPreviewTarget({
      letters: savedLetters,
      lettersKey: savedLetters,
      center: savedCenter,
    });
  };

  const handleSaveCurrent = async (force = false) => {
    if (!csrfToken || currentSlot === null) return;
    setStatusMessage(null);
    try {
      await saveMutation.mutateAsync({
        slot: currentSlot,
        letters: activeLetters,
        center: activeCenter,
        force,
      });
      setStatusMessage('Peli tallennettu onnistuneesti!');
      setStatusType('success');
      setCurrentForceRequired(false);
      setTargetPuzzle({ slot: currentSlot });
    } catch (err: unknown) {
      const reqForce = (err as { requires_force?: boolean }).requires_force;
      if (reqForce) setCurrentForceRequired(true);
      setStatusMessage(err instanceof Error ? err.message : 'Tallennus epäonnistui');
      setStatusType('error');
    }
  };

  const handleJump = (e: FormEvent) => {
    e.preventDefault();
    const target = parseInt(jumpTarget, 10);
    if (!Number.isInteger(target) || target < 1 || target > totalPuzzles) {
      setStatusMessage(`Anna pelinumero 1-${totalPuzzles}`);
      setStatusType('warning');
      return;
    }
    setTargetPuzzle({ display_number: target });
  };

  const handleSwap = async () => {
    if (!csrfToken || currentSlot === null) return;
    const targetDisp = parseInt(swapTarget, 10);
    if (
      !Number.isInteger(targetDisp) ||
      targetDisp < 1 ||
      targetDisp > totalPuzzles ||
      targetDisp === currentDisplayNumber
    ) {
      setStatusMessage(`Anna vaihtopelin numero 1-${totalPuzzles} (ei nykyinen)`);
      setStatusType('warning');
      return;
    }
    const targetSlot = activeSlots[targetDisp - 1];
    if (targetSlot === undefined || targetSlot === currentSlot) return;

    try {
      await swapMutation.mutateAsync({ slotA: currentSlot, slotB: targetSlot });
      setStatusMessage('Pelit vaihdettu keskenään onnistuneesti!');
      setStatusType('success');
      setSwapTarget('');
      setTargetPuzzle({ slot: targetSlot });
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : 'Vaihto epäonnistui');
      setStatusType('error');
    }
  };

  const handleDelete = async (targetSlot: number) => {
    if (!csrfToken) return;
    if (!window.confirm(`Haluatko varmasti poistaa slotin ${targetSlot}?`)) return;

    setStatusMessage(null);
    try {
      const refreshed = await deleteMutation.mutateAsync(targetSlot);
      setStatusMessage(`Slotti ${targetSlot} poistettu.`);
      setStatusType('success');
      if (targetSlot === newSlot) {
        setNewSlot('');
      }
      if (refreshed && refreshed.slots.length > 0) {
        setTargetPuzzle({ slot: refreshed.slots[0] });
      } else {
        setTargetPuzzle(null);
        setPreviewTarget(null);
        setCurrentSlot(null);
        setCurrentDisplayNumber(null);
        setVariations([]);
      }
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : 'Poisto epäonnistui');
      setStatusType('error');
    }
  };

  const handleReactivate = async () => {
    if (!csrfToken || currentSlot === null) return;
    try {
      await saveMutation.mutateAsync({
        slot: currentSlot,
        letters: activeLetters,
        center: activeCenter,
        force: true,
      });
      setStatusMessage('Peli palautettu onnistuneesti kiertoon!');
      setStatusType('success');
      setTargetPuzzle({ slot: currentSlot });
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : 'Palautus epäonnistui');
      setStatusType('error');
    }
  };

  const handlePreviewForm = () => {
    if (!csrfToken || !newLetters || !newCenter) return;
    setPreviewTarget({
      letters: newLetters,
      lettersKey: newLetters,
      center: newCenter,
    });
  };

  const savePuzzlePayload = async (
    payload: { slot?: number; letters: string; center: string; force?: boolean },
    successMessage: (res: { slot: number; display_number: number }) => string,
  ): Promise<void> => {
    if (!csrfToken) return;
    setStatusMessage(null);
    try {
      const res = await saveMutation.mutateAsync(payload);
      setStatusMessage(successMessage(res));
      setStatusType('success');
      setFormForceRequired(false);
      setTargetPuzzle({ slot: res.slot });
    } catch (err: unknown) {
      const reqForce = (err as { requires_force?: boolean }).requires_force;
      if (reqForce) {
        setFormForceRequired(true);
        if (payload.slot === undefined) {
          setNewLetters(payload.letters);
          setNewCenter(payload.center);
          setNewSlot('');
        }
      }
      setStatusMessage(err instanceof Error ? err.message : 'Tallennus epäonnistui');
      setStatusType('error');
      throw err;
    }
  };

  const handleSaveForm = async (overrideForce = false) => {
    if (!newLetters || !newCenter) return;
    const payload: { slot?: number; letters: string; center: string; force?: boolean } = {
      letters: newLetters,
      center: newCenter,
      force: overrideForce || formForceRequired,
    };
    if (typeof newSlot === 'number' && newSlot >= 0) {
      payload.slot = newSlot;
    }
    await savePuzzlePayload(payload, () => 'Peli tallennettu onnistuneesti!').catch(
      () => undefined,
    );
  };

  const handleAddSuggestion = async (letters: string, center: string): Promise<void> => {
    await savePuzzlePayload({ letters, center }, (res) => {
      setNewLetters('');
      setNewCenter('');
      setNewSlot('');
      return `Ehdotettu peli lisätty kiertoon (peli #${res.display_number}, slotti ${res.slot})!`;
    });
  };

  const handleBlockWord = async (word: string) => {
    if (!csrfToken) return;
    if (!window.confirm(`Estä sana "${word}" pysyvästi?`)) return;
    try {
      await blockWordMutation.mutateAsync(word);
      setStatusMessage(`Sana "${word}" estetty.`);
      setStatusType('success');
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : 'Sanan esto epäonnistui');
      setStatusType('error');
    }
  };

  return (
    <div className="space-y-6 text-sm" style={{ color: 'var(--color-text-primary)' }}>
      {statusMessage && (
        <AdminAlert variant={statusType ?? 'success'} role="alert">
          {statusMessage}
        </AdminAlert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          <PuzzleSlotControls
            currentSlot={currentSlot}
            currentDisplayNumber={currentDisplayNumber}
            canGoFirst={activeSlots.length > 0 && currentSlot !== activeSlots[0]}
            canGoPrev={prevSlot !== null}
            canGoToday={todaySlot !== null && currentSlot !== todaySlot}
            canGoNext={nextSlot !== null}
            canGoLast={
              activeSlots.length > 0 && currentSlot !== activeSlots[activeSlots.length - 1]
            }
            totalPuzzles={totalPuzzles}
            variations={variations}
            activeCenter={activeCenter}
            isActive={isActive}
            isDirty={isDirty}
            saving={saving}
            loading={loading}
            jumpTarget={jumpTarget}
            swapTarget={swapTarget}
            newLetters={newLetters}
            newCenter={newCenter}
            newSlot={newSlot}
            forceRequired={formForceRequired}
            currentForceRequired={currentForceRequired}
            onJumpTargetChange={setJumpTarget}
            onSwapTargetChange={setSwapTarget}
            onFirst={() => {
              if (activeSlots.length > 0) setTargetPuzzle({ slot: activeSlots[0] });
            }}
            onPrev={() => {
              if (prevSlot !== null) setTargetPuzzle({ slot: prevSlot });
            }}
            onToday={() => {
              if (todaySlot !== null) setTargetPuzzle({ slot: todaySlot });
            }}
            onNext={() => {
              if (nextSlot !== null) setTargetPuzzle({ slot: nextSlot });
            }}
            onLast={() => {
              if (activeSlots.length > 0) {
                setTargetPuzzle({ slot: activeSlots[activeSlots.length - 1] });
              }
            }}
            onJump={handleJump}
            onSwap={() => void handleSwap()}
            onCenterSelect={handleCenterSelect}
            onSave={() => void handleSaveCurrent(false)}
            onForceSaveCurrent={() => void handleSaveCurrent(true)}
            onRestore={handleRestore}
            onDelete={() => {
              if (currentSlot !== null) void handleDelete(currentSlot);
            }}
            onDeleteForm={
              typeof newSlot === 'number' && newSlot >= 0
                ? () => void handleDelete(newSlot)
                : undefined
            }
            onReactivate={() => void handleReactivate()}
            onToggleCreateMode={() => {
              setNewLetters('');
              setNewCenter('');
              setNewSlot('');
              setFormForceRequired(false);
              setStatusMessage(null);
            }}
            onNewLettersChange={setNewLetters}
            onNewCenterChange={setNewCenter}
            onNewSlotChange={setNewSlot}
            onPreviewForm={handlePreviewForm}
            onCreateForm={(force) => void handleSaveForm(force)}
          />

          <SuggestionPanel
            csrfToken={csrfToken}
            onAddSuggestion={handleAddSuggestion}
            onPreviewSuggestion={(sLetters, sCenter) => {
              setNewLetters(sLetters);
              setNewCenter(sCenter);
              setNewSlot('');
              setFormForceRequired(false);
              setStatusMessage(null);
              setPreviewTarget({
                letters: sLetters,
                lettersKey: sLetters,
                center: sCenter,
              });
            }}
          />
        </div>

        <div className="lg:col-span-5 flex flex-col">
          <AdminWordListPanel
            words={words}
            letters={wordsLetters || activeLetters || newLetters}
            maxScore={previewQuery.data?.max_score}
            loading={wordsLoading}
            onBlock={(word) => void handleBlockWord(word)}
          />
        </div>
      </div>
    </div>
  );
}
