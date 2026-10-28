import { beforeEach, describe, expect, it } from 'vitest';
import { useAdminStore } from '../../packages/web/src/features/admin/useAdminStore.js';

describe('Admin Store (Web)', () => {
  beforeEach(() => {
    useAdminStore.setState({
      isAuthenticated: false,
      username: null,
      csrfToken: null,
      isLoading: false,
      error: null,
    });
  });

  it('initializes with unauthenticated state', () => {
    const state = useAdminStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.username).toBeNull();
    expect(state.csrfToken).toBeNull();
  });

  it('clears error state when requested', () => {
    useAdminStore.setState({ error: 'Virheellinen salasana' });
    expect(useAdminStore.getState().error).toBe('Virheellinen salasana');

    useAdminStore.getState().clearError();
    expect(useAdminStore.getState().error).toBeNull();
  });

  it('manages logout state transition', async () => {
    useAdminStore.setState({
      isAuthenticated: true,
      username: 'admin',
      csrfToken: 'test-token',
    });

    await useAdminStore.getState().logout();
    const state = useAdminStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.username).toBeNull();
    expect(state.csrfToken).toBeNull();
  });
});
