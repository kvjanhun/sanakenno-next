import { create } from 'zustand';

/** Message severity used for toast display. */
export type MessageType = 'ok' | 'error' | 'special';

/** Celebration overlay type. */
export type CelebrationType = 'allistyttava' | 'nohint-allistyttava' | 'taysikenno' | null;

export interface UiState {
  message: string;
  messageType: MessageType;
  secondaryMessage: string;
  secondaryType: MessageType;
  celebration: CelebrationType;
  wordShake: boolean;
  wordRejected: boolean;
  lastResubmittedWord: string | null;
  shareCopied: boolean;
  pressedHexIndex: number | null;
  showRanks: boolean;
  showRules: boolean;
  showAllFoundWords: boolean;
  showArchive: boolean;
  showStats: boolean;
  showSettings: boolean;
  showAuth: boolean;
  viewingPuzzleDate: string | null;

  showToast: (
    msg: string,
    type?: MessageType,
    duration?: number,
    secondaryMessage?: string,
    secondaryType?: MessageType,
    onExpire?: () => void,
  ) => void;
  triggerWordShake: (resubmittedWord?: string | null) => void;
  clearWordRejection: () => void;
  setCelebration: (celebration: CelebrationType) => void;
  setShareCopied: (copied: boolean) => void;
  setPressedHexIndex: (index: number | null) => void;
  setShowRanks: (show: boolean) => void;
  setShowRules: (show: boolean) => void;
  setShowAllFoundWords: (show: boolean) => void;
  setShowArchive: (show: boolean) => void;
  setShowStats: (show: boolean) => void;
  setShowSettings: (show: boolean) => void;
  setShowAuth: (show: boolean) => void;
  setViewingPuzzleDate: (date: string | null) => void;
  resetUi: () => void;
}

let messageTimer: ReturnType<typeof setTimeout> | null = null;
let shakeTimer: ReturnType<typeof setTimeout> | null = null;

export const useUiStore = create<UiState>()((set) => ({
  message: '',
  messageType: 'ok',
  secondaryMessage: '',
  secondaryType: 'ok',
  celebration: null,
  wordShake: false,
  wordRejected: false,
  lastResubmittedWord: null,
  shareCopied: false,
  pressedHexIndex: null,
  showRanks: false,
  showRules: false,
  showAllFoundWords: false,
  showArchive: false,
  showStats: false,
  showSettings: false,
  showAuth: false,
  viewingPuzzleDate: null,

  showToast: (
    msg,
    type = 'ok',
    duration = 2000,
    secondaryMessage = '',
    secondaryType = 'ok',
    onExpire,
  ) => {
    if (messageTimer !== null) clearTimeout(messageTimer);
    set({
      message: msg,
      messageType: type,
      secondaryMessage,
      secondaryType,
    });
    messageTimer = setTimeout(() => {
      set({
        message: '',
        messageType: 'ok',
        secondaryMessage: '',
        secondaryType: 'ok',
      });
      messageTimer = null;
      onExpire?.();
    }, duration);
  },

  triggerWordShake: (resubmittedWord = null) => {
    if (shakeTimer !== null) clearTimeout(shakeTimer);
    const isResubmit = resubmittedWord !== null;
    set({
      wordRejected: true,
      wordShake: true,
      lastResubmittedWord: resubmittedWord,
    });
    shakeTimer = setTimeout(
      () => {
        set({
          wordShake: false,
          ...(isResubmit ? { lastResubmittedWord: null } : {}),
        });
        shakeTimer = null;
      },
      isResubmit ? 1200 : 400,
    );
  },

  clearWordRejection: () => {
    set({ wordRejected: false, wordShake: false });
  },

  setCelebration: (celebration) => set({ celebration }),
  setShareCopied: (shareCopied) => set({ shareCopied }),
  setPressedHexIndex: (pressedHexIndex) => set({ pressedHexIndex }),
  setShowRanks: (showRanks) => set({ showRanks }),
  setShowRules: (showRules) => set({ showRules }),
  setShowAllFoundWords: (showAllFoundWords) => set({ showAllFoundWords }),
  setShowArchive: (showArchive) => set({ showArchive }),
  setShowStats: (showStats) => set({ showStats }),
  setShowSettings: (showSettings) => set({ showSettings }),
  setShowAuth: (showAuth) => set({ showAuth }),
  setViewingPuzzleDate: (viewingPuzzleDate) => set({ viewingPuzzleDate }),

  resetUi: () => {
    if (messageTimer !== null) {
      clearTimeout(messageTimer);
      messageTimer = null;
    }
    if (shakeTimer !== null) {
      clearTimeout(shakeTimer);
      shakeTimer = null;
    }
    set({
      message: '',
      messageType: 'ok',
      secondaryMessage: '',
      secondaryType: 'ok',
      celebration: null,
      wordShake: false,
      wordRejected: false,
      lastResubmittedWord: null,
      shareCopied: false,
      pressedHexIndex: null,
      showRanks: false,
      showRules: false,
      showAllFoundWords: false,
      showArchive: false,
      showStats: false,
      showSettings: false,
      showAuth: false,
      viewingPuzzleDate: null,
    });
  },
}));
