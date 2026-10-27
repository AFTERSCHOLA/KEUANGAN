import { useState } from 'react'

// M-F5 — single password field with a show/hide eye toggle, shared by
// LoginPage and MustChangePasswordPage. Mirrors the existing input idiom
// (same border/focus classes + pr-11 room for the eye); toggling flips
// type only, never the value. Default stays type=password.
export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  placeholder,
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-semibold text-slate-700 mb-1.5"
      >
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-300 pl-3 pr-11 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
          aria-pressed={visible}
          disabled={disabled}
          className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-600 disabled:opacity-50"
        >
          {visible ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
