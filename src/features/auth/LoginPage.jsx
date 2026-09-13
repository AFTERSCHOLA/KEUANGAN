import { useEffect, useState } from 'react'
import { login } from '../../lib/auth.js'
import { SidebarLogo } from '../../components/SidebarLayout.jsx'

export default function LoginPage({ onAuthenticated }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [logoUrl, setLogoUrl] = useState(null)

  // Fetches the current logo directly from the server (now-public
  // logo-current.php / logo-download.php, D-LP4) instead of reading
  // getSettings()'s local cache — that cache only gets populated after a
  // successful login somewhere else in the app, so an anonymous visitor
  // on a fresh browser/device previously saw no logo at all on this page.
  useEffect(() => {
    let cancelled = false
    fetch('/api/logo-current.php', { credentials: 'same-origin' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!cancelled && data?.id) {
          setLogoUrl(`/api/logo-download.php?id=${encodeURIComponent(data.id)}`)
        }
      })
      .catch(() => {
        // No logo uploaded yet, or offline — SidebarLogo already falls
        // back to its placeholder icon when logoUrl stays null.
      })
    return () => {
      cancelled = true
    }
  }, [])

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
              <SidebarLogo logoUrl={logoUrl} logoEntry={null} size="w-16 h-16" iconSize="w-9 h-9" />
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