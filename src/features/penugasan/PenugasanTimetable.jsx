import { useMemo, useState, useEffect, useCallback } from 'react'
import { readCached, getRoleContext, subscribeStore } from '../../lib/store.js'
import { localDateString } from '../../lib/constants.js'
import { buildDailyTimetable, dayNameForTanggal } from '../../lib/penugasan.js'
import { exportJadwalPenugasanCSV } from '../../lib/csv.js'
import PrintButton from '../../components/PrintButton.jsx'

// PG.B.1 (F-PG2; D-PG4, D-PG5, D-PG7, D-PG8) — date-driven daily timetable.
// Read-only derived view over trainer.penugasanPengajar[] ×
// sekolah.jadwalList[]; no writes here. Table idiom mirrors
// TrainerAttendanceAdmin.jsx:153-210, classNames verbatim; date input
// mirrors TrainerAttendanceForm.jsx:52-56 (default today, change
// re-derives). Past/future dates resolve against current state
// (no snapshots, matrix analog D-TA16).
export default function PenugasanTimetable() {
  const ctx = getRoleContext()
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick(t => t + 1), [])
  useEffect(() => subscribeStore(bump), [bump])

  const [tanggal, setTanggal] = useState(localDateString())

  // readCached is already role-scoped; trainer rows are narrowed to self
  // below (R-TA6: personal scope), admins keep the scoped set as-is.
  const sekolah = useMemo(() => readCached('sekolah'), [tick])
  const trainers = useMemo(() => readCached('trainer'), [tick])
  const trainerById = useMemo(() => new Map(trainers.map(t => [t.id, t])), [trainers])

  const rows = useMemo(() => {
    const all = buildDailyTimetable({ trainers, sekolah, tanggal })
    if (ctx.role === 'trainer' && ctx.trainerId) {
      return all.filter(r => r.trainerId === ctx.trainerId || r.asistenId === ctx.trainerId)
    }
    return all
  }, [trainers, sekolah, tanggal, ctx.role, ctx.trainerId])

  const hari = dayNameForTanggal(tanggal)

  // PG.C.1 (D-PG6, D-PG7) — export payload mirrors the visible table
  // exactly (same filtered array + same name resolution); scope filtered
  // upstream, so the file can never contain rows the table hides.
  const displayRows = useMemo(() => rows.map(r => ({
    sekolah: r.sekolahNama,
    trainer: trainerById.get(r.trainerId)?.nama || 'Trainer tidak ditemukan',
    asisten: r.asistenId ? (trainerById.get(r.asistenId)?.nama || 'Trainer tidak ditemukan') : '—',
    waktu: r.waktu,
  })), [rows, trainerById])

  function handleExportCSV() {
    exportJadwalPenugasanCSV(displayRows, tanggal)
  }

  return (
    // PG.C.2 (D-PG6): printable-report root + no-print toolbar (print.css).
    // Title + Tanggal + table print; picker + export/print buttons don't.
    <div className="space-y-6 animate-fadeIn printable-report">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Jadwal Penugasan</h2>
          <p className="text-xs text-slate-500">Tanggal: <b>{tanggal}</b>{hari ? ` · ${hari}` : ''}</p>
        </div>
        <div className="flex items-end gap-2 no-print">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Tanggal</label>
            <input
              type="date"
              value={tanggal}
              onChange={e => setTanggal(e.target.value)}
              className="block mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            onClick={handleExportCSV}
            className="rounded-xl bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 hover:bg-emerald-700 transition-colors"
          >
            Unduh CSV
          </button>
          <PrintButton />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="py-4 px-6">Sekolah</th>
                <th className="py-4 px-6">Trainer</th>
                <th className="py-4 px-6">Asisten</th>
                <th className="py-4 px-6">Waktu</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {rows.map((r, idx) => (
                <tr key={`${r.assignmentId || r.trainerId}-${r.sekolahId}-${r.waktu}-${idx}`} className="hover:bg-slate-50/50 transition">
                  <td className="py-4 px-6 font-bold text-slate-800">{r.sekolahNama}</td>
                  <td className="py-4 px-6 font-semibold text-slate-600">{trainerById.get(r.trainerId)?.nama || 'Trainer tidak ditemukan'}</td>
                  <td className="py-4 px-6 font-semibold text-slate-600">{r.asistenId ? (trainerById.get(r.asistenId)?.nama || 'Trainer tidak ditemukan') : '—'}</td>
                  <td className="py-4 px-6 font-semibold text-slate-600">{r.waktu}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400">
                    Belum ada jadwal penugasan untuk tanggal ini.
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
