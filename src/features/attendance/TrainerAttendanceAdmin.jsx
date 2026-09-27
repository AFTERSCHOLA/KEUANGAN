import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { readCached, correctLedgerEntry, usePeriod, subscribeStore, read } from '../../lib/store'
import { generateId } from '../../lib/constants'
import Modal from '../../components/Modal.jsx'
import { resolveCurrentAbsensiPengajar, buildPengajarCorrection } from '../../lib/trainerAttendance.js'

// TA.B.4 — admin-side list + correction UI for `absensiPengajar`
// (self-attendance records written by trainers via TrainerAttendanceForm,
// TA.B.3). This is a SEPARATE entity/component from RiwayatAbsensi.jsx
// (which handles the legacy `absensi` entity) per D-TA7/R-TA1 — do not
// merge, even though the two share a similar list+correct shape.
//
// Correction pattern (per D-... / R-TA4, verified server-side in
// server/tests/endpoint.protection.php "TA.B.4 correction" section):
// this does NOT use upsert() (that's the append-only self-write path
// trainers use). Corrections go through correctLedgerEntry(), which
// POSTs { record, correctionOf, action: 'correct' } to
// /api/absensiPengajar.php and appends a NEW record carrying
// correctionOf — the original row is never mutated or removed (R-TA1
// append-only ledger invariant, mirrors sppPayments/honorPayments).
//
// ASUMSI belum terverifikasi terhadap kode asli (tandai jelas, bukan
// disembunyikan): field yang bisa dikoreksi dibatasi ke status /
// keterangan / catatan — identitas record (tanggal, sekolahId,
// trainerId, cabangId) diwarisi apa adanya dari record asli, karena
// "koreksi" secara konsep bukan "pindahkan ke sekolah/trainer/tanggal
// lain" (itu akan jadi record baru, bukan koreksi). Kalau pola form
// koreksi absensi legacy yang asli (RiwayatAbsensi -> index.jsx
// onLoadForCorrection) ternyata mengizinkan field lebih luas, sesuaikan
// STATUS/KETERANGAN di bawah supaya konsisten.

const STATUS_OPTIONS = ['Hadir', 'Izin', 'Alpa']

export default function TrainerAttendanceAdmin() {
  const { periodeKey } = usePeriod()
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick(t => t + 1), [])

  // TA.B.4 bug fix: tanpa ini, komponen render sekali dari cache lokal
  // saat mount lalu tidak pernah re-render lagi ketika hydrateServerData()
  // (App.jsx, async, di belakang mount) selesai menulis data baru ke
  // store — 'tick' sebelumnya cuma diupdate manual habis submitCorrection,
  // jadi sekolah/trainer/absensiPengajar yang baru masuk ke cache SETELAH
  // mount tidak pernah terlihat sampai ada aksi lokal apa pun di komponen
  // ini. Terbukti lewat TA.B.4 test: superadmin re-login, sekolah cabang
  // lain sudah ADA di response /api/read.php, tapi tabel tetap menampilkan
  // "Sekolah tidak ditemukan" karena cache di-snapshot sebelum hydrate
  // selesai. Pola subscribeStore ini mengikuti BranchProvider di store.js.
  useEffect(() => {
    const unsubscribe = subscribeStore(bump)
    return unsubscribe
  }, [bump])

  const sekolah = useMemo(() => readCached('sekolah'), [tick])
  const trainer = useMemo(() => readCached('trainer'), [tick])
  const absensiPengajar = useMemo(() => readCached('absensiPengajar'), [tick])

  useEffect(() => {
  read('absensiPengajar').then(() => setTick(t => t + 1))
}, [])

  const [filterSekolahId, setFilterSekolahId] = useState('')
  const [correcting, setCorrecting] = useState(null) // record sedang dikoreksi
  const [form, setForm] = useState({ status: 'Hadir', keterangan: '', catatan: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const periode = periodeKey()

  function schoolName(id) {
    return sekolah.find(s => s.id === id)?.nama || 'Sekolah tidak ditemukan'
  }
  function trainerName(id) {
    return trainer.find(t => t.id === id)?.nama || 'Trainer tidak ditemukan'
  }

  // Hanya baris TERBARU per (trainerId, sekolahId, tanggal) yang
  // ditampilkan sebagai baris aktif — record dengan correctionOf adalah
  // koreksi dari record lain, jadi yang lama disembunyikan dari tampilan
  // utama (tapi tidak dihapus dari data, R-TA1).
  const visibleRows = useMemo(() => {
    const filtered = absensiPengajar
     .filter(r => r.periode === periode)
     .filter(r => !filterSekolahId || r.sekolahId === filterSekolahId)
   return resolveCurrentAbsensiPengajar(filtered).sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1))
  }, [absensiPengajar, periode, filterSekolahId])

  function openCorrection(record) {
    setError('')
    setCorrecting(record)
    setForm({
      status: record.status || 'Hadir',
      keterangan: record.keterangan || '',
      catatan: record.catatan || '',
    })
  }

  async function submitCorrection() {
    if (!correcting) return
    setSaving(true)
    setError('')

    const original = correcting
    // DC.A.1 (F-DC1; D-DC2) — role rides unchanged so a text-only
    // correction never reprices pay.
    const correction = buildPengajarCorrection(original, {
      id: generateId('absp'),
      status: form.status,
      keterangan: form.keterangan || null,
      catatan: form.catatan,
    })

    const result = await correctLedgerEntry('absensiPengajar', original, correction)
    setSaving(false)

    if (result.status === 'forbidden') {
      setError(result.message || 'Tidak diizinkan mengoreksi record ini.')
      return
    }
    if (result.status !== 'ok') {
      setError('Gagal menyimpan koreksi. Coba lagi.')
      return
    }
    setCorrecting(null)
    setTick(t => t + 1)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-2xl shadow-sm border flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800">Absensi Tenaga Pengajar</h3>
          <p className="text-xs text-slate-500">
            Periode <b>{periode}</b> — {visibleRows.length} record
          </p>
        </div>
        <select
          value={filterSekolahId}
          onChange={(e) => setFilterSekolahId(e.target.value)}
          className="rounded-lg border p-2 text-xs bg-white font-semibold"
        >
          <option value="">Semua Sekolah</option>
          {sekolah.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
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
                <th className="py-4 px-6 text-center">Status</th>
                <th className="py-4 px-6">Keterangan</th>
                <th className="py-4 px-6 text-center">Dikoreksi</th>
                <th className="py-4 px-6 text-center">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {visibleRows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition">
                  <td className="py-4 px-6 font-semibold text-slate-600">{r.tanggal}</td>
                  <td className="py-4 px-6 font-bold text-slate-800">{schoolName(r.sekolahId)}</td>
                  <td className="py-4 px-6 font-semibold text-slate-600">{trainerName(r.trainerId)}</td>
                  <td className="py-4 px-6 text-center">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                      r.status === 'Hadir' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-[11px] text-slate-500">{[r.keterangan, r.catatan].filter(Boolean).join(' — ') || '—'}</td>
                  <td className="py-4 px-6 text-center">
                    {r.correctionOf ? (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                        Sudah dikoreksi
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-center">
                    <button
                      onClick={() => openCorrection(r)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] px-3.5 py-1.5 rounded-lg transition shadow-sm active:scale-95"
                    >
                      Koreksi
                    </button>
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Belum ada absensi tenaga pengajar untuk periode ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!correcting}
        onClose={() => !saving && setCorrecting(null)}
        title={correcting ? `Koreksi Absensi — ${trainerName(correcting.trainerId)}` : ''}
      >
        {correcting && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              {correcting.tanggal} — {schoolName(correcting.sekolahId)}. Koreksi tersimpan sebagai
              record baru (mengacu ke record asli), record lama tidak diubah.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full rounded-lg border p-2 text-sm"
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Keterangan</label>
              <input
                type="text"
                value={form.keterangan}
                onChange={(e) => setForm(f => ({ ...f, keterangan: e.target.value }))}
                className="w-full rounded-lg border p-2 text-sm"
                placeholder="Opsional"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Catatan Koreksi</label>
              <textarea
                value={form.catatan}
                onChange={(e) => setForm(f => ({ ...f, catatan: e.target.value }))}
                className="w-full rounded-lg border p-2 text-sm"
                rows={3}
                placeholder="Alasan koreksi (disarankan diisi untuk audit)"
              />
            </div>

            {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCorrecting(null)}
                disabled={saving}
                className="text-xs font-bold px-4 py-2 rounded-lg text-slate-500 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                onClick={submitCorrection}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs px-4 py-2 rounded-lg transition shadow-sm active:scale-95 disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan Koreksi'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}