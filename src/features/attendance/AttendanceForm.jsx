import { useState, useMemo, useEffect } from 'react'
import { readCached, upsert } from '../../lib/store.js'
import { newAbsensi } from '../../lib/constants.js'
import AlertDialog from '../../components/AlertDialog.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import QuickSession from './QuickSession.jsx'
import { localStorageUsageBytes, LOCALSTORAGE_WARN_THRESHOLD } from '../../lib/photoStorage.js'
import PhotoSlot from '../../components/PhotoSlot.jsx'

export default function AttendanceForm({ editingRecord, onSaved }) {
  const [dataRev, setDataRev] = useState(0)
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10))
  const [sekolahId, setSekolahId] = useState('')
  const [trainerId, setTrainerId] = useState('')
  const [trainerStatus, setTrainerStatus] = useState('Hadir')
  const [siswaStatus, setSiswaStatus] = useState({})
  const [asistenId, setAsistenId] = useState('')
  const [catatan, setCatatan] = useState('')
  const [fotoKehadiran, setFotoKehadiran] = useState(null)
  const [fotoKegiatan, setFotoKegiatan] = useState(null)
  const [saved, setSaved] = useState(false)
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertMsg, setAlertMsg] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const sekolah = useMemo(() => readCached('sekolah'), [dataRev])
  const trainers = useMemo(() => readCached('trainer'), [dataRev])
  const siswa = useMemo(() => readCached('siswa'), [dataRev])

  useEffect(() => {
    if (editingRecord) {
      setTanggal(editingRecord.tanggal || '')
      setSekolahId(editingRecord.sekolahId || '')
      setTrainerId(editingRecord.trainerId || '')
      setTrainerStatus(editingRecord.trainerStatus || 'Hadir')
      setAsistenId(editingRecord.asistenId || '')
      setCatatan(editingRecord.catatan || '')
      const dok = editingRecord.dokumentasi || []
      setFotoKehadiran(dok.find(d => d.slot === 'kehadiran') || null)
      setFotoKegiatan(dok.find(d => d.slot === 'kegiatan') || null)
      const map = {}
      ;(editingRecord.siswaList || []).forEach(s => { map[s.siswaId] = s.status })
      setSiswaStatus(map)
      setDataRev(prev => prev + 1)
    }
  }, [editingRecord])

  const filteredSiswa = siswa.filter(s => s.sekolahId === sekolahId)
  const selectedSekolah = sekolah.find(s => s.id === sekolahId)
  const availableTrainers = trainers.filter(t => selectedSekolah?.trainerIds?.includes(t.id))
  const availableAsisten = availableTrainers.filter(t => t.id !== trainerId)
  const hadirCount = filteredSiswa.filter(s => siswaStatus[s.id] === 'Hadir').length

  function toggleSiswa(id) {
    setSiswaStatus(prev => ({ ...prev, [id]: prev[id] === 'Hadir' ? 'Tidak Hadir' : 'Hadir' }))
  }

  function setAllHadir() {
    const next = {}
    filteredSiswa.forEach(s => { next[s.id] = 'Hadir' })
    setSiswaStatus(next)
    setSaved(false)
  }

  function attemptSubmit() {
    if (!tanggal || !sekolahId || !trainerId) {
      setAlertMsg('Lengkapi tanggal, sekolah, dan trainer.')
      setAlertOpen(true)
      return
    }
    if (asistenId && asistenId === trainerId) {
      setAlertMsg('Asisten tidak boleh sama dengan trainer utama.')
      setAlertOpen(true)
      return
    }
    setConfirmOpen(true)
  }

  function doSave() {
    setConfirmOpen(false)
    const trainer = trainers.find(t => t.id === trainerId)
    const asisten = asistenId ? trainers.find(t => t.id === asistenId) : null
    const dokumentasi = [
      fotoKehadiran ? { ...fotoKehadiran, slot: 'kehadiran' } : null,
      fotoKegiatan ? { ...fotoKegiatan, slot: 'kegiatan' } : null,
    ].filter(Boolean)
    const record = newAbsensi({
      id: editingRecord ? editingRecord.id : undefined,
      tanggal,
      sekolahId,
      trainerId,
      trainerNama: trainer ? trainer.nama : '',
      trainerStatus,
      siswaList: filteredSiswa.map(s => ({
        siswaId: s.id,
        nama: s.nama,
        status: siswaStatus[s.id] === 'Hadir' ? 'Hadir' : 'Tidak Hadir',
      })),
      asistenId: asisten ? asisten.id : null,
      asistenNama: asisten ? asisten.nama : null,
      catatan,
      dokumentasi,
      foto: editingRecord?.foto || '',
      statusVerifikasi: editingRecord?.statusVerifikasi || null,
      konfirmasiTrainer: editingRecord?.konfirmasiTrainer || null,
      sesiKe: editingRecord?.sesiKe || 1,
      lastEditedAt: editingRecord ? new Date().toISOString() : null,
    })
    upsert('absensi', record)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)

    const usage = localStorageUsageBytes()
    if (usage > LOCALSTORAGE_WARN_THRESHOLD) {
      setAlertMsg(`Peringatan: penyimpanan lokal sudah terpakai ${(usage / 1024 / 1024).toFixed(1)} MB. Pertimbangkan backup & bersihkan data lama.`)
      setAlertOpen(true)
    }

    if (onSaved) onSaved()
  }

  // M4.4: empty-state polish — tanpa sekolah, form ini tidak bisa
  // dipakai sama sekali (dropdown sekolah kosong); beri arahan yang
  // jelas daripada membiarkan panel form yang "hidup" tapi tak berguna.
  if (sekolah.length === 0) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Lembar Absensi Harian Kelas</h2>
            <p className="text-xs text-slate-500">Mencatat data kehadiran guru dan siswa</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-sm border text-center">
          <p className="text-slate-400 text-sm">Belum ada data sekolah mitra. Tambahkan sekolah terlebih dahulu di tab Data Sekolah sebelum mencatat absensi.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Lembar Absensi Harian Kelas</h2>
          <p className="text-xs text-slate-500">Mencatat data kehadiran guru dan siswa</p>
        </div>
        {saved && <span className="bg-emerald-100 text-emerald-800 text-xs px-3 py-1.5 rounded-full font-bold">Tersimpan</span>}
      </div>
      <AlertDialog open={alertOpen} onOk={() => setAlertOpen(false)} title="Peringatan" body={alertMsg} />
      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={doSave}
        title="Konfirmasi Kehadiran"
        body={`${hadirCount} siswa tercatat hadir — sesuai catatan kertas?`}
        confirmLabel="Ya, Simpan"
        cancelLabel="Cek Ulang"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="bg-white p-5 rounded-2xl shadow-sm border space-y-4">
          <h3 className="text-base font-bold text-slate-800">Pilih Kelas & Sesi</h3>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Tanggal Kelas</label>
            <input type="date" value={tanggal} onChange={e => { setTanggal(e.target.value); setSaved(false) }} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Sekolah</label>
            <select value={sekolahId} onChange={e => { setSekolahId(e.target.value); setSiswaStatus({}); setSaved(false); setTrainerId('') }} className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white">
              <option value="">-- Pilih Sekolah --</option>
              {sekolah.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Trainer</label>
            <select value={trainerId} onChange={e => {
              const val = e.target.value
              setTrainerId(val)
              setSaved(false)
              if (asistenId === val) setAsistenId('')
            }} className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white" disabled={!sekolahId}>
              <option value="">-- Pilih Trainer --</option>
              {availableTrainers.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
            </select>
            {sekolahId && availableTrainers.length === 0 && (
              <p className="text-[11px] text-rose-500 mt-1">Sekolah ini belum punya trainer yang ditugaskan.</p>
            )}
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Asisten <span className="normal-case font-normal text-slate-400">(opsional)</span></label>
            <select value={asistenId} onChange={e => { setAsistenId(e.target.value); setSaved(false) }} className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white" disabled={!trainerId}>
              <option value="">— Tanpa Asisten —</option>
              {availableAsisten.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Catatan <span className="normal-case font-normal text-slate-400">(opsional)</span></label>
            <textarea
              value={catatan}
              onChange={e => { setCatatan(e.target.value); setSaved(false) }}
              rows={3}
              placeholder="Catatan tambahan untuk sesi ini..."
              className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 resize-none"
            />
          </div>
          <div className="space-y-2">
            <PhotoSlot label="Foto Kehadiran" entry={fotoKehadiran} onChange={v => { setFotoKehadiran(v); setSaved(false) }} disabled={!trainerId} />
            <PhotoSlot label="Foto Kegiatan" entry={fotoKegiatan} onChange={v => { setFotoKegiatan(v); setSaved(false) }} disabled={!trainerId} />
            <p className="text-[11px] font-semibold text-slate-400">Simpan kertas absensi minimal 1 tahun ajaran.</p>
          </div>
          {tanggal && sekolahId && trainerId && (
            <button onClick={attemptSubmit} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm active:scale-95">Simpan Absensi</button>
          )}
        </div>

        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border">
          {!sekolahId || !trainerId ? (
            <p className="text-center text-slate-400 py-10">Pilih sekolah dan trainer untuk memuat absensi.</p>
          ) : filteredSiswa.length === 0 ? (
            <p className="text-center text-slate-400 py-10">Belum ada siswa di sekolah ini.</p>
          ) : (
            <>
              <QuickSession siswaList={filteredSiswa} hadirCount={hadirCount} onSetAllHadir={setAllHadir} />
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-bold text-slate-400 uppercase">Status Trainer:</span>
                  {['Hadir', 'Izin', 'Alpa'].map(s => (
                    <button
                      key={s}
                      onClick={() => { setTrainerStatus(s); setSaved(false) }}
                      className={`text-xs font-bold px-3.5 py-1.5 rounded-full transition ${trainerStatus === s ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <h3 className="text-sm font-bold text-slate-700">Daftar Siswa — tap untuk toggle kehadiran</h3>
                {filteredSiswa.map(s => (
                  <div key={s.id} onClick={() => toggleSiswa(s.id)} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                    siswaStatus[s.id] === 'Hadir' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'
                  }`}>
                    <span className="font-semibold text-slate-700">{s.nama}</span>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      siswaStatus[s.id] === 'Hadir' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {siswaStatus[s.id] === 'Hadir' ? 'Hadir' : 'Tidak Hadir'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}