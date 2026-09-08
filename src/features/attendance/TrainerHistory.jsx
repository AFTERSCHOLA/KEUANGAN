import React, { useEffect, useMemo, useState } from 'react'
import { readCached, upsert, usePeriod } from '../../lib/store'
import { loadPhotoDataUrl } from '../../lib/photoStorage.js'

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
  const absensi = useMemo(() => readCached('absensi'), [tick])

  const periode = periodeKey()
  const myRecords = useMemo(() => absensi
    .filter(a => a.trainerId === trainerId && a.periode === periode)
    .sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1)), [absensi, periode, trainerId])

  const thisWeek = isoWeekKey(new Date().toISOString().slice(0, 10))
  const uncertifiedThisWeek = myRecords.filter(r => isoWeekKey(r.tanggal) === thisWeek && !r.konfirmasiTrainer)
  const [photoUrls, setPhotoUrls] = useState({})

  useEffect(() => {
    let cancelled = false
    const entries = myRecords.flatMap(r => (r.dokumentasi || []).map((entry, index) => ({
      key: `${r.id}-${entry.slot || index}`,
      entry,
    })))
    Promise.all(entries.map(async ({ key, entry }) => [key, await loadPhotoDataUrl(entry)]))
      .then(results => {
        if (!cancelled) setPhotoUrls(Object.fromEntries(results))
      })
    return () => { cancelled = true }
  }, [myRecords])

  function handleCertifyWeek() {
    const now = new Date().toISOString()
    uncertifiedThisWeek.forEach(r => upsert('absensi', { ...r, konfirmasiTrainer: now }))
    setTick(t => t + 1)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-2xl shadow-sm border">
        <h3 className="text-base font-bold text-slate-800">Riwayat Absensi Saya</h3>
        <p className="text-xs text-slate-500">Periode <b>{periode}</b></p>
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
                <th className="py-4 px-6">Asisten</th>
                <th className="py-4 px-6">Dokumentasi</th>
                <th className="py-4 px-6">Catatan</th>
                <th className="py-4 px-6 text-center">Status Trainer</th>
                <th className="py-4 px-6 text-center">Siswa Hadir</th>
                <th className="py-4 px-6 text-center">Konfirmasi Trainer</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {myRecords.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition align-top">
                  <td className="py-4 px-6 font-semibold text-slate-600">{r.tanggal}</td>
                  <td className="py-4 px-6 font-semibold text-slate-600">{r.asistenNama || 'Tanpa Asisten'}</td>
                  <td className="py-4 px-6">
                    <div className="flex gap-2">
                      {(r.dokumentasi || []).map((entry, index) => {
                        const url = photoUrls[`${r.id}-${entry.slot || index}`]
                        return url ? <img key={`${r.id}-${entry.slot || index}`} src={url} alt={entry.slot === 'kegiatan' ? 'Foto Kegiatan' : 'Foto Kehadiran'} className="w-14 h-14 rounded-lg object-cover border" /> : null
                      })}
                      {(r.dokumentasi || []).length === 0 && <span className="text-xs text-slate-400">Tidak ada foto</span>}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-xs text-slate-600 max-w-xs">{r.catatan || '—'}</td>
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
                <tr><td colSpan="7" className="py-12 text-center text-slate-400">Belum ada absensi tercatat untuk periode ini.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-slate-500">Periksa asisten, dokumentasi, dan catatan sebelum menyatakan absensi sesuai dokumen kertas.</p>
        <button
          onClick={handleCertifyWeek}
          disabled={uncertifiedThisWeek.length === 0}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-xs px-4 py-2 rounded-xl transition shadow-sm active:scale-95"
        >
          Saya nyatakan absensi minggu ini sesuai dokumen kertas
        </button>
      </div>
    </div>
  )
}
