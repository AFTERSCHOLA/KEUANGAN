import React, { useMemo, useState } from 'react'
import { read, upsert, usePeriod } from '../../lib/store'
import { buildReviewQueue } from '../../lib/attendance'
import { getRole, canVerify } from '../../lib/role'

export default function RiwayatAbsensi({ onLoadForCorrection }) {
  const { periodeKey } = usePeriod()
  const [tick, setTick] = useState(0)
  const sekolah = useMemo(() => read('sekolah'), [tick])
  const trainer = useMemo(() => read('trainer'), [tick])
  const absensi = useMemo(() => read('absensi'), [tick])
  const [filterSekolahId, setFilterSekolahId] = useState('')
  const [showAll, setShowAll] = useState(false)

  const role = getRole()
  const periode = periodeKey()
  const periodeAbsensi = absensi.filter(a => a.periode === periode)

  const queue = useMemo(() => buildReviewQueue(periodeAbsensi, trainer), [periodeAbsensi, trainer])
  const filteredQueue = filterSekolahId ? queue.filter(q => q.record.sekolahId === filterSekolahId) : queue

  const allRecords = periodeAbsensi
    .filter(a => !filterSekolahId || a.sekolahId === filterSekolahId)
    .sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1))

  function schoolName(id) {
    return sekolah.find(s => s.id === id)?.nama || 'Sekolah tidak ditemukan'
  }
  function hadirCount(record) {
    return (record.siswaList || []).filter(s => s.status === 'Hadir').length
  }
  function handleVerify(record) {
    upsert('absensi', { ...record, statusVerifikasi: { by: role, at: new Date().toISOString() } })
    setTick(t => t + 1)
  }

  const rows = showAll ? allRecords.map(r => ({ record: r, reasons: [] })) : filteredQueue

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-2xl shadow-sm border flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800">{showAll ? 'Semua Absensi' : 'Antrian Verifikasi'}</h3>
          <p className="text-xs text-slate-500">
            Periode <b>{periode}</b>{!showAll && ` — ${rows.length} record perlu ditinjau`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterSekolahId}
            onChange={(e) => setFilterSekolahId(e.target.value)}
            className="rounded-lg border p-2 text-xs bg-white font-semibold"
          >
            <option value="">Semua Sekolah</option>
            {sekolah.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
          <button
            onClick={() => setShowAll(v => !v)}
            className={`text-xs font-bold px-3.5 py-1.5 rounded-full transition ${
              showAll ? 'bg-yellow-400 text-slate-900 shadow-sm' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            Semua
          </button>
        </div>
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
                {!showAll && <th className="py-4 px-6">Alasan Tinjauan</th>}
                <th className="py-4 px-6 text-center">Verifikasi</th>
                <th className="py-4 px-6 text-center">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {rows.map(({ record: r, reasons }) => (
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
                  {!showAll && <td className="py-4 px-6 text-[11px] text-slate-500">{reasons.join('; ')}</td>}
                  <td className="py-4 px-6 text-center">
                    {r.statusVerifikasi ? (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                        ✓ {r.statusVerifikasi.at.slice(0, 10)}
                      </span>
                    ) : canVerify(role) ? (
                      <button
                        onClick={() => handleVerify(r)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] px-3 py-1.5 rounded-lg transition shadow-sm active:scale-95"
                      >
                        Verifikasi
                      </button>
                    ) : (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-400">Menunggu</span>
                    )}
                  </td>
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
              {rows.length === 0 && (
                <tr>
                  <td colSpan={showAll ? 7 : 8} className="py-12 text-center text-slate-400">
                    {showAll ? 'Belum ada absensi tercatat untuk periode ini.' : 'Tidak ada record yang perlu ditinjau saat ini.'}
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