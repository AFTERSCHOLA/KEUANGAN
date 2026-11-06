import { describe, expect, it, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ForgotPasswordModal, { handleForgotPasswordSubmit } from '../ForgotPasswordModal.jsx'
import ResetPasswordPage, { validateResetPassword, handleResetPasswordSubmit } from '../ResetPasswordPage.jsx'
import LoginPage from '../LoginPage.jsx'

// Mock Modal to avoid DOM portal issues in static markup testing
vi.mock('../../../components/Modal.jsx', () => ({
  default: ({ open, onClose, title, children }) => {
    if (!open) return null
    return (
      <div role="dialog" aria-label={title} data-testid="modal">
        <h2>{title}</h2>
        <button type="button" onClick={onClose} data-testid="modal-close">Tutup</button>
        {children}
      </div>
    )
  },
}))

describe('ForgotPasswordModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders modal with title, identity input, and action buttons when open', () => {
    const html = renderToStaticMarkup(
      <ForgotPasswordModal open={true} onClose={() => {}} />
    )

    expect(html).toContain('Lupa Kata Sandi')
    expect(html).toContain('Username atau Email')
    expect(html).toContain('Masukkan username atau email')
    expect(html).toContain('Kirim Tautan Reset')
    expect(html).toContain('Batal')
  })

  it('renders nothing when closed (open=false)', () => {
    const html = renderToStaticMarkup(
      <ForgotPasswordModal open={false} onClose={() => {}} />
    )
    expect(html).toBe('')
  })

  it('submits identity and handles success message', async () => {
    const apiRequestFn = vi.fn().mockResolvedValue({
      ok: true,
      message: 'Tautan reset kata sandi telah dikirim ke email terdaftar.',
    })
    const setError = vi.fn()
    const setMessage = vi.fn()
    const setLoading = vi.fn()

    const success = await handleForgotPasswordSubmit({
      identity: 'testuser',
      apiRequestFn,
      setError,
      setMessage,
      setLoading,
    })

    expect(success).toBe(true)
    expect(apiRequestFn).toHaveBeenCalledWith('/api/auth/forgot-password.php', {
      method: 'POST',
      body: { identity: 'testuser' },
      skipCsrf: true,
      skipUnauthorizedHandler: true,
    })
    expect(setMessage).toHaveBeenCalledWith('Tautan reset kata sandi telah dikirim ke email terdaftar.')
    expect(setError).toHaveBeenCalledWith('')
  })

  it('handles server errors on forgot-password failure', async () => {
    const apiRequestFn = vi.fn().mockRejectedValue(
      new Error('Akun ini belum memiliki email terdaftar. Silakan hubungi Superadmin untuk mereset kata sandi.')
    )
    const setError = vi.fn()
    const setMessage = vi.fn()
    const setLoading = vi.fn()

    const success = await handleForgotPasswordSubmit({
      identity: 'noemail_user',
      apiRequestFn,
      setError,
      setMessage,
      setLoading,
    })

    expect(success).toBe(false)
    expect(setError).toHaveBeenCalledWith('Akun ini belum memiliki email terdaftar. Silakan hubungi Superadmin untuk mereset kata sandi.')
    expect(setMessage).toHaveBeenCalledWith('')
  })
})

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders ResetPasswordPage with fields, policy hint, and submit button', () => {
    const html = renderToStaticMarkup(
      <ResetPasswordPage token="test-token-123" onFinished={() => {}} />
    )

    expect(html).toContain('Reset Kata Sandi')
    expect(html).toContain('Minimal 12 karakter, mengandung huruf besar, huruf kecil, dan angka.')
    expect(html).toContain('Kata Sandi Baru')
    expect(html).toContain('Konfirmasi Kata Sandi')
    expect(html).toContain('Simpan Kata Sandi')
  })

  it('validates matching passwords', () => {
    expect(validateResetPassword('', 'Password12345!')).toBe('Semua kolom wajib diisi.')
    expect(validateResetPassword('Password12345!', '')).toBe('Semua kolom wajib diisi.')
    expect(validateResetPassword('Password12345!', 'Different12345!')).toBe('Kata sandi baru dan konfirmasi tidak cocok.')
    expect(validateResetPassword('Password12345!', 'Password12345!')).toBeNull()
  })

  it('submits token and newPassword successfully', async () => {
    const apiRequestFn = vi.fn().mockResolvedValue({
      ok: true,
      message: 'Kata sandi berhasil diperbarui. Silakan masuk.',
    })
    const setError = vi.fn()
    const setSuccess = vi.fn()
    const setExpired = vi.fn()
    const setSubmitting = vi.fn()

    const ok = await handleResetPasswordSubmit({
      token: 'valid-token',
      newPassword: 'NewPassword12345!',
      confirmPassword: 'NewPassword12345!',
      apiRequestFn,
      setError,
      setSuccess,
      setExpired,
      setSubmitting,
    })

    expect(ok).toBe(true)
    expect(apiRequestFn).toHaveBeenCalledWith('/api/auth/reset-password.php', {
      method: 'POST',
      body: { token: 'valid-token', newPassword: 'NewPassword12345!' },
      skipCsrf: true,
      skipUnauthorizedHandler: true,
    })
    expect(setSuccess).toHaveBeenCalledWith(true)
    expect(setError).toHaveBeenCalledWith('')
  })

  it('handles expired token error', async () => {
    const apiRequestFn = vi.fn().mockRejectedValue(
      new Error('Permintaan reset kata sandi sudah kedaluwarsa. Silakan ajukan ulang.')
    )
    const setError = vi.fn()
    const setSuccess = vi.fn()
    const setExpired = vi.fn()
    const setSubmitting = vi.fn()

    const ok = await handleResetPasswordSubmit({
      token: 'expired-token',
      newPassword: 'NewPassword12345!',
      confirmPassword: 'NewPassword12345!',
      apiRequestFn,
      setError,
      setSuccess,
      setExpired,
      setSubmitting,
    })

    expect(ok).toBe(false)
    expect(setExpired).toHaveBeenCalledWith(true)
    expect(setError).toHaveBeenCalledWith('Permintaan reset kata sandi sudah kedaluwarsa. Silakan ajukan ulang.')
  })
})

describe('LoginPage integration', () => {
  it('renders "Lupa kata sandi?" trigger button', () => {
    const html = renderToStaticMarkup(<LoginPage onAuthenticated={() => {}} />)
    expect(html).toContain('Lupa kata sandi?')
  })
})
