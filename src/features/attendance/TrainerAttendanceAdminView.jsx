import { useState } from 'react'
import { readCached } from '../../lib/store.js'
import TrainerAttendanceAdmin from './TrainerAttendanceAdmin.jsx'
import TrainerAttendanceRecap from './TrainerAttendanceRecap.jsx'

// TA.C.2 — Concrete pick: the monthly matrix (TrainerAttendanceRecap)
// lives inside the existing 'Absensi Tenaga Pengajar' admin tab behind
// a "Daftar / Rekap Matriks" toggle, instead of a new top-level tab.
// Rationale: smallest nav diff (no App.jsx tab-list change, no legacy
// regression surface), and both views read the same `absensiPengajar`
// contract. Pill-toggle idiom mirrors TrainerAttendanceForm.jsx status
// buttons. The sekolah filter is shared so both views stay in sync.
export default function TrainerAttendanceAdminView() {
  const [view, setView] = useState('daftar')
  const [filterSekolahId, setFilterSekolahId] = useState('')
  const sekolah = readCached('sekolah')

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-2xl shadow-sm border flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {[
            { id: 'daftar', label: 'Daftar' },
            { id: 'matriks', label: 'Rekap Matriks' },
          ].map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-full transition ${view === v.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {view === 'matriks' && (
          <select
            value={filterSekolahId}
            onChange={(e) => setFilterSekolahId(e.target.value)}
            className="rounded-lg border p-2 text-xs bg-white font-semibold"
          >
            <option value="">Semua Sekolah</option>
            {sekolah.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
        )}
      </div>

      {view === 'daftar' ? <TrainerAttendanceAdmin /> : <TrainerAttendanceRecap filterSekolahId={filterSekolahId} />}
    </div>
  )
}
