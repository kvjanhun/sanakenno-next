import { create } from 'zustand';
import { adminCheckSession, adminLogin, adminLogout } from '../../api/client.js';

export interface AdminState {
  isAuthenticated: boolean;
  username: string | null;
  csrfToken: string | null;
  isLoading: boolean;
  error: string | null;
  checkSession: () => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAdminStore = create<AdminState>((set) => ({
  isAuthenticated: false,
  username: null,
  csrfToken: null,
  isLoading: true,
  error: null,

  clearError: () => set({ error: null }),

  checkSession: async () => {
    set({ isLoading: true, error: null });
    try {
      const session = await adminCheckSession();
      if (session) {
        set({
          isAuthenticated: true,
          username: session.username,
          csrfToken: session.csrfToken,
          isLoading: false,
        });
      } else {
        set({
          isAuthenticated: false,
          username: null,
          csrfToken: null,
          isLoading: false,
        });
      }
    } catch {
      set({
        isAuthenticated: false,
        username: null,
        csrfToken: null,
        isLoading: false,
      });
    }
  },

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await adminLogin({ username, password });
      set({
        isAuthenticated: true,
        username: res.username,
        csrfToken: res.csrfToken,
        isLoading: false,
      });
      return true;
    } catch (err: unknown) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Kirjautuminen epäonnistui',
      });
      return false;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    await adminLogout();
    set({
      isAuthenticated: false,
      username: null,
      csrfToken: null,
      isLoading: false,
    });
  },
}));
