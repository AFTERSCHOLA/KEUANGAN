import AppModal from './AppModal.jsx'

export default function AlertDialog({
  open,
  onOk,
  title,
  body,
  okLabel = 'OK',
}) {
  if (!open) return null

  return (
    <AppModal
      open={open}
      onClose={onOk}
      title={title}
      topAccent="emerald"
      size="sm"
      hideCloseButton
      disableBackdropClose
    >
      <p className="text-sm text-slate-600 -mt-2">{body}</p>
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onOk}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow"
        >
          {okLabel}
        </button>
      </div>
    </AppModal>
  )
}