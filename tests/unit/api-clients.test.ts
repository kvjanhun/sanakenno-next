import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminDeletePuzzle,
  adminGetSlots,
  adminSavePuzzle,
  fetchPlayerMe,
  postAchievement,
  postPlayerTransferUse,
  postSyncProgress,
} from '../../packages/web/src/api/client.js';

describe('Web API Clients (client.ts & admin-client.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends Bearer authorization on player calls and parses JSON + non-JSON fallback errors', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ player_id: 7, session_count: 2 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Palvelin hylkäsi' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }));

    const me = await fetchPlayerMe('tok-abc');
    expect(me).toEqual({ player_id: 7, session_count: 2 });
    const firstHeaders = new Headers(
      (fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers,
    );
    expect(firstHeaders.get('Authorization')).toBe('Bearer tok-abc');

    expect(await fetchPlayerMe('tok-abc')).toBeNull();

    const syncPayload = {
      puzzle_number: 1,
      date: '2026-04-10',
      found_words: ['kana'],
      score: 1,
      max_score: 50,
      hints_unlocked: [],
      started_at: 1000,
      total_paused_ms: 0,
      score_before_hints: 1,
      best_no_hint_score: 1,
    };

    await expect(postSyncProgress('tok-abc', syncPayload)).rejects.toThrow('Palvelin hylkäsi');

    const syncInit = fetchSpy.mock.calls[2]?.[1] as RequestInit | undefined;
    expect(syncInit?.keepalive).toBe(true);

    // Non-JSON error body exercises readErrorMessage catch fallback
    await expect(postSyncProgress('tok-abc', syncPayload)).rejects.toThrow(
      'Synkronointi epäonnistui',
    );
  });

  it('forwards optional currentToken on postPlayerTransferUse and telemetry calls', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: 'new-tok',
            player_id: 42,
            session_count: 2,
            stats: { version: 1, records: [] },
            puzzle_states: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'recorded' }), { status: 201 }));

    await postPlayerTransferUse({ token: '123-456' }, 'old-tok');
    const transferHeaders = new Headers(
      (fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers,
    );
    expect(transferHeaders.get('Authorization')).toBe('Bearer old-tok');

    localStorage.setItem('sanakenno_auth_token', JSON.stringify('stored-tok'));
    postAchievement({
      puzzle_number: 1,
      rank: 'Onnistuja',
      score: 25,
      max_score: 100,
      words_found: 5,
    });
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
    const telemetryHeaders = new Headers(
      (fetchSpy.mock.calls[1]?.[1] as RequestInit | undefined)?.headers,
    );
    expect(telemetryHeaders.get('Authorization')).toBe('Bearer stored-tok');
  });

  it('attaches X-CSRF-Token & credentials on adminSavePuzzle, propagates requires_force, falls back on errors', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Liian vähän sanoja', requires_force: true }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))
      .mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));

    let caught: (Error & { requires_force?: boolean }) | null = null;
    try {
      await adminSavePuzzle('csrf-xyz', { letters: 'a,e,i,k,l,n,s', center: 'a' });
    } catch (err) {
      caught = err as Error & { requires_force?: boolean };
    }
    expect(caught?.message).toBe('Liian vähän sanoja');
    expect(caught?.requires_force).toBe(true);

    const saveInit = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(saveInit?.credentials).toBe('same-origin');
    expect(new Headers(saveInit?.headers).get('X-CSRF-Token')).toBe('csrf-xyz');

    const slotsFallback = await adminGetSlots('csrf-xyz');
    expect(slotsFallback).toEqual({
      slots: [],
      active_slots: [],
      total_puzzles: 0,
      today_slot: null,
    });

    await expect(adminDeletePuzzle('csrf-xyz', 1)).rejects.toThrow('Poisto epäonnistui');
  });
});
