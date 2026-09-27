import { useState, useMemo } from 'react'
import { readCached, writeRemote, getRoleContext } from '../../lib/store.js'
import { getSafeIdentityContext } from '../../lib/auth.js'
import { newAbsensiPengajar, localDateString } from '../../lib/constants.js'
import AlertDialog from '../../components/AlertDialog.jsx'

const STATUS_OPTIONS = ['Hadir', 'Izin', 'Alpa']
const KETERANGAN_OPTIONS = ['EXPO', 'Pengganti', 'Lainnya']
// CS.B.2 (D-CS3) — per-session role. Stored on the attendance row (peran
// I/A), never on live tipePengajar; the same person is I in one row and
// A in another with no type change.
const PERAN_OPTIONS = [
  { label: 'Instruktur', value: 'I' },
  { label: 'Asisten', value: 'A' },
]

// TA.B.3 (F-TA4, F-TA8; D-TA9, D-TA10; R-TA8) — trainer/asisten self
// attendance form. Sekolah hanya berasal dari penugasanPengajar milik
// trainer sendiri yang aktif=true dan tanggal-nya masuk rentang
// periodeMulai..periodeSelesai — bukan input bebas (R-TA8), sama
// logic-nya dengan trainerHasActiveAssignmentClient() di store.js dan
// trainerHasActiveAssignment() di server/auth/authorize.php.
export default function TrainerAttendanceForm({ trainerId }) {
  const [dataRev, setDataRev] = useState(0)
  const [tanggal, setTanggal] = useState(localDateString())
  const [sekolahId, setSekolahId] = useState('')
  const [personId, setPersonId] = useState('') // '' = self; else external id
  const [peran, setPeran] = useState('I')
  const [status, setStatus] = useState('Hadir')
  const [keterangan, setKeterangan] = useState('')
  const [catatan, setCatatan] = useState('')
  const [saved, setSaved] = useState(false)
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertMsg, setAlertMsg] = useState('')

  const sekolahAll = useMemo(() => readCached('sekolah'), [dataRev])
  const trainers = useMemo(() => readCached('trainer'), [dataRev])
  const eksternals = useMemo(() => readCached('eksternal'), [dataRev])
  const trainer = trainers.find(t => t.id === trainerId)
  const ctx = getRoleContext()
  const identity = getSafeIdentityContext()

  // Sekolah yang valid untuk tanggal terpilih: assignment aktif=true di
  // trainer manapun yang mencantumkan trainerId ini sebagai trainerId,
  // asistenId ATAU asistenIds (CS.B.2 D-CS4 union read), dan tanggal
  // masuk periodeMulai..periodeSelesai (periodeSelesai null = ongoing,
  // sama keputusan seperti server).
  const validSekolahForDate = useMemo(() => {
    const ids = new Set()
    trainers.forEach(t => {
      const assignments = Array.isArray(t.penugasanPengajar) ? t.penugasanPengajar : []
      assignments.forEach(a => {
        if (!a || !a.sekolahId) return
        const matchesTrainer = a.trainerId === trainerId || a.asistenId === trainerId
          || (Array.isArray(a.asistenIds) && a.asistenIds.includes(trainerId))
        if (!matchesTrainer) return
        if (a.aktif !== true) return
        if (!a.periodeMulai || tanggal < a.periodeMulai) return
        if (a.periodeSelesai != null && tanggal > a.periodeSelesai) return
        ids.add(a.sekolahId)
      })
    })
    return sekolahAll.filter(s => ids.has(s.id))
  }, [trainers, sekolahAll, trainerId, tanggal])

  // CS.B.2 (D-CS5) — external picker, reference-only for trainers: only
  // externals attached to the trainer's own valid schools for this date.
  // Creation itself is admin-only (no create control exists in this form).
  const validEksternalForDate = useMemo(() => {
    const schoolIds = new Set(validSekolahForDate.map(s => s.id))
    return (eksternals || []).filter(e => e && schoolIds.has(e.sekolahId))
  }, [eksternals, validSekolahForDate])

  function handleTanggalChange(value) {
    setTanggal(value)
    setSekolahId('')
    setSaved(false)
  }

  async function handleSubmit() {
    if (!tanggal || !sekolahId) {
      setAlertMsg('Lengkapi tanggal dan sekolah.')
      setAlertOpen(true)
      return
    }
    // CS.B.2 (D-CS3/D-CS5) — per-session role rides on the row; an
    // external row must carry dicatatOleh = own user id (who claimed the
    // 50k). Internal rows never carry a recorder.
    const recordPersonId = personId || trainerId
    const isExternal = personId !== ''
    const record = newAbsensiPengajar({
      tanggal,
      sekolahId,
      trainerId: recordPersonId,
      status,
      keterangan: keterangan || null,
      catatan,
      cabangId: trainer?.cabangId || ctx.cabangId,
      peran,
      dicatatOleh: isExternal ? identity?.id || null : null,
    })
    try {
     const result = await writeRemote('absensiPengajar', record)
     if (result.status === 'forbidden') {
       setAlertMsg(result.message || 'Kamu tidak punya izin mencatat absensi ini.')
       setAlertOpen(true)
       return
     }
     if (result.status === 'conflict') {
       setAlertMsg('Sudah ada catatan absensi untuk tanggal/sekolah ini. Muat ulang halaman.')
       setAlertOpen(true)
       return
     }
      setSaved(true)
      setStatus('Hadir')
      setKeterangan('')
      setCatatan('')
      setSekolahId('')
      setPersonId('')
      setPeran('I')
      setTimeout(() => setSaved(false), 2000)
   } catch (error) {
     // Sebelumnya (upsert(), fire-and-forget) error apa pun di sini
     // gagal diam-diam — trainer kelihatan "berhasil" simpan padahal
     // sebenarnya gagal. Sekarang pesan server asli ditampilkan.
     setAlertMsg(error?.message || 'Gagal menyimpan absensi. Coba lagi.')
     setAlertOpen(true)
   }
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Absensi Saya</h2>
          <p className="text-xs text-slate-500">Catat kehadiran Anda sebagai tenaga pengajar.</p>
        </div>
        {saved && <span className="bg-emerald-100 text-emerald-800 text-xs px-3 py-1.5 rounded-full font-bold">Tersimpan</span>}
      </div>
      <AlertDialog open={alertOpen} onOk={() => setAlertOpen(false)} title="Peringatan" body={alertMsg} />

      <div className="bg-white p-5 rounded-2xl shadow-sm border space-y-4 max-w-xl">
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Tanggal</label>
          <input
            type="date"
            value={tanggal}
            onChange={e => handleTanggalChange(e.target.value)}
            className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Sekolah</label>
          <select
            value={sekolahId}
            onChange={e => { setSekolahId(e.target.value); setSaved(false) }}
            className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white"
            disabled={validSekolahForDate.length === 0}
          >
            <option value="">-- Pilih Sekolah --</option>
            {validSekolahForDate.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
          {validSekolahForDate.length === 0 && (
            <p className="text-[11px] text-rose-500 mt-1">Tidak ada penugasan aktif untuk tanggal ini. Minta Admin Cabang membuat penugasan.</p>
          )}
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Kehadiran untuk</label>
          <select
            value={personId}
            onChange={e => { setPersonId(e.target.value); setSaved(false) }}
            className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white"
          >
            <option value="">Saya — {trainer?.nama || 'Trainer'}</option>
            {validEksternalForDate.map(e => <option key={e.id} value={e.id}>{e.nama} (eksternal)</option>)}
          </select>
          {personId !== '' && (
            <p className="text-[11px] text-slate-500 mt-1">Dicatat oleh: {trainer?.nama || 'Saya'} (otomatis)</p>
          )}
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Peran sesi ini</label>
          <div className="flex items-center gap-2 mt-1">
            {PERAN_OPTIONS.map(p => (
              <button
                key={p.value}
                type="button"
                onClick={() => { setPeran(p.value); setSaved(false) }}
                className={`text-xs font-bold px-3.5 py-1.5 rounded-full transition ${peran === p.value ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Status</label>
          <div className="flex items-center gap-2 mt-1">
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => { setStatus(s); setSaved(false) }}
                className={`text-xs font-bold px-3.5 py-1.5 rounded-full transition ${status === s ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Keterangan <span className="normal-case font-normal text-slate-400">(opsional)</span></label>
          <select
            value={keterangan}
            onChange={e => { setKeterangan(e.target.value); setSaved(false) }}
            className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white"
          >
            <option value="">— Tidak ada —</option>
            {KETERANGAN_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Catatan <span className="normal-case font-normal text-slate-400">(opsional)</span></label>
          <textarea
            value={catatan}
            onChange={e => { setCatatan(e.target.value); setSaved(false) }}
            rows={3}
            placeholder="Catatan tambahan..."
            className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 resize-none"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!tanggal || !sekolahId}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm active:scale-95"
        >
          Simpan Absensi
        </button>
      </div>
    </div>
  )
}
