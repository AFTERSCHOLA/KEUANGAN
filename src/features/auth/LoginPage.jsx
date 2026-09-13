import { useState } from 'react'
import { login } from '../../lib/auth.js'
import { SidebarLogo } from '../../components/SidebarLayout.jsx'

export default function LoginPage({ onAuthenticated }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()

    if (!username.trim() || !password) {
      setError('Username dan password wajib diisi.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const user = await login(username.trim(), password)
      onAuthenticated?.(user)
    } catch (error) {
      setError(error?.message || 'Username atau password salah.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 font-sans">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center">
              {/* LP.B.3 (D-LP4) — SidebarLogo already falls back to
                  fetchLogoCurrent() against the now-public
                  logo-current.php/logo-download.php when logoEntry is
                  null, so this component doesn't need its own fetch —
                  that used to double the request (once here, once
                  inside SidebarLogo's own useEffect). */}
              <SidebarLogo logoUrl="" logoEntry={null} size="w-16 h-16" iconSize="w-9 h-9" />
            </div>

            <h1 className="mt-4 text-2xl font-bold text-slate-900">
              Afterschola
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Silakan masuk untuk melanjutkan
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-semibold text-slate-700 mb-1.5"
              >
                Username
              </label>

              <input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                disabled={loading}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                placeholder="Masukkan username"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-slate-700 mb-1.5"
              >
                Password
              </label>

              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                placeholder="Masukkan password"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Memproses...' : 'Masuk'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}