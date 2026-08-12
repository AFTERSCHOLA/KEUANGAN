export default function QuickSession({ siswaList, hadirCount, onSetAllHadir }) {
  if (!siswaList || siswaList.length === 0) return null

  const total = siswaList.length
  const semuaHadir = hadirCount === total

  return (
    <div className="flex items-center justify-between gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-3">
      <div className="text-xs text-slate-600">
        <span className="font-bold text-blue-700">{hadirCount}</span> / {total} siswa hadir
      </div>
      <button
        type="button"
        onClick={onSetAllHadir}
        disabled={semuaHadir}
        className={`text-xs font-bold px-3.5 py-1.5 rounded-full transition ${
          semuaHadir
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
            : 'bg-yellow-400 hover:bg-yellow-500 text-slate-900 shadow-sm active:scale-95'
        }`}
      >
        Semua Hadir?
      </button>
    </div>
  )
}