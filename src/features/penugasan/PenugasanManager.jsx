import { useMemo, useState, useEffect, useCallback } from 'react'
import { apiRequest } from '../../lib/api.js'
import { readCached, getRoleContext, writeRemote, subscribeStore } from '../../lib/store.js'
import { localDateString } from '../../lib/constants.js'
import { newPenugasanRow, validateRowDates } from '../../lib/penugasan.js'
import Modal from '../../components/Modal.jsx'
import AlertDialog from '../../components/AlertDialog.jsx'

// PG.A.1 (F-PG1; D-PG1, D-PG2, D-PG3, D-PG7, D-PG8) — explicit assignment
// management. Writes ONLY trainer.penugasanPengajar[] via the existing
// trainer.php update path as a full-array replace (D-PG2); the legacy
// sekolahIds checkbox in TrainerList.jsx is untouched.
// Table + Modal idiom mirrors TrainerAttendanceAdmin.jsx:153-210,
// classNames verbatim; Indonesian copy pinned for getByRole selection.
export default function PenugasanManager() {
  const ctx = getRoleContext()
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick(t => t + 1), [])
  useEffect(() => subscribeStore(bump), [bump])

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ sekolahId: '', trainerId: '', asistenId: '', periodeMulai: localDateString(), ongoing: true, periodeSelesai: '', aktif: true })
  const [saving, setSaving] = useState(false)
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertMsg, setAlertMsg] = useState('')
  const [filterSekolahId, setFilterSekolahId] = useState('')

  // State tambahan buat nama trainer lintas-cabang yang di-resolve dari server
  const [crossScopeNames, setCrossScopeNames] = useState({}) // { [id]: nama }
  const [lookupAttempted, setLookupAttempted] = useState({})

  // readCached is already role-scoped (store.js isWithinScope): admin_cabang
  // sees own branch, superadmin sees all, trainer sees own rows only.
  const sekolah = useMemo(() => readCached('sekolah'), [tick])
  const trainers = useMemo(() => readCached('trainer'), [tick])

  const trainerById = useMemo(() => new Map(trainers.map(t => [t.id, t])), [trainers])
  const sekolahById = useMemo(() => new Map(sekolah.map(s => [s.id, s])), [sekolah])

  const rows = useMemo(() => {
    const out = []
    trainers.forEach(t => {
      const assignments = Array.isArray(t.penugasanPengajar) ? t.penugasanPengajar : []
      assignments.forEach(a => {
        if (!a || typeof a !== 'object') return
        if (filterSekolahId && a.sekolahId !== filterSekolahId) return
        out.push({ hostId: t.id, ...a })
      })
    })
    return out.sort((x, y) => String(x.periodeMulai || '').localeCompare(String(y.periodeMulai || '')))
  }, [trainers, filterSekolahId])

  useEffect(() => {
  const missingIds = [...new Set(
    rows
      .map(r => r.asistenId)
      .filter(id =>
        id &&
        !trainerById.has(id) &&
        !crossScopeNames[id] &&
        !lookupAttempted[id]
      )
  )]

  if (missingIds.length === 0) return

  setLookupAttempted(prev => {
    const next = { ...prev }
    missingIds.forEach(id => {
      next[id] = true
    })
    return next
  })

  apiRequest(
    `/api/trainer-name-lookup.php?ids=${missingIds.join(',')}`,
    { method: 'GET' }
  )
    .then(results => {
      const next = { ...crossScopeNames }

      results.forEach(r => {
        next[r.id] = r.nama
      })

      setCrossScopeNames(next)
    })
    .catch(() => {})
}, [rows, trainerById, crossScopeNames, lookupAttempted])

  function showError(message) {
    setAlertMsg(message)
    setAlertOpen(true)
  }

  function openAdd() {
    setForm({ sekolahId: '', trainerId: '', asistenId: '', periodeMulai: localDateString(), ongoing: true, periodeSelesai: '', aktif: true })
    setModalOpen(true)
  }

  async function save() {
    if (saving) return
    const periodeSelesai = form.ongoing ? null : (form.periodeSelesai || null)
    const err = validateRowDates({ sekolahId: form.sekolahId, trainerId: form.trainerId, periodeMulai: form.periodeMulai, periodeSelesai })
    if (err) {
      showError(err)
      return
    }
    if (form.asistenId && form.asistenId === form.trainerId) {
      showError('Asisten tidak boleh sama dengan instruktur.')
      return
    }
    const host = trainerById.get(form.trainerId)
    if (!host) {
      showError('Instruktur tidak ditemukan. Muat ulang halaman dan coba lagi.')
      return
    }
    const sch = sekolahById.get(form.sekolahId)
    const row = newPenugasanRow({
      sekolahId: form.sekolahId,
      trainerId: form.trainerId,
      asistenId: form.asistenId || null,
      // Nested cabangId: send the school branch so same-branch rows validate
      // (entities.php:176-194); cross-branch rows correctly 422 instead of
      // silently landing (D-PG plan §4).
      cabangId: sch?.cabangId || host?.cabangId || null,
      periodeMulai: form.periodeMulai,
      periodeSelesai,
      aktif: form.aktif,
    })
    setSaving(true)
    try {
      const existing = Array.isArray(host.penugasanPengajar) ? host.penugasanPengajar : []
      const result = await writeRemote('trainer', { ...host, penugasanPengajar: [...existing, row] })
      if (result.status === 'forbidden') {
        showError(result.message || 'Kamu tidak punya izin untuk menyimpan penugasan ini.')
        return
      }
      if (result.status === 'conflict') {
        showError('Data trainer ini sudah berubah di server. Muat ulang halaman sebelum menyimpan lagi.')
        return
      }
      setModalOpen(false)
      bump()
    } catch (error) {
      showError(error?.message || 'Gagal menyimpan penugasan. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(hostId, assignmentId) {
    if (saving) return
    const host = trainerById.get(hostId)
    if (!host) {
      showError('Instruktur tidak ditemukan. Muat ulang halaman dan coba lagi.')
      return
    }
    setSaving(true)
    try {
      const existing = Array.isArray(host.penugasanPengajar) ? host.penugasanPengajar : []
      const next = existing.map(a => (a && a.id === assignmentId ? { ...a, aktif: false } : a))
      const result = await writeRemote('trainer', { ...host, penugasanPengajar: next })
      if (result.status === 'forbidden') {
        showError(result.message || 'Kamu tidak punya izin untuk menonaktifkan penugasan ini.')
        return
      }
      if (result.status === 'conflict') {
        showError('Data trainer ini sudah berubah di server. Muat ulang halaman sebelum menyimpan lagi.')
        return
      }
      bump()
    } catch (error) {
      showError(error?.message || 'Gagal menonaktifkan penugasan. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  if (ctx.role === 'trainer') {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-sm border text-center animate-fadeIn">
        <p className="text-slate-400 text-sm">Halaman ini khusus Admin.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Penugasan Pengajar</h2>
          <p className="text-xs text-slate-500">Kelola penugasan aktif instruktur dan asisten per sekolah.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterSekolahId}
            onChange={e => setFilterSekolahId(e.target.value)}
            aria-label="Filter Sekolah"
            className="rounded-lg border p-2 text-sm bg-white"
          >
            <option value="">Semua Sekolah</option>
            {sekolah.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
          <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold px-5 py-2.5 rounded-xl transition shadow-sm active:scale-95">Tambah Penugasan</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="py-4 px-6">Sekolah</th>
                <th className="py-4 px-6">Instruktur</th>
                <th className="py-4 px-6">Asisten</th>
                <th className="py-4 px-6">Mulai</th>
                <th className="py-4 px-6">Selesai</th>
                <th className="py-4 px-6 text-center">Status</th>
                <th className="py-4 px-6 text-center">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition">
                  <td className="py-4 px-6 font-bold text-slate-800">{sekolahById.get(r.sekolahId)?.nama || 'Sekolah tidak ditemukan'}</td>
                  <td className="py-4 px-6 font-semibold text-slate-600">{trainerById.get(r.trainerId)?.nama || 'Trainer tidak ditemukan'}</td>
                  <td className="py-4 px-6 font-semibold text-slate-600">{r.asistenId ? (trainerById.get(r.asistenId)?.nama || crossScopeNames[r.asistenId] || 'Memuat...') : '—'}</td>
                  <td className="py-4 px-6 font-semibold text-slate-600">{r.periodeMulai || '—'}</td>
                  <td className="py-4 px-6 font-semibold text-slate-600">{r.periodeSelesai || 'Berlaku terus'}</td>
                  <td className="py-4 px-6 text-center">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${r.aktif === true ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {r.aktif === true ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-center">
                    {r.aktif === true && (
                      <button
                        onClick={() => deactivate(r.hostId, r.id)}
                        disabled={saving}
                        className="bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-extrabold text-[11px] px-3.5 py-1.5 rounded-lg transition shadow-sm active:scale-95"
                      >
                        Nonaktifkan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Belum ada penugasan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => !saving && setModalOpen(false)} title="Tambah Penugasan">
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Sekolah</label>
          <select
            value={form.sekolahId}
            onChange={e => setForm({ ...form, sekolahId: e.target.value })}
            disabled={saving}
            className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white disabled:opacity-60"
          >
            <option value="">-- Pilih Sekolah --</option>
            {sekolah.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Instruktur</label>
          <select
            value={form.trainerId}
            onChange={e => setForm({ ...form, trainerId: e.target.value, asistenId: '' })}
            disabled={saving}
            className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white disabled:opacity-60"
          >
            <option value="">-- Pilih Instruktur --</option>
            {trainers.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Asisten <span className="normal-case font-normal text-slate-400">(opsional)</span></label>
          <select
            value={form.asistenId}
            onChange={e => setForm({ ...form, asistenId: e.target.value })}
            disabled={saving}
            className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white disabled:opacity-60"
          >
            <option value="">— Tanpa asisten —</option>
            {trainers.filter(t => t.id !== form.trainerId).map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Tanggal Mulai</label>
          <input
            type="date"
            value={form.periodeMulai}
            onChange={e => setForm({ ...form, periodeMulai: e.target.value })}
            disabled={saving}
            className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
          />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.ongoing}
              disabled={saving}
              onChange={e => setForm({ ...form, ongoing: e.target.checked, periodeSelesai: e.target.checked ? '' : form.periodeSelesai })}
              className="rounded"
            />
            <span className="font-semibold text-slate-700">Berlaku terus (tanpa tanggal selesai)</span>
          </label>
        </div>
        {!form.ongoing && (
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Tanggal Selesai</label>
            <input
              type="date"
              value={form.periodeSelesai}
              onChange={e => setForm({ ...form, periodeSelesai: e.target.value })}
              disabled={saving}
              className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
            />
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button onClick={save} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
          <button onClick={() => setModalOpen(false)} disabled={saving} className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition">Batal</button>
        </div>
      </Modal>

      <AlertDialog open={alertOpen} onOk={() => setAlertOpen(false)} title="Peringatan" body={alertMsg} />
    </div>
  )
}
