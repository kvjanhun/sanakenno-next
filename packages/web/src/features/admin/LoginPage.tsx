import { useState, type FormEvent } from 'react';
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
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}
    >
      <div
        className="w-full max-w-sm rounded-xl p-6 space-y-5 shadow-lg border"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight">Sanakenno Admin</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Kirjaudu sisään hallintapaneeliin
          </p>
        </div>

        {error && (
          <div
            className="p-3 rounded-lg text-xs font-medium"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              color: 'var(--color-error)',
              borderColor: 'var(--color-border)',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="admin-username"
              className="block text-xs font-semibold uppercase tracking-wider"
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
              className="w-full px-3 py-2 rounded text-sm outline-none border"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
              required
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="admin-password"
              className="block text-xs font-semibold uppercase tracking-wider"
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
              className="w-full px-3 py-2 rounded text-sm outline-none border"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !username.trim() || !password}
            className="w-full py-2.5 rounded font-medium text-sm cursor-pointer disabled:opacity-50 transition-opacity"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-bg-primary)',
            }}
          >
            {isLoading ? 'Kirjaudutaan...' : 'Kirjaudu'}
          </button>
        </form>
      </div>
    </div>
  );
}
