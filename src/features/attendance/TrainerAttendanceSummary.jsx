import { useMemo, useEffect, useState, useCallback } from 'react'
import { readCached, usePeriod, subscribeStore, read } from '../../lib/store.js'
import { summarizeTrainerAttendance } from '../../lib/trainerAttendance.js'

// TA.C.1 (F-TA4, F-TA5; D-TA13, D-TA15; R-TA5, R-TA6) — ringkasan
// absensiPengajar milik sendiri. Mirrors the TrainerAttendanceAdmin.jsx
// card + table idiom (bg-white rounded-2xl shadow-sm border, slate-50
// thead, text-[11px] pills) — do not invent a new pattern.
//
// R-TA6: rows are filtered by the authenticated `trainerId` prop only.
// The component never offers a trainer picker, so one trainer cannot
// switch to another trainer's rows from the UI.
export default function TrainerAttendanceSummary({ trainerId }) {
  const { periodeKey } = usePeriod()
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick(t => t + 1), [])
  useEffect(() => subscribeStore(bump), [bump])

  const periode = periodeKey()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const absensiPengajar = useMemo(() => readCached('absensiPengajar'), [tick])

  useEffect(() => {
  read('absensiPengajar').then(() => setTick(t => t + 1))
}, [])

  const sekolah = useMemo(() => readCached('sekolah'), [tick])

  const summary = useMemo(
    () => summarizeTrainerAttendance({ absensiPengajar, trainerId, periode }),
    [absensiPengajar, trainerId, periode],
  )

  function schoolName(id) {
    return sekolah.find(s => s.id === id)?.nama || 'Sekolah tidak ditemukan'
  }

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-2xl shadow-sm border flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Ringkasan Saya</h2>
          <p className="text-xs text-slate-500">
            Ringkasan absensi Anda periode <b>{periode}</b> — {summary.count} record
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {['Hadir', 'Izin', 'Alpa'].map(status => (
          <div key={status} className="bg-white rounded-2xl shadow-sm border p-5">
            <p className="text-[10px] text-slate-400 font-bold uppercase">{status}</p>
            <p className="text-lg font-extrabold text-blue-700 mt-1">{summary.total[status]}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border p-5">
        <h3 className="text-base font-bold text-slate-800">Sekolah Saya</h3>
        {summary.sekolahIds.length === 0 ? (
          <p className="text-sm text-slate-400 mt-2">Belum ada sekolah tercatat untuk periode ini.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {summary.sekolahIds.map(id => (
              <li key={id} className="text-sm font-semibold text-slate-600">{schoolName(id)}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="py-4 px-6">Tanggal</th>
                <th className="py-4 px-6">Sekolah</th>
                <th className="py-4 px-6 text-center">Status</th>
                <th className="py-4 px-6">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {summary.riwayat.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition">
                  <td className="py-4 px-6 font-semibold text-slate-600">{r.tanggal}</td>
                  <td className="py-4 px-6 font-bold text-slate-800">{schoolName(r.sekolahId)}</td>
                  <td className="py-4 px-6 text-center">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                      r.status === 'Hadir' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-[11px] text-slate-500">{[r.keterangan, r.catatan].filter(Boolean).join(' — ') || '—'}</td>
                </tr>
              ))}
              {summary.riwayat.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400">
                    Belum ada absensi tercatat untuk periode ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
