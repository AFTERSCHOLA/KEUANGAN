export default function Modal({ open, onClose, title, children }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl animate-scaleIn max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-blue-900 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h3 className="text-lg font-bold text-yellow-300">{title}</h3>
          <button onClick={onClose} className="text-white hover:text-yellow-300 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          {children}
        </div>
      </div>
    </div>
  )
}