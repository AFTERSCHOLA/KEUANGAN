import { useEffect, useRef } from 'react'

/**
 * Single modal shell used by every dialog in the app.
 * - Header bar (blue-900 + yellow-300 title)
 * - Optional top accent stripe (used by ConfirmDialog / AlertDialog)
 * - Escape key closes; click-outside closes (unless disabled)
 * - Body scroll locked while open
 * - First focusable element receives focus on mount (basic, no library)
 */
export default function AppModal({
  open: isOpen,
  onClose,
  title,
  topAccent = null,
  size = 'md',
  hideCloseButton = false,
  disableBackdropClose = false,
  children,
}) {
  const dialogRef = useRef(null)
  const previouslyFocused = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // Map sizes to Tailwind classes
  const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  }[size] || 'max-w-md'

  const accentClass = {
    yellow: 'border-t-4 border-yellow-400',
    emerald: 'border-t-4 border-emerald-500',
    rose: 'border-t-4 border-rose-500',
  }[topAccent] || ''

  useEffect(() => {
  if (!isOpen) return

  const prevOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'

  previouslyFocused.current = document.activeElement

  const focusFirst = () => {
    const root = dialogRef.current
    if (!root) return
    const target = root.querySelector(
      'input, select, textarea, button, [tabindex]:not([tabindex="-1"])'
    )
    target?.focus()
  }
  const id = requestAnimationFrame(focusFirst)

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCloseRef.current?.()
    }
  }
  document.addEventListener('keydown', onKey)

  return () => {
    document.body.style.overflow = prevOverflow
    document.removeEventListener('keydown', onKey)
    cancelAnimationFrame(id)
    previouslyFocused.current?.focus?.()
  }
}, [isOpen])   // <-- cuma isOpen

  if (!isOpen) return null

  function handleBackdrop(e) {
    if (disableBackdropClose) return
    if (e.target === e.currentTarget) onClose?.()
  }

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdrop}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`bg-white rounded-2xl shadow-2xl animate-scaleIn ${sizeClass} w-full max-h-[85vh] overflow-y-auto ${accentClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className="bg-blue-900 px-6 py-4 rounded-t-2xl flex items-center justify-between">
            <h3 className="text-lg font-bold text-yellow-300">{title}</h3>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup"
                className="text-white hover:text-yellow-300 p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="p-6 space-y-4">{children}</div>
      </div>
    </div>
  )
}