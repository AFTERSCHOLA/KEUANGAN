import { useState } from 'react'
import PasswordField from '../../components/PasswordField.jsx'
import { apiRequest } from '../../lib/api.js'

export function validateResetPassword(newPassword, confirmPassword) {
  if (!newPassword || !confirmPassword) {
    return 'Semua kolom wajib diisi.'
  }
  if (newPassword !== confirmPassword) {
    return 'Kata sandi baru dan konfirmasi tidak cocok.'
  }
  return null
}

export async function handleResetPasswordSubmit({
  token,
  newPassword,
  confirmPassword,
  apiRequestFn = apiRequest,
  setError,
  setSuccess,
  setExpired,
  setSubmitting,
}) {
  const validationError = validateResetPassword(newPassword, confirmPassword)
  if (validationError) {
    setError(validationError)
    return false
  }

  setSubmitting(true)
  setError('')

  try {
    await apiRequestFn('/api/auth/reset-password.php', {
      method: 'POST',
      body: { token, newPassword },
      skipCsrf: true,
      skipUnauthorizedHandler: true,
    })
    setSuccess(true)
    return true
  } catch (err) {
    const msg = err?.message || 'Gagal mengatur ulang kata sandi.'
    if (msg.toLowerCase().includes('kedaluwarsa') || msg.toLowerCase().includes('expired')) {
      setExpired(true)
    }
    setError(msg)
    return false
  } finally {
    setSubmitting(false)
  }
}

export default function ResetPasswordPage({ token, onFinished }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [expired, setExpired] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    await handleResetPasswordSubmit({
      token,
      newPassword,
      confirmPassword,
      apiRequestFn: apiRequest,
      setError,
      setSuccess,
      setExpired,
      setSubmitting,
    })
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
            <h1 className="mt-4 text-2xl font-bold text-slate-900">Reset Kata Sandi</h1>
            <p className="mt-1 text-sm text-slate-500">
              Silakan buat kata sandi baru untuk akun Anda.
            </p>
          </div>

          {success ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-center space-y-4">
              <p className="text-sm font-semibold text-emerald-800">
                Kata sandi berhasil diperbarui. Silakan masuk dengan kata sandi baru Anda.
              </p>
              <button
                type="button"
                onClick={onFinished}
                className="w-full rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 shadow-sm"
              >
                Masuk Sekarang
              </button>
            </div>
          ) : expired ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-center space-y-4">
              <p className="text-sm font-semibold text-amber-800">
                Permintaan reset kata sandi sudah kedaluwarsa. Silakan ajukan ulang.
              </p>
              <button
                type="button"
                onClick={onFinished}
                className="w-full rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 shadow-sm"
              >
                Kembali ke Halaman Masuk
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <PasswordField
                id="newPassword"
                label="Kata Sandi Baru"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                disabled={submitting}
                placeholder="Minimal 12 karakter"
              />

              <PasswordField
                id="confirmPassword"
                label="Konfirmasi Kata Sandi"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={submitting}
                placeholder="Ulangi kata sandi baru"
              />

              <p className="text-xs text-slate-500">
                Minimal 12 karakter, mengandung huruf besar, huruf kecil, dan angka.
              </p>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 shadow-sm"
              >
                {submitting ? 'Menyimpan...' : 'Simpan Kata Sandi'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
