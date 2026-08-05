import { useState, useEffect } from 'react'

/**
 * Display-only formatting per M3.3: shows "150.000" while typing,
 * `onChange` always receives the raw number (150000), never a string.
 * Does not use formatRupiah() from lib/format.js because that one adds
 * "Rp" + currency styling for read-only display contexts — this is an
 * editable field, so it uses plain thousands-separator grouping instead.
 *
 * Drop-in replacement for a native rupiah <input type="number">. Carries
 * no className opinions of its own beyond the existing input idiom —
 * pass `className` to match the surrounding form's existing input style
 * (R5: don't invent a new visual pattern, reuse what's already on the form).
 */
export default function RupiahInput({ value, onChange, className = '', min = 0, placeholder = '', id }) {
  const [display, setDisplay] = useState(formatGrouped(value))

  // Keep display in sync if `value` changes from outside (e.g. form reset).
  useEffect(() => {
    setDisplay(formatGrouped(value))
  }, [value])

  function formatGrouped(n) {
    const num = Number(n) || 0
    return new Intl.NumberFormat('id-ID').format(num)
  }

  function handleChange(e) {
    const raw = e.target.value.replace(/\D/g, '')
    const num = raw === '' ? 0 : Number(raw)
    const clamped = min != null ? Math.max(min, num) : num
    setDisplay(raw === '' ? '' : new Intl.NumberFormat('id-ID').format(clamped))
    onChange(clamped)
  }

  function handleBlur() {
    // Normalize empty field back to the numeric floor on blur.
    if (display === '') {
      setDisplay(formatGrouped(min ?? 0))
      onChange(min ?? 0)
    }
  }

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm select-none">
        Rp
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={className || 'w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'}
      />
    </div>
  )
}
