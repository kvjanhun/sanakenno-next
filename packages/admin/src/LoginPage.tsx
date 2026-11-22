import { useState, type FormEvent } from 'react';
import {
  ADMIN_CARD_CLASS,
  ADMIN_CARD_STYLE,
  ADMIN_INPUT_CLASS,
  ADMIN_INPUT_STYLE,
  AdminAlert,
  adminButtonClass,
  adminButtonStyle,
} from './AdminPrimitives.js';
import { useAdminStore } from './useAdminStore.js';

export function LoginPage(): React.JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useAdminStore((s) => s.login);
  const isLoading = useAdminStore((s) => s.isLoading);
  const error = useAdminStore((s) => s.error);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    await login(username.trim(), password);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 select-text"
      style={{ backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}
    >
      <div
        className={`w-full max-w-sm space-y-5 shadow-xl ${ADMIN_CARD_CLASS}`}
        style={ADMIN_CARD_STYLE}
      >
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-bold tracking-tight">Sanakenno Admin</h1>
            <a
              href="#/"
              className={`${adminButtonClass('sm')} no-underline`}
              style={adminButtonStyle('secondary', 'primary')}
            >
              Peliin
            </a>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Kirjaudu sisään hallintapaneeliin
          </p>
        </div>

        {error && <AdminAlert variant="error">{error}</AdminAlert>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="admin-username"
              className="block text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Käyttäjätunnus
            </label>
            <input
              id="admin-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              className={`w-full py-2 ${ADMIN_INPUT_CLASS}`}
              style={ADMIN_INPUT_STYLE}
              required
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="admin-password"
              className="block text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Salasana
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className={`w-full py-2 ${ADMIN_INPUT_CLASS}`}
              style={ADMIN_INPUT_STYLE}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !username.trim() || !password}
            className={`w-full py-2.5 text-sm ${adminButtonClass('md')}`}
            style={adminButtonStyle('primary')}
          >
            {isLoading ? 'Kirjaudutaan...' : 'Kirjaudu'}
          </button>
        </form>
      </div>
    </div>
  );
}
