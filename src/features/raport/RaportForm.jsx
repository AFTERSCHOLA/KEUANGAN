import { useEffect, useRef, useState } from 'react'
import { readCached, read, writeRemote, getRoleContext } from '../../lib/store.js'
import { newRaport, defaultAcademicYear } from '../../lib/constants.js'
import { RAPORT_ASPECT_KEYS, RAPORT_SEMESTER, raportTotal, raportRataRata } from '../../lib/raport.js'

// Slice 1 Raport (Task 6) — modal isi nilai semester per siswa.
// Idiom meniru SiswaForm (StudentList.jsx): label Indonesia, className
// input/select yang sama, tombol Simpan/Batal. Snapshot tingkat/mapel/
// sekolah dikunci saat create via newRaport(); saat edit record lama
// TIDAK ditulis-ulang (display-cache seperti sekolahNama).
export const RAPORT_DUPLICATE_MSG = 'Raport semester ini sudah ada — buka untuk koreksi'

const ASPECT_LABELS = {
  helpingTeam: 'Helping Team',
  computationalThinking: 'Computational Thinking',
  problemSolving: 'Problem Solving',
  creativity: 'Creativity',
}

const STATUS_OPTIONS = ['Draft', 'Diajukan', 'Terverifikasi']

function emptyNilai() {
  return Object.fromEntries(RAPORT_ASPECT_KEYS.map(k => [k, '']))
}

export default function RaportForm({ open, onClose, editing, siswaList, onSaved, showToast }) {
  const role = getRoleContext().role
  const isTrainer = role === 'trainer'
  // Verifikasi (Terverifikasi) hanya admin_cabang/superadmin — server
  // 403 untuk trainer (authorize.php); opsi disembunyikan di form juga.
  const statusOptions = isTrainer ? STATUS_OPTIONS.slice(0, 2) : STATUS_OPTIONS

  const [form, setForm] = useState(null)
  const [baseRecord, setBaseRecord] = useState(null)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  // siswaList identity berubah tiap tick store — baca via ref supaya
  // resolve read() yang mendarat saat dialog terbuka TIDAK me-reset
  // ketikan pengguna (hanya open/editing yang me-reset form).
  const siswaListRef = useRef(siswaList)
  siswaListRef.current = siswaList

  useEffect(() => {
    if (!open) return
    setErrorMsg('')
    setSaving(false)
    const daftarSiswa = siswaListRef.current
    if (editing) {
      setBaseRecord(editing)
      setForm({
        siswaId: editing.siswaId || '',
        semester: editing.semester || 'Ganjil',
        tahunAjaran: String(editing.tahunAjaran ?? defaultAcademicYear()),
        nilai: Object.fromEntries(RAPORT_ASPECT_KEYS.map(k => [
          k,
          editing.nilai?.[k] === null || editing.nilai?.[k] === undefined ? '' : String(editing.nilai[k]),
        ])),
        grade: editing.grade || '',
        catatan: editing.catatan || '',
        status: editing.status || 'Draft',
      })
    } else {
      setBaseRecord(null)
      setForm({
        siswaId: daftarSiswa?.[0]?.id || '',
        semester: 'Ganjil',
        tahunAjaran: String(defaultAcademicYear()),
        nilai: emptyNilai(),
        grade: '',
        catatan: '',
        status: 'Draft',
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  if (!open || !form) return null

  const previewTotal = raportTotal(Object.fromEntries(
    RAPORT_ASPECT_KEYS.map(k => [k, form.nilai[k] === '' ? null : Number(form.nilai[k])])
  ))
  const previewRata = raportRataRata(Object.fromEntries(
    RAPORT_ASPECT_KEYS.map(k => [k, form.nilai[k] === '' ? null : Number(form.nilai[k])])
  ))

  function setNilai(key, value) {
    setForm({ ...form, nilai: { ...form.nilai, [key]: value } })
  }

  function validate() {
    if (!form.siswaId) return 'Pilih siswa terlebih dahulu.'
    if (!RAPORT_SEMESTER.includes(form.semester)) return 'Semester wajib dipilih.'
    const tahun = Number(form.tahunAjaran)
    if (!Number.isInteger(tahun) || tahun < 2000) return 'Tahun ajaran tidak valid.'
    for (const k of RAPORT_ASPECT_KEYS) {
      const raw = form.nilai[k]
      const n = Number(raw)
      if (raw === '' || raw === null || !Number.isInteger(n) || n < 0 || n > 100) {
        return `Nilai ${ASPECT_LABELS[k]} wajib diisi 0–100.`
      }
    }
    if (!form.grade.trim()) return 'Grade wajib diisi.'
    if (form.grade.trim().length > 5) return 'Grade maksimal 5 karakter.'
    if (form.catatan && form.catatan.length > 500) return 'Catatan maksimal 500 karakter.'
    if (!statusOptions.includes(form.status)) return 'Status tidak valid.'
    return null
  }

  async function save() {
    if (saving) return
    const invalid = validate()
    if (invalid) {
      setErrorMsg(invalid)
      return
    }
    setSaving(true)
    setErrorMsg('')
    try {
      const siswa = (siswaList || []).find(s => s.id === form.siswaId)
      if (!siswa) {
        setErrorMsg('Pilih siswa terlebih dahulu.')
        setSaving(false)
        return
      }
      const sekolahList = readCached('sekolah')
      const sekolah = sekolahList.find(s => s.id === siswa.sekolahId)
      const tahun = Number(form.tahunAjaran)
      const nilai = Object.fromEntries(RAPORT_ASPECT_KEYS.map(k => [k, Number(form.nilai[k])]))
      const grade = form.grade.trim()

      let record
      if (baseRecord) {
        // Koreksi: snapshot (tingkatSnapshot/mapelSnapshot/sekolahId)
        // TIDAK ditulis-ulang — edit Data Siswa tidak mengubah raport lama.
        record = {
          ...baseRecord,
          siswaId: form.siswaId,
          semester: form.semester,
          tahunAjaran: tahun,
          nilai,
          total: raportTotal(nilai),
          rataRata: raportRataRata(nilai),
          grade,
          catatan: form.catatan,
          status: form.status,
        }
      } else {
        const cabangKode = readCached('cabang').find(c => c.id === sekolah?.cabangId)?.kode
        record = {
          ...newRaport(siswa, form.semester, tahun, cabangKode),
          nilai,
          total: raportTotal(nilai),
          rataRata: raportRataRata(nilai),
          grade,
          catatan: form.catatan,
          status: form.status,
          cabangId: sekolah?.cabangId ?? null,
        }
      }

      const result = await writeRemote('raport', record)
      if (result.status === 'forbidden') {
        onClose?.()
        showToast?.(result.message || 'Kamu tidak punya izin menyimpan raport ini.')
        return
      }
      if (result.status === 'conflict') {
        if (!baseRecord) {
          // Duplikat (siswa, semester, tahunAjaran) saat create: 409 +
          // muat-ke-form (pola Riwayat Absensi "Muat untuk Koreksi").
          // Form tetap terbuka dengan nilai yang diketik, tapi sekarang
          // terikat ke record yang sudah ada — Simpan berikutnya = koreksi.
          let existing = readCached('raport').find(r =>
            r.siswaId === form.siswaId && r.semester === form.semester && Number(r.tahunAjaran) === tahun
          )
          if (!existing) {
            await read('raport')
            existing = readCached('raport').find(r =>
              r.siswaId === form.siswaId && r.semester === form.semester && Number(r.tahunAjaran) === tahun
            )
          }
          if (existing) setBaseRecord(existing)
          setErrorMsg(RAPORT_DUPLICATE_MSG)
          return
        }
        setErrorMsg('Data raport ini sudah berubah di server. Tutup lalu buka lagi.')
        return
      }
      onSaved?.()
    } catch (error) {
      // 422 validasi server: pesan asli ditampilkan, input tidak hilang.
      setErrorMsg(error?.message || 'Gagal menyimpan raport. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  // Catatan: tanpa Modal sendiri — induk (RaportList) yang membungkus
  // dengan <Modal> + judul Tambah/Koreksi Raport (pola SiswaForm).
  return (
    <>
      <div>
        <label htmlFor="raport-siswa" className="text-xs font-bold text-slate-400 uppercase">
          Siswa
        </label>
        <select
          id="raport-siswa"
          value={form.siswaId}
          onChange={e => setForm({ ...form, siswaId: e.target.value })}
          disabled={saving || !!baseRecord}
          className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white disabled:opacity-60"
        >
          <option value="">-- Pilih Siswa --</option>
          {(siswaList || []).map(s => (
            <option key={s.id} value={s.id}>{s.nama}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="raport-semester" className="text-xs font-bold text-slate-400 uppercase">
            Semester
          </label>
          <select
            id="raport-semester"
            value={form.semester}
            onChange={e => setForm({ ...form, semester: e.target.value })}
            disabled={saving}
            className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white disabled:opacity-60"
          >
            {RAPORT_SEMESTER.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="raport-tahun" className="text-xs font-bold text-slate-400 uppercase">
            Tahun Ajaran
          </label>
          <input
            id="raport-tahun"
            type="number"
            min={2000}
            value={form.tahunAjaran}
            onChange={e => setForm({ ...form, tahunAjaran: e.target.value })}
            disabled={saving}
            className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {RAPORT_ASPECT_KEYS.map(k => (
          <div key={k}>
            <label htmlFor={`raport-nilai-${k}`} className="text-xs font-bold text-slate-400 uppercase">
              {ASPECT_LABELS[k]}
            </label>
            <input
              id={`raport-nilai-${k}`}
              type="number"
              min={0}
              max={100}
              value={form.nilai[k]}
              onChange={e => setNilai(k, e.target.value)}
              disabled={saving}
              className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
            />
          </div>
        ))}
      </div>

      <div>
        <label htmlFor="raport-grade" className="text-xs font-bold text-slate-400 uppercase">
          Grade
        </label>
        <input
          id="raport-grade"
          value={form.grade}
          onChange={e => setForm({ ...form, grade: e.target.value })}
          disabled={saving}
          maxLength={5}
          placeholder="cth: A-"
          className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
        />
      </div>

      <div>
        <label htmlFor="raport-catatan" className="text-xs font-bold text-slate-400 uppercase">
          Catatan
        </label>
        <textarea
          id="raport-catatan"
          value={form.catatan}
          onChange={e => setForm({ ...form, catatan: e.target.value })}
          disabled={saving}
          rows={2}
          className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
        />
      </div>

      <div>
        <label htmlFor="raport-status" className="text-xs font-bold text-slate-400 uppercase">
          Status
        </label>
        <select
          id="raport-status"
          value={form.status}
          onChange={e => setForm({ ...form, status: e.target.value })}
          disabled={saving}
          className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white disabled:opacity-60"
        >
          {statusOptions.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="bg-slate-50 rounded-lg p-3 text-xs border">
        <p className="flex justify-between">
          <span className="text-slate-400">Total:</span>
          <span className="font-extrabold text-blue-700">{previewTotal}</span>
        </p>
        <p className="flex justify-between">
          <span className="text-slate-400">Rata-rata:</span>
          <span className="font-bold">{previewRata}</span>
        </p>
      </div>

      {errorMsg && <p role="alert" className="text-xs text-rose-600 font-semibold">{errorMsg}</p>}

      <div className="flex gap-3 pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm"
        >
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
        <button
          onClick={() => !saving && onClose?.()}
          disabled={saving}
          className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition"
        >
          Batal
        </button>
      </div>
    </>
  )
}
