import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminStore } from '../../packages/web/src/features/admin/useAdminStore.js';

describe('Admin Store (Web)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAdminStore.setState({
      isAuthenticated: false,
      username: null,
      csrfToken: null,
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears error state when requested', () => {
    useAdminStore.setState({ error: 'Virheellinen salasana' });
    expect(useAdminStore.getState().error).toBe('Virheellinen salasana');

    useAdminStore.getState().clearError();
    expect(useAdminStore.getState().error).toBeNull();
  });

  it('populates admin session on checkSession 200 and clears state on 401 or network failure', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ username: 'admin', csrfToken: 'csrf-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      )
      .mockRejectedValueOnce(new TypeError('Network error'));

    await useAdminStore.getState().checkSession();
    expect(fetchSpy).toHaveBeenNthCalledWith(1, '/api/auth/session', expect.any(Object));
    expect(useAdminStore.getState()).toMatchObject({
      isAuthenticated: true,
      username: 'admin',
      csrfToken: 'csrf-123',
      isLoading: false,
      error: null,
    });

    await useAdminStore.getState().checkSession();
    expect(useAdminStore.getState()).toMatchObject({
      isAuthenticated: false,
      username: null,
      csrfToken: null,
      isLoading: false,
    });

    useAdminStore.setState({ isAuthenticated: true, username: 'admin', csrfToken: 'csrf-123' });
    await useAdminStore.getState().checkSession();
    expect(useAdminStore.getState()).toMatchObject({
      isAuthenticated: false,
      username: null,
      csrfToken: null,
      isLoading: false,
    });
  });

  it('sets auth state on login success and surfaces server error message on failure', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ username: 'editor', csrfToken: 'csrf-login' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Virheellinen tunnus' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const ok = await useAdminStore.getState().login('editor', 'secret1234');
    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      '/api/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(useAdminStore.getState()).toMatchObject({
      isAuthenticated: true,
      username: 'editor',
      csrfToken: 'csrf-login',
      isLoading: false,
      error: null,
    });

    const failed = await useAdminStore.getState().login('editor', 'wrong');
    expect(failed).toBe(false);
    expect(useAdminStore.getState()).toMatchObject({
      isLoading: false,
      error: 'Virheellinen tunnus',
    });
  });

  it('calls /api/auth/logout and resets auth state on logout', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));

    useAdminStore.setState({
      isAuthenticated: true,
      username: 'admin',
      csrfToken: 'test-token',
    });

    await useAdminStore.getState().logout();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(useAdminStore.getState()).toMatchObject({
      isAuthenticated: false,
      username: null,
      csrfToken: null,
      isLoading: false,
    });
  });
});
