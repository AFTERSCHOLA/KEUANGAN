import { useState, useEffect } from 'react'
import Modal from '../../components/Modal.jsx'
import { apiRequest } from '../../lib/api.js'

export async function handleForgotPasswordSubmit({
  identity,
  apiRequestFn = apiRequest,
  setError,
  setMessage,
  setLoading,
}) {
  if (!identity || !identity.trim()) {
    setError('Username atau email wajib diisi.')
    return false
  }

  setLoading(true)
  setError('')
  setMessage('')

  try {
    const res = await apiRequestFn('/api/auth/forgot-password.php', {
      method: 'POST',
      body: { identity: identity.trim() },
      skipCsrf: true,
      skipUnauthorizedHandler: true,
    })
    setMessage(res?.message || 'Tautan reset kata sandi telah dikirim ke email terdaftar.')
    return true
  } catch (err) {
    setError(err?.message || 'Gagal mengirim tautan reset.')
    return false
  } finally {
    setLoading(false)
  }
}

export default function ForgotPasswordModal({ open, onClose }) {
  const [identity, setIdentity] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (open) {
      setIdentity('')
      setError('')
      setMessage('')
      setLoading(false)
    }
  }, [open])

  async function handleSubmit(e) {
    e.preventDefault()
    await handleForgotPasswordSubmit({
      identity,
      apiRequestFn: apiRequest,
      setError,
      setMessage,
      setLoading,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Lupa Kata Sandi">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-600">
          Masukkan username atau email terdaftar akun Anda. Kami akan mengirimkan tautan untuk mengatur ulang kata sandi.
        </p>

        {message && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm text-emerald-800">
            {message}
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="forgot-identity"
            className="block text-xs font-bold text-slate-500 uppercase mb-1.5"
          >
            Username atau Email
          </label>
          <input
            id="forgot-identity"
            type="text"
            value={identity}
            onChange={e => setIdentity(e.target.value)}
            disabled={loading}
            placeholder="Masukkan username atau email"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60 shadow-sm"
          >
            {loading ? 'Mengirim...' : 'Kirim Tautan Reset'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl bg-slate-100 hover:bg-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition disabled:opacity-60"
          >
            Batal
          </button>
        </div>
      </form>
    </Modal>
  )
}
