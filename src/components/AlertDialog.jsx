export default function AlertDialog({
  open,
  onOk,
  title,
  body,
  okLabel = 'OK',
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-scaleIn border-t-4 border-emerald-500">
        <h4 className="text-lg font-bold text-slate-900 mb-2">{title}</h4>
        <p className="text-sm text-slate-600 mb-6">{body}</p>
        <div className="flex justify-end">
          <button onClick={onOk} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow">{okLabel}</button>
        </div>
      </div>
    </div>
  )
}