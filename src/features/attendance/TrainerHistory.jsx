import React, { useMemo, useState } from 'react'
import { read, upsert, usePeriod } from '../../lib/store'

function isoWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const diff = target - firstThursday
  const week = 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000))
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`
}

export default function TrainerHistory({ trainerId }) {
  const { periodeKey } = usePeriod()
  const [tick, setTick] = useState(0)
  const absensi = useMemo(() => read('absensi'), [tick])

  const periode = periodeKey()
  const myRecords = absensi
    .filter(a => a.trainerId === trainerId && a.periode === periode)
    .sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1))

  const thisWeek = isoWeekKey(new Date().toISOString().slice(0, 10))
  const uncertifiedThisWeek = myRecords.filter(r => isoWeekKey(r.tanggal) === thisWeek && !r.konfirmasiTrainer)

  function handleCertifyWeek() {
    const now = new Date().toISOString()
    uncertifiedThisWeek.forEach(r => upsert('absensi', { ...r, konfirmasiTrainer: now }))
    setTick(t => t + 1)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-2xl shadow-sm border flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800">Riwayat Absensi Saya</h3>
          <p className="text-xs text-slate-500">Periode <b>{periode}</b></p>
        </div>
        <button
          onClick={handleCertifyWeek}
          disabled={uncertifiedThisWeek.length === 0}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-xs px-4 py-2 rounded-xl transition shadow-sm active:scale-95"
        >
          Saya nyatakan absensi minggu ini sesuai dokumen kertas
        </button>
      </div>

      <p className="text-[11px] font-semibold text-slate-400 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5">
        📋 Simpan kertas absensi minimal 1 tahun ajaran.
      </p>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="py-4 px-6">Tanggal</th>
                <th className="py-4 px-6 text-center">Status Trainer</th>
                <th className="py-4 px-6 text-center">Siswa Hadir</th>
                <th className="py-4 px-6 text-center">Konfirmasi Trainer</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {myRecords.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition">
                  <td className="py-4 px-6 font-semibold text-slate-600">{r.tanggal}</td>
                  <td className="py-4 px-6 text-center">{r.trainerStatus}</td>
                  <td className="py-4 px-6 text-center font-bold text-blue-700">
                    {(r.siswaList || []).filter(s => s.status === 'Hadir').length}
                  </td>
                  <td className="py-4 px-6 text-center">
                    {r.konfirmasiTrainer ? (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                        ✓ {r.konfirmasiTrainer.slice(0, 10)}
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-400">Belum</span>
                    )}
                  </td>
                </tr>
              ))}
              {myRecords.length === 0 && (
                <tr><td colSpan="4" className="py-12 text-center text-slate-400">Belum ada absensi tercatat untuk periode ini.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}