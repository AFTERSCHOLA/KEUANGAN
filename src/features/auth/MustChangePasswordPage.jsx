import { useState } from 'react'
import { changePassword, logout } from '../../lib/auth.js'

// M-AUTH.4: dedicated page for users whose account was created with
// `mustChangePassword = 1` (Superadmin bootstrap also sets this on the
// first Superadmin by default per schema.sql). Renders the same
// visual idiom as LoginPage so the brand is consistent, and is shown
// in App.jsx in place of the dashboard when currentUser.mustChangePassword
// is true. The existing `changePassword()` in src/lib/auth.js already
// rotates the session, clears the flag, and emits the new safe identity
// via the auth listener — so completing this form lands the user on
// their role dashboard without any extra wiring.
export default function MustChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Semua kolom wajib diisi.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Kata sandi baru dan konfirmasi tidak cocok.')
      return
    }
    // The server enforces the actual policy (12+ chars, mixed case,
    // digit) — we don't mirror that here because any divergence would
    // only generate a less helpful 422. We DO keep the basic local
    // checks above so the user gets fast feedback for the most
    // common client-side mistakes.
    setSubmitting(true)
    setError('')
    try {
      await changePassword(currentPassword, newPassword)
      // The auth listener (subscribeAuth) flips currentUser with
      // mustChangePassword=false, so App.jsx will route us to the
      // dashboard automatically. Nothing else to do here.
    } catch (submitError) {
      setError(submitError?.message || 'Gagal mengubah kata sandi.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSignOut() {
    await logout()
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 font-sans">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-blue-950 border-2 border-yellow-400 flex items-center justify-center shadow-md">
              <svg
                className="w-9 h-9 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c-1.66 0-3 1.34-3 3v3h6v-3c0-1.66-1.34-3-3-3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 11V7a5 5 0 10-10 0v4" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-slate-900">Ubah Kata Sandi</h1>
            <p className="mt-1 text-sm text-slate-500">
              Demi keamanan akun, silakan buat kata sandi baru sebelum melanjutkan.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-semibold text-slate-700 mb-1.5">
                Kata Sandi Saat Ini
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                disabled={submitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                placeholder="Masukkan kata sandi saat ini"
              />
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-semibold text-slate-700 mb-1.5">
                Kata Sandi Baru
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                disabled={submitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                placeholder="Minimal 12 karakter, huruf besar, kecil, dan angka"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-semibold text-slate-700 mb-1.5">
                Konfirmasi Kata Sandi Baru
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={submitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                placeholder="Ulangi kata sandi baru"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={submitting}
                className="text-sm font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50"
              >
                Keluar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-blue-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Menyimpan...' : 'Simpan Kata Sandi'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
