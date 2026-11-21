import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminBlockWord,
  adminDeletePuzzle,
  adminGetPuzzleVariations,
  adminGetSlots,
  adminPreview,
  adminSavePuzzle,
  adminSwapPuzzles,
} from '../../api/client.js';

export interface PuzzleTargetParams {
  slot?: number;
  display_number?: number;
}

export interface PreviewTargetParams {
  letters: string | string[];
  lettersKey: string;
  center: string;
}

export function usePuzzleEditorQueries(
  csrfToken: string | null,
  targetPuzzle: PuzzleTargetParams | null,
  previewTarget: PreviewTargetParams | null,
) {
  const queryClient = useQueryClient();

  const slotsQuery = useQuery({
    queryKey: ['admin', 'slots', csrfToken],
    enabled: Boolean(csrfToken),
    queryFn: async () => {
      const res = await adminGetSlots(csrfToken!);
      const slots = res.active_slots ?? res.slots.map((s) => s.slot);
      const todaySlot = res.today_slot ?? null;
      return {
        slots,
        totalPuzzles: res.total_puzzles,
        todaySlot,
      };
    },
  });

  const puzzleQuery = useQuery({
    queryKey: ['admin', 'puzzle-variations', csrfToken, targetPuzzle],
    enabled: Boolean(csrfToken && targetPuzzle !== null),
    queryFn: () => adminGetPuzzleVariations(csrfToken!, targetPuzzle!),
  });

  const previewQuery = useQuery({
    queryKey: [
      'admin',
      'preview',
      csrfToken,
      previewTarget?.lettersKey ?? '',
      previewTarget?.center ?? '',
    ],
    enabled: Boolean(
      csrfToken && previewTarget && previewTarget.lettersKey && previewTarget.center,
    ),
    queryFn: () =>
      adminPreview(csrfToken!, {
        letters: previewTarget!.letters,
        center: previewTarget!.center,
      }),
  });

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'slots'] });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'puzzle-variations'] });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'preview'] });
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      slot?: number;
      letters: string | string[];
      center: string;
      force?: boolean;
    }) => {
      return (await adminSavePuzzle(csrfToken!, payload)) as {
        slot: number;
        display_number: number;
      };
    },
    onSuccess: async () => {
      await refreshAll();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (slot: number) => {
      await adminDeletePuzzle(csrfToken!, slot);
      const refreshed = await slotsQuery.refetch();
      return refreshed.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'puzzle-variations'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'preview'] });
    },
  });

  const swapMutation = useMutation({
    mutationFn: async ({ slotA, slotB }: { slotA: number; slotB: number }) => {
      await adminSwapPuzzles(csrfToken!, slotA, slotB);
    },
    onSuccess: async () => {
      await refreshAll();
    },
  });

  const blockWordMutation = useMutation({
    mutationFn: async (word: string) => {
      await adminBlockWord(csrfToken!, word);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'blocked'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'puzzle-variations'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'preview'] });
    },
  });

  const saving =
    saveMutation.isPending ||
    deleteMutation.isPending ||
    swapMutation.isPending ||
    blockWordMutation.isPending;

  return {
    slotsQuery,
    puzzleQuery,
    previewQuery,
    saveMutation,
    deleteMutation,
    swapMutation,
    blockWordMutation,
    saving,
  };
}
