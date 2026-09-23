import { useMemo, useEffect, useState, useCallback } from 'react'
import { readCached, usePeriod, subscribeStore } from '../../lib/store.js'
import { buildTrainerMatrix } from '../../lib/trainerAttendance.js'

// TA.C.2 (F-TA4, F-TA5; D-TA15; R-TA5, R-TA9, R-TA10) — rekap matriks
// bulanan sekolah × tanggal. Mirrors the TrainerAttendanceAdmin.jsx
// card + table idiom (bg-white rounded-2xl shadow-sm border, slate-50
// thead, overflow-x-auto) — do not invent a new pattern.
//
// R-TA5: the matrix is a derived view built from `absensiPengajar`
// records, never stored. Scope comes free from readCached(): admin
// cabang only receives own-cabang rows (server-enforced), superadmin
// receives all. Cell text: `Nama (I/A)` + optional ` — keterangan` +
// optional ` (status)` when status is not Hadir.
export default function TrainerAttendanceRecap({ filterSekolahId = '' }) {
  const { periodeKey } = usePeriod()
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick(t => t + 1), [])
  useEffect(() => subscribeStore(bump), [bump])

  const periode = periodeKey()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const absensiPengajar = useMemo(() => readCached('absensiPengajar'), [tick])
  const sekolah = useMemo(() => readCached('sekolah'), [tick])
  const trainer = useMemo(() => readCached('trainer'), [tick])

  const matrix = useMemo(
    () => buildTrainerMatrix({ absensiPengajar, sekolah, trainer, periode }),
    [absensiPengajar, sekolah, trainer, periode],
  )

  const rows = useMemo(
    () => matrix.rows.filter(r => !filterSekolahId || r.sekolahId === filterSekolahId),
    [matrix, filterSekolahId],
  )

  function cellText(entry) {
    let text = `${entry.nama} (${entry.label})`
    if (entry.keterangan) text += ` — ${entry.keterangan}`
    if (entry.status && entry.status !== 'Hadir') text += ` (${entry.status})`
    return text
  }

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-2xl shadow-sm border flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800">Rekap Absensi Pengajar</h3>
          <p className="text-xs text-slate-500">
            Periode <b>{periode}</b> — {rows.length} sekolah
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="py-4 px-6 sticky left-0 bg-slate-50">Sekolah</th>
                {matrix.dates.map(d => (
                  <th key={d} title={d} className="py-4 px-3 text-center min-w-10">
                    {Number(d.slice(8, 10))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {rows.map(r => (
                <tr key={r.sekolahId} className="hover:bg-slate-50/50 transition align-top">
                  <td className="py-4 px-6 font-bold text-slate-800 sticky left-0 bg-white">{r.nama}</td>
                  {matrix.dates.map(d => (
                    <td key={d} className="py-2 px-3 text-[11px] text-slate-600 min-w-10">
                      {(r.cells[d] || []).map((entry, i) => (
                        <div key={i} className="whitespace-nowrap font-semibold">
                          {cellText(entry)}
                        </div>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={matrix.dates.length + 1} className="py-12 text-center text-slate-400">
                    Belum ada absensi tenaga pengajar untuk periode ini.
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
