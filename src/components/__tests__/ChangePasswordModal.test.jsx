import { describe, expect, it, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ChangePasswordModal, {
  validateChangePassword,
  handlePasswordChangeSubmit,
} from '../ChangePasswordModal.jsx'
import * as auth from '../../lib/auth.js'

// Mock Modal to avoid DOM portal dependencies in unit tests
vi.mock('../Modal.jsx', () => ({
  default: ({ open, onClose, title, children }) => {
    if (!open) return null
    return (
      <div role="dialog" aria-label={title} data-testid="modal">
        <div data-testid="modal-title">{title}</div>
        <button type="button" onClick={onClose} data-testid="modal-close">Tutup</button>
        {children}
      </div>
    )
  },
}))

describe('ChangePasswordModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders all three fields, policy hint, and action buttons when open', () => {
      const html = renderToStaticMarkup(
        <ChangePasswordModal open={true} onClose={() => {}} />
      )

      // Title
      expect(html).toContain('Ubah Kata Sandi')

      // All three fields
      expect(html).toContain('Kata Sandi Saat Ini')
      expect(html).toContain('Kata Sandi Baru')
      expect(html).toContain('Konfirmasi Kata Sandi Baru')

      // Placeholder for new password
      expect(html).toContain('Minimal 12 karakter, huruf besar, kecil, angka')

      // Policy hint
      expect(html).toContain('Minimal 12 karakter, mengandung huruf besar, huruf kecil, dan angka.')

      // Action buttons
      expect(html).toContain('Simpan')
      expect(html).toContain('Batal')
    })

    it('does not render content when closed (open=false)', () => {
      const html = renderToStaticMarkup(
        <ChangePasswordModal open={false} onClose={() => {}} />
      )
      expect(html).toBe('')
    })
  })

  describe('validation', () => {
    it('requires all three fields', () => {
      expect(validateChangePassword('', 'NewPass123456!', 'NewPass123456!')).toBe(
        'Semua kolom wajib diisi.'
      )
      expect(validateChangePassword('OldPass123!', '', 'NewPass123456!')).toBe(
        'Semua kolom wajib diisi.'
      )
      expect(validateChangePassword('OldPass123!', 'NewPass123456!', '')).toBe(
        'Semua kolom wajib diisi.'
      )
    })

    it('validates that new password matches confirm password', () => {
      const err = validateChangePassword('OldPass123!', 'Password12345!', 'Different12345!')
      expect(err).toBe('Kata sandi baru dan konfirmasi tidak cocok.')
    })

    it('returns null when validation passes', () => {
      const err = validateChangePassword('OldPass123!', 'Password12345!', 'Password12345!')
      expect(err).toBeNull()
    })
  })

  describe('submission', () => {
    it('calls changePassword() on valid submission', async () => {
      const changePasswordSpy = vi.spyOn(auth, 'changePassword').mockResolvedValue({
        id: 'usr-1',
        username: 'admin',
        mustChangePassword: false,
      })

      const setError = vi.fn()
      const setSuccess = vi.fn()
      const setSubmitting = vi.fn()
      const onClose = vi.fn()

      const success = await handlePasswordChangeSubmit({
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewPassword12345!',
        confirmPassword: 'NewPassword12345!',
        changePasswordFn: changePasswordSpy,
        setError,
        setSuccess,
        setSubmitting,
        onClose,
      })

      expect(success).toBe(true)
      expect(changePasswordSpy).toHaveBeenCalledWith(
        'CurrentPassword123!',
        'NewPassword12345!'
      )
      expect(setSuccess).toHaveBeenCalledWith(true)
      expect(setError).toHaveBeenCalledWith('')
    })

    it('displays error message from server on failure', async () => {
      const changePasswordSpy = vi.spyOn(auth, 'changePassword').mockRejectedValue(
        new Error('Kata sandi lama salah.')
      )

      const setError = vi.fn()
      const setSuccess = vi.fn()
      const setSubmitting = vi.fn()
      const onClose = vi.fn()

      const success = await handlePasswordChangeSubmit({
        currentPassword: 'WrongPassword123!',
        newPassword: 'NewPassword12345!',
        confirmPassword: 'NewPassword12345!',
        changePasswordFn: changePasswordSpy,
        setError,
        setSuccess,
        setSubmitting,
        onClose,
      })

      expect(success).toBe(false)
      expect(setError).toHaveBeenCalledWith('Kata sandi lama salah.')
      expect(setSuccess).not.toHaveBeenCalled()
    })
  })
})
