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
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-scaleIn border-t-4 border-yellow-400">
        <h4 className="text-lg font-bold text-slate-900 mb-2">{title}</h4>
        <p className="text-sm text-slate-600 mb-6">{body}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-500">{cancelLabel}</button>
          <button onClick={onConfirm} className={confirmBtn}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
