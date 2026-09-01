import AppModal from './AppModal.jsx'

/**
 * Thin wrapper around AppModal kept for the existing call-sites.
 * New code should use <AppModal> directly.
 */
export default function Modal({ open, onClose, title, children }) {
  return (
    <AppModal open={open} onClose={onClose} title={title} size="lg">
      {children}
    </AppModal>
  )
}