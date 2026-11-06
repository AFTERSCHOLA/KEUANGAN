import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import PasswordField from './PasswordField.jsx'
import { changePassword } from '../lib/auth.js'

export function validateChangePassword(currentPassword, newPassword, confirmPassword) {
  if (!currentPassword || !newPassword || !confirmPassword) {
    return 'Semua kolom wajib diisi.'
  }
  if (newPassword !== confirmPassword) {
    return 'Kata sandi baru dan konfirmasi tidak cocok.'
  }
  return null
}

export async function handlePasswordChangeSubmit({
  currentPassword,
  newPassword,
  confirmPassword,
  changePasswordFn = changePassword,
  setError,
  setSuccess,
  setSubmitting,
  onClose,
}) {
  const validationError = validateChangePassword(currentPassword, newPassword, confirmPassword)
  if (validationError) {
    setError(validationError)
    return false
  }
  setSubmitting(true)
  setError('')
  try {
    await changePasswordFn(currentPassword, newPassword)
    setSuccess(true)
    return true
  } catch (err) {
    setError(err?.message || 'Gagal mengubah kata sandi.')
    return false
  } finally {
    setSubmitting(false)
  }
}

export default function ChangePasswordModal({ open, onClose }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setError('')
      setSuccess(false)
      setSubmitting(false)
    }
  }, [open])

  async function handleSubmit(e) {
    e.preventDefault()
    const ok = await handlePasswordChangeSubmit({
      currentPassword,
      newPassword,
      confirmPassword,
      changePasswordFn: changePassword,
      setError,
      setSuccess,
      setSubmitting,
      onClose,
    })
    if (ok) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => {
        onClose?.()
      }, 1000)
    }
  }

  function handleClose() {
    if (submitting) return
    onClose?.()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Ubah Kata Sandi">
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField
          id="currentPassword"
          label="Kata Sandi Saat Ini"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          disabled={submitting || success}
          placeholder="Masukkan kata sandi saat ini"
        />

        <div>
          <PasswordField
            id="newPassword"
            label="Kata Sandi Baru"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            disabled={submitting || success}
            placeholder="Minimal 12 karakter, huruf besar, kecil, angka"
          />
          <p className="mt-1 text-xs text-slate-500">
            Minimal 12 karakter, mengandung huruf besar, huruf kecil, dan angka.
          </p>
        </div>

        <PasswordField
          id="confirmPassword"
          label="Konfirmasi Kata Sandi Baru"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          disabled={submitting || success}
          placeholder="Ulangi kata sandi baru"
        />

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm font-semibold text-emerald-800">
            Kata sandi berhasil diubah.
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={submitting || success}
            className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
