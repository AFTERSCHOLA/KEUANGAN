import React, { useMemo, useState } from 'react'
import { read, usePeriod } from '../../lib/store'

export default function AttendanceHistory({ onLoadForCorrection }) {
  const { periodeKey } = usePeriod()
  const sekolah = useMemo(() => read('sekolah'), [])
  const absensi = useMemo(() => read('absensi'), [])
  const [filterSekolahId, setFilterSekolahId] = useState('')

  const periode = periodeKey()

  const records = absensi
    .filter(a => a.periode === periode)
    .filter(a => !filterSekolahId || a.sekolahId === filterSekolahId)
    .sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1))

  function schoolName(id) {
    return sekolah.find(s => s.id === id)?.nama || 'Sekolah tidak ditemukan'
  }

  function hadirCount(record) {
    return (record.siswaList || []).filter(s => s.status === 'Hadir').length
  }

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-2xl shadow-sm border flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800">Riwayat Absensi</h3>
          <p className="text-xs text-slate-500">Periode <b>{periode}</b></p>
        </div>
        <select
          value={filterSekolahId}
          onChange={(e) => setFilterSekolahId(e.target.value)}
          className="rounded-lg border p-2 text-xs bg-white font-semibold"
        >
          <option value="">Semua Sekolah</option>
          {sekolah.map(s => (
            <option key={s.id} value={s.id}>{s.nama}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="py-4 px-6">Tanggal</th>
                <th className="py-4 px-6">Sekolah</th>
                <th className="py-4 px-6">Trainer</th>
                <th className="py-4 px-6 text-center">Status Trainer</th>
                <th className="py-4 px-6 text-center">Siswa Hadir</th>
                <th className="py-4 px-6 text-center">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition">
                  <td className="py-4 px-6 font-semibold text-slate-600">{r.tanggal}</td>
                  <td className="py-4 px-6 font-bold text-slate-800">{schoolName(r.sekolahId)}</td>
                  <td className="py-4 px-6 font-semibold text-slate-600">{r.trainerNama}</td>
                  <td className="py-4 px-6 text-center">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                      r.trainerStatus === 'Hadir' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {r.trainerStatus}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-center font-bold text-blue-700">{hadirCount(r)}</td>
                  <td className="py-4 px-6 text-center">
                    <button
                      onClick={() => onLoadForCorrection?.(r)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] px-3.5 py-1.5 rounded-lg transition shadow-sm active:scale-95"
                    >
                      Muat untuk Koreksi
                    </button>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-400">
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