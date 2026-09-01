import AppModal from './AppModal.jsx'

export default function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  body,
  confirmLabel = 'Lanjutkan',
  cancelLabel = 'Batal',
  danger = false,
}) {
  if (!open) return null

  const confirmBtn = danger
    ? 'px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow'
    : 'px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow'

  return (
    <AppModal
      open={open}
      onClose={onCancel}
      title={title}
      topAccent="yellow"
      size="sm"
      hideCloseButton
      disableBackdropClose
    >
      <p className="text-sm text-slate-600 -mt-2">{body}</p>
      <div className="flex gap-3 justify-end pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-500"
        >
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm} className={confirmBtn}>
          {confirmLabel}
        </button>
      </div>
    </AppModal>
  )
}