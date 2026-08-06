import { useState } from 'react'
import { read, upsert, write } from '../../lib/store.js'
import { formatRupiah } from '../../lib/format.js'

export default function AttendanceForm() {
  const [sekolah] = useState(() => read('sekolah'))
  const [trainers] = useState(() => read('trainer'))
  const [siswa] = useState(() => read('siswa'))
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10))
  const [sekolahId, setSekolahId] = useState('')
  const [trainerId, setTrainerId] = useState('')
  const [siswaStatus, setSiswaStatus] = useState({})
  const [saved, setSaved] = useState(false)

  const filteredSiswa = siswa.filter(s => s.sekolahId === sekolahId)
  const selectedSekolah = sekolah.find(s => s.id === sekolahId)
  const availableTrainers = trainers.filter(t => selectedSekolah?.trainerIds?.includes(t.id))

  function toggleSiswa(id) {
    setSiswaStatus(prev => ({ ...prev, [id]: prev[id] === 'Hadir' ? 'Tidak Hadir' : 'Hadir' }))
  }

  function submit() {
    if (!tanggal || !sekolahId || !trainerId) {
      alert('Lengkapi tanggal, sekolah, dan trainer.')
      return
    }
    const trainer = trainers.find(t => t.id === trainerId)
    const id = `${tanggal}_${sekolahId}_${trainerId}`
    const absensi = read('absensi')
    const existing = absensi.find(a => a.id === id)
    const record = {
      id,
      tanggal,
      periode: tanggal.slice(0, 7),
      sekolahId,
      trainerId,
      trainerNama: trainer ? trainer.nama : '',
      trainerStatus: 'Hadir',
      siswaList: filteredSiswa.map(s => ({
        siswaId: s.id,
        nama: s.nama,
        status: siswaStatus[s.id] === 'Hadir' ? 'Hadir' : 'Tidak Hadir',
      })),
    }
    if (existing) {
      const idx = absensi.findIndex(a => a.id === id)
      absensi[idx] = record
      write('absensi', absensi)
    } else {
      upsert('absensi', record)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
            <select value={trainerId} onChange={e => { setTrainerId(e.target.value); setSaved(false) }} className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white" disabled={!sekolahId}>
              <option value="">-- Pilih Trainer --</option>
              {availableTrainers.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
            </select>
            {sekolahId && availableTrainers.length === 0 && (
              <p className="text-[11px] text-rose-500 mt-1">Sekolah ini belum punya trainer yang ditugaskan.</p>
            )}
          </div>
          {tanggal && sekolahId && trainerId && (
            <button onClick={submit} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm active:scale-95">Simpan Absensi</button>
          )}
        </div>

        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border">
          {!sekolahId || !trainerId ? (
            <p className="text-center text-slate-400 py-10">Pilih sekolah dan trainer untuk memuat absensi.</p>
          ) : filteredSiswa.length === 0 ? (
            <p className="text-center text-slate-400 py-10">Belum ada siswa di sekolah ini.</p>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-slate-700 mb-3">Daftar Siswa — tap untuk toggle kehadiran</h3>
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
          )}
        </div>
      </div>
    </div>
  )
}
