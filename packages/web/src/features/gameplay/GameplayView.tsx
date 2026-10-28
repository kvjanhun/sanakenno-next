import { useCallback, useEffect, useState } from 'react';
import { ArchiveModal } from '../modals/ArchiveModal.js';
import { PuzzleWordsModal } from '../modals/PuzzleWordsModal.js';
import { RulesModal } from '../modals/RulesModal.js';
import { SettingsModal } from '../modals/SettingsModal.js';
import { StatsModal } from '../modals/StatsModal.js';
import { ConnectBanner } from '../player-sync/ConnectBanner.js';
import { SyncModal } from '../player-sync/SyncModal.js';
import { useAuthStore } from '../player-sync/useAuthStore.js';
import { usePaletteStore } from '../theme/usePaletteStore.js';
import { resolveScheme, useThemePreferenceStore } from '../theme/useThemePreferenceStore.js';
import { Celebration } from './Celebration.js';
import { FoundWords } from './FoundWords.js';
import { GameControls } from './GameControls.js';
import { HintPanels } from './HintPanels.js';
import { Honeycomb } from './Honeycomb.js';
import { ArrowLeftIcon, CalendarIcon, CircleHelpIcon, SettingsIcon, StatsIcon } from './icons.js';
import { MessageBar } from './MessageBar.js';
import { RankProgress } from './RankProgress.js';
import { useGameStore } from './useGameStore.js';
import { useGameTimer } from './useGameTimer.js';
import { useKeyboard } from './useKeyboard.js';
import { useMidnightRollover } from './useMidnightRollover.js';
import { usePuzzleQuery } from './usePuzzleQuery.js';
import { useUiStore } from './useUiStore.js';
import { WordInput } from './WordInput.js';

export function GameplayView(): React.JSX.Element {
  const viewingPuzzleDate = useUiStore((s) => s.viewingPuzzleDate);
  const { isLoading, isError, refetch } = usePuzzleQuery(viewingPuzzleDate);

  const themeId = usePaletteStore((s) => s.themeId);
  const preference = useThemePreferenceStore((s) => s.preference);
  const scheme = resolveScheme(preference);

  const [revealPuzzle, setRevealPuzzle] = useState<{
    puzzleNumber: number;
    displayNumber: number;
  } | null>(null);

  const puzzle = useGameStore((s) => s.puzzle);
  const currentWord = useGameStore((s) => s.currentWord);
  const score = useGameStore((s) => s.score);
  const foundWords = useGameStore((s) => s.foundWords);
  const outerLetters = useGameStore((s) => s.outerLetters);
  const hintsUnlocked = useGameStore((s) => s.hintsUnlocked);
  const scoreBeforeHints = useGameStore((s) => s.scoreBeforeHints);
  const startedAt = useGameStore((s) => s.startedAt);
  const totalPausedMs = useGameStore((s) => s.totalPausedMs);

  const message = useUiStore((s) => s.message);
  const messageType = useUiStore((s) => s.messageType);
  const secondaryMessage = useUiStore((s) => s.secondaryMessage);
  const secondaryType = useUiStore((s) => s.secondaryType);
  const showRanks = useUiStore((s) => s.showRanks);
  const showRules = useUiStore((s) => s.showRules);
  const showAllFoundWords = useUiStore((s) => s.showAllFoundWords);
  const showArchive = useUiStore((s) => s.showArchive);
  const showStats = useUiStore((s) => s.showStats);
  const showSettings = useUiStore((s) => s.showSettings);
  const showAuth = useUiStore((s) => s.showAuth);
  const celebration = useUiStore((s) => s.celebration);
  const wordShake = useUiStore((s) => s.wordShake);
  const lastResubmittedWord = useUiStore((s) => s.lastResubmittedWord);
  const shareCopied = useUiStore((s) => s.shareCopied);
  const pressedHexIndex = useUiStore((s) => s.pressedHexIndex);

  const displayScoreBeforeHints = hintsUnlocked.size === 0 ? score : (scoreBeforeHints ?? 0);

  const timer = useGameTimer((sAt, pausedMs) => {
    useGameStore.getState().tickTimer(sAt, pausedMs);
  });

  useEffect(() => {
    if (puzzle && startedAt) {
      timer.restore(startedAt, totalPausedMs);
    } else if (puzzle) {
      timer.start();
    }
  }, [puzzle, startedAt, totalPausedMs, timer]);

  useMidnightRollover(() => {
    if (useUiStore.getState().viewingPuzzleDate === null) {
      void refetch();
    }
  });

  const [connectToken, setConnectToken] = useState<string | null>(null);

  useEffect(() => {
    void useAuthStore.getState().initialize();
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('connect');
    if (token) {
      setConnectToken(token);
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);

  const handleEscape = useCallback(() => {
    if (revealPuzzle !== null) {
      setRevealPuzzle(null);
      return;
    }
    const ui = useUiStore.getState();
    if (ui.showArchive) ui.setShowArchive(false);
    else if (ui.showStats) ui.setShowStats(false);
    else if (ui.showRules) ui.setShowRules(false);
    else if (ui.showSettings) ui.setShowSettings(false);
    else if (ui.showAuth) ui.setShowAuth(false);
    else if (ui.showRanks) ui.setShowRanks(false);
  }, [revealPuzzle]);

  useKeyboard({
    onLetter: (letter) => useGameStore.getState().addLetter(letter),
    onBackspace: () => useGameStore.getState().deleteLetter(),
    onEnter: () => {
      void useGameStore.getState().submitWord();
    },
    onEscape: handleEscape,
    enabled:
      !showRules &&
      !showArchive &&
      !showStats &&
      !showSettings &&
      revealPuzzle === null &&
      !!puzzle,
  });

  const storeState = useGameStore.getState();
  const center = puzzle?.center ?? '';
  const allLetters = storeState.allLetters();
  const rank = storeState.rank();
  const recentFoundWords = storeState.recentFoundWords();
  const sortedFoundWords = storeState.sortedFoundWords();
  const allFound = puzzle !== null && foundWords.size === puzzle.hint_data.word_count;

  const handleShare = useCallback(() => {
    void useGameStore.getState().copyStatus();
  }, []);

  return (
    <div className="w-full" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      <header
        className="w-full border-b"
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="max-w-sm mx-auto h-12 px-2 flex items-center justify-between">
          <div className="flex w-[80px] shrink-0 items-center">
            <button
              type="button"
              aria-label="Arkisto"
              onClick={() => useUiStore.getState().setShowArchive(true)}
              className="h-10 w-10 rounded-lg bg-transparent border-none cursor-pointer flex items-center justify-center"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <CalendarIcon />
            </button>
            <button
              type="button"
              aria-label="Tilastot"
              onClick={() => useUiStore.getState().setShowStats(true)}
              className="h-10 w-10 rounded-lg bg-transparent border-none cursor-pointer flex items-center justify-center"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <StatsIcon />
            </button>
          </div>

          <div
            className="min-w-0 flex-1 text-center text-lg font-semibold whitespace-nowrap overflow-hidden text-ellipsis"
            style={{ color: 'var(--color-text-primary)' }}
            data-testid="puzzle-header"
          >
            {viewingPuzzleDate ? (
              <span className="inline-flex min-w-0 items-center justify-center">
                <button
                  type="button"
                  aria-label="Takaisin tähän päivään"
                  onClick={() => useUiStore.getState().setViewingPuzzleDate(null)}
                  className="mr-1 h-8 w-8 rounded-lg bg-transparent border-none cursor-pointer flex items-center justify-center"
                  style={{ color: 'var(--color-accent)' }}
                >
                  <ArrowLeftIcon />
                </button>
                <span className="min-w-0 overflow-hidden text-ellipsis">
                  {new Date(viewingPuzzleDate + 'T12:00:00').toLocaleDateString('fi-FI', {
                    day: 'numeric',
                    month: 'numeric',
                  })}
                </span>
                {puzzle && (
                  <span
                    style={{
                      color: 'var(--color-text-tertiary)',
                      fontWeight: 'normal',
                    }}
                  >
                    {' '}
                    — #{puzzle.display_number}
                  </span>
                )}
              </span>
            ) : (
              <>
                Sanakenno
                <span style={{ fontWeight: 400 }}> —</span>
                {puzzle && (
                  <span
                    style={{
                      color: 'var(--color-accent)',
                      fontWeight: 400,
                    }}
                  >
                    {' '}
                    #{puzzle.display_number}
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex w-[80px] shrink-0 items-center justify-end">
            <button
              type="button"
              aria-label="Säännöt"
              onClick={() => useUiStore.getState().setShowRules(true)}
              className="h-10 w-10 rounded-lg bg-transparent border-none cursor-pointer flex items-center justify-center"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <CircleHelpIcon />
            </button>
            <button
              type="button"
              aria-label="Asetukset"
              onClick={() => useUiStore.getState().setShowSettings(true)}
              className="h-10 w-10 rounded-lg bg-transparent border-none cursor-pointer flex items-center justify-center"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <SettingsIcon />
            </button>
          </div>
        </div>
      </header>

      <RulesModal show={showRules} onClose={() => useUiStore.getState().setShowRules(false)} />
      <SettingsModal
        show={showSettings}
        onClose={() => useUiStore.getState().setShowSettings(false)}
        onOpenSync={() => {
          useUiStore.getState().setShowSettings(false);
          useUiStore.getState().setShowAuth(true);
        }}
      />
      <SyncModal show={showAuth} onClose={() => useUiStore.getState().setShowAuth(false)} />
      <ConnectBanner token={connectToken} onClose={() => setConnectToken(null)} />
      <ArchiveModal
        show={showArchive}
        onClose={() => useUiStore.getState().setShowArchive(false)}
        onSelectPuzzle={(_puzzleNumber, date) => {
          useUiStore.getState().setViewingPuzzleDate(date);
          useUiStore.getState().setShowArchive(false);
        }}
        onRevealAnswers={(puzzleNumber, displayNumber) => {
          useUiStore.getState().setShowArchive(false);
          setRevealPuzzle({ puzzleNumber, displayNumber });
        }}
        currentPuzzleNumber={puzzle?.puzzle_number ?? null}
      />
      <PuzzleWordsModal
        show={revealPuzzle !== null}
        onClose={() => setRevealPuzzle(null)}
        puzzleNumber={revealPuzzle?.puzzleNumber ?? null}
        displayNumber={revealPuzzle?.displayNumber}
      />
      <StatsModal
        show={showStats}
        onClose={() => useUiStore.getState().setShowStats(false)}
        onShare={handleShare}
        shareCopied={shareCopied}
      />

      <div className="max-w-sm mx-auto px-3 pt-2 pb-6">
        {isLoading && !puzzle && (
          <div className="text-center py-16" style={{ color: 'var(--color-text-secondary)' }}>
            Ladataan...
          </div>
        )}

        {!isLoading && isError && !puzzle && (
          <div className="text-center py-16" role="alert">
            <p className="text-base mb-4" style={{ color: 'var(--color-error)' }}>
              Lataus epäonnistui.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="px-4 py-2 rounded-lg font-semibold cursor-pointer border-none"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-on-accent)',
              }}
            >
              Yritä uudelleen
            </button>
          </div>
        )}

        {puzzle && (
          <>
            <div
              className="sticky z-20"
              style={{
                top: 0,
                backgroundColor: 'var(--color-bg-primary)',
                paddingTop: '0.5rem',
                paddingBottom: '0.25rem',
              }}
            >
              <RankProgress
                score={score}
                maxScore={puzzle.max_score}
                rank={rank}
                showRanks={showRanks}
                onToggleRanks={() => useUiStore.getState().setShowRanks(!showRanks)}
                scoreBeforeHints={displayScoreBeforeHints}
                hasUnlockedHints={hintsUnlocked.size > 0}
              />
            </div>

            <HintPanels
              hintsUnlocked={hintsUnlocked}
              onUnlock={(id) => useGameStore.getState().unlockHint(id)}
            />

            <div className="mb-2">
              <WordInput
                currentWord={currentWord}
                center={center}
                allLetters={allLetters}
                shake={wordShake}
                allFound={allFound}
                wordCount={puzzle.hint_data.word_count}
              />
            </div>

            {!allFound && (
              <div className="mb-2">
                <MessageBar
                  message={message}
                  type={messageType}
                  secondaryMessage={secondaryMessage}
                  secondaryType={secondaryType}
                />
              </div>
            )}

            <div className="flex justify-center mb-3" style={{ opacity: allFound ? 0.7 : 1 }}>
              <Honeycomb
                center={center}
                outerLetters={outerLetters}
                pressedHexIndex={pressedHexIndex}
                disabled={allFound}
                themeId={themeId}
                scheme={scheme}
                onLetterPress={(letter) => useGameStore.getState().addLetter(letter)}
                onHexDown={(idx) => useUiStore.getState().setPressedHexIndex(idx)}
                onHexUp={() => useUiStore.getState().setPressedHexIndex(null)}
              />
            </div>

            {!allFound && (
              <div className="mb-3">
                <GameControls
                  onDelete={() => useGameStore.getState().deleteLetter()}
                  onShuffle={() => useGameStore.getState().shuffleLetters()}
                  onShare={handleShare}
                  shareCopied={shareCopied}
                  onSubmit={() => {
                    void useGameStore.getState().submitWord();
                  }}
                />
              </div>
            )}

            <FoundWords
              foundWords={sortedFoundWords}
              recentWords={recentFoundWords}
              showAll={showAllFoundWords}
              allLetters={allLetters}
              onToggleShowAll={() => useUiStore.getState().setShowAllFoundWords(!showAllFoundWords)}
              lastResubmittedWord={lastResubmittedWord}
            />
          </>
        )}
      </div>

      {puzzle && (
        <Celebration
          show={celebration !== null}
          type={celebration}
          score={score}
          maxScore={puzzle.max_score}
          onClose={() => useUiStore.getState().setCelebration(null)}
          onShare={handleShare}
        />
      )}
    </div>
  );
}
