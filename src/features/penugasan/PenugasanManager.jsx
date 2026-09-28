import { useMemo, useState, useEffect, useCallback } from 'react'
import { apiRequest } from '../../lib/api.js'
import { readCached, getRoleContext, writeRemote, subscribeStore } from '../../lib/store.js'
import { localDateString } from '../../lib/constants.js'
import { newPenugasanRow, validateRowDates, PENUGASAN_HARI, findOverlappingPair, PENUGASAN_OVERLAP_ERROR } from '../../lib/penugasan.js'
import Modal from '../../components/Modal.jsx'
import AlertDialog from '../../components/AlertDialog.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'

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
  const [coverModalOpen, setCoverModalOpen] = useState(false)
  const [coverOrigin, setCoverOrigin] = useState(null) // assignment row being covered
  const [coverForm, setCoverForm] = useState({ substituteId: '', hari: '', jamMulai: '', jamSelesai: '', tanggal: localDateString() })
  const [coverConfirm, setCoverConfirm] = useState(false)
  // DC.C.2 (F-DC3; D-DC3) — asisten2Id feeds the additive asistenIds key
  // (2nd assistant, max 2 server-gated); legacy asistenId stays position 0.
  const [form, setForm] = useState({ sekolahId: '', trainerId: '', asistenId: '', asisten2Id: '', hari: '', jamMulai: '', jamSelesai: '', periodeMulai: localDateString(), ongoing: true, periodeSelesai: '', aktif: true })
  // AP.B.1 (D-AP3) — edit targets one row inside its host record; cross-host
  // moves are out of scope (Sekolah/Instruktur selects lock in edit mode).
  const [editing, setEditing] = useState(null) // { hostId, assignmentId } | null
  const [confirm, setConfirm] = useState(null) // { action: 'activate'|'delete', row } | null
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

  // CS.A.1 (F-CS1; D-CS1/D-PS6) — human-readable scope for the Slot
  // column: `Semua slot` when unscoped, else `Hari · HH:MM–HH:MM`
  // (hari-only rows render the day name alone).
  function slotLabel(a) {
    const hari = a && a.hari ? String(a.hari) : ''
    const mulai = a && a.jamMulai ? String(a.jamMulai) : ''
    const selesai = a && a.jamSelesai ? String(a.jamSelesai) : ''
    if (!hari) return 'Semua slot'
    if (!mulai || !selesai) return hari
    return `${hari} · ${mulai}–${selesai}`
  }

  function showError(message) {
    setAlertMsg(message)
    setAlertOpen(true)
  }

  // DC.C.2 — union display: legacy asistenId (position 0) + asistenIds.
  function asistenNames(r) {
    const ids = [r.asistenId, ...(Array.isArray(r.asistenIds) ? r.asistenIds : [])].filter(Boolean)
    if (ids.length === 0) return '—'
    return ids.map(id => trainerById.get(id)?.nama || crossScopeNames[id] || 'Memuat...').join(', ')
  }

  function openAdd() {
    setForm({ sekolahId: '', trainerId: '', asistenId: '', asisten2Id: '', hari: '', jamMulai: '', jamSelesai: '', periodeMulai: localDateString(), ongoing: true, periodeSelesai: '', aktif: true })
    setEditing(null)
    setModalOpen(true)
  }

  // AP.B.1 — Edit reuses the Tambah modal pre-filled. Sekolah/Instruktur
  // stay locked: moving a row across host records is a delete+create, not
  // an edit (entities.php:172-175 trainerId-host invariant).
  function openEdit(row) {
    setForm({
      sekolahId: row.sekolahId || '',
      trainerId: row.trainerId || '',
      asistenId: row.asistenId || '',
      asisten2Id: (Array.isArray(row.asistenIds) ? row.asistenIds[0] : null) || '',
      hari: row.hari || '',
      jamMulai: row.jamMulai || '',
      jamSelesai: row.jamSelesai || '',
      periodeMulai: row.periodeMulai || localDateString(),
      ongoing: !(row.periodeSelesai != null && String(row.periodeSelesai).trim() !== ''),
      periodeSelesai: row.periodeSelesai || '',
      aktif: row.aktif,
    })
    setEditing({ hostId: row.hostId, assignmentId: row.id })
    setModalOpen(true)
  }

  async function save() {
    if (saving) return
    const periodeSelesai = form.ongoing ? null : (form.periodeSelesai || null)
    // CS.A.1 — slot triple validates against the picked school's
    // jadwalList vocabulary (entities.php mirrors server-side); empty Hari
    // reads as unscoped `Semua slot`.
    const sch = sekolahById.get(form.sekolahId)
    const err = validateRowDates({
      sekolahId: form.sekolahId,
      trainerId: form.trainerId,
      periodeMulai: form.periodeMulai,
      periodeSelesai,
      hari: form.hari || null,
      jamMulai: form.jamMulai || null,
      jamSelesai: form.jamSelesai || null,
      sekolahJadwalList: sch?.jadwalList,
    })
    if (err) {
      showError(err)
      return
    }
    if (form.asistenId && form.asistenId === form.trainerId) {
      showError('Asisten tidak boleh sama dengan instruktur.')
      return
    }
    // DC.C.2 — 2nd assistant guards mirror the first (pinned copy idiom).
    if (form.asisten2Id && form.asisten2Id === form.trainerId) {
      showError('Asisten tidak boleh sama dengan instruktur.')
      return
    }
    if (form.asisten2Id && form.asisten2Id === form.asistenId) {
      showError('Asisten 1 dan Asisten 2 tidak boleh sama.')
      return
    }
    const host = trainerById.get(form.trainerId)
    if (!host) {
      showError('Instruktur tidak ditemukan. Muat ulang halaman dan coba lagi.')
      return
    }
    setSaving(true)
    try {
      const existing = Array.isArray(host.penugasanPengajar) ? host.penugasanPengajar : []
      let next
      if (editing && editing.hostId === host.id) {
        // AP.B.1 — map-replace by row id; id preserved so history joins hold.
        // CS.A.1 — slot triple travels with the row (D-PS2/D-CS1).
        next = existing.map(a => (a && a.id === editing.assignmentId
          ? {
              ...a,
              asistenId: form.asistenId || null,
              // DC.C.2 — writes prefer the new key (D-CS4 additive rule);
              // clearing Asisten 2 writes null (legacy position 0 kept).
              asistenIds: form.asisten2Id ? [form.asisten2Id] : null,
              cabangId: sch?.cabangId || host?.cabangId || a.cabangId || null,
              hari: form.hari || null,
              jamMulai: form.jamMulai || null,
              jamSelesai: form.jamSelesai || null,
              periodeMulai: form.periodeMulai,
              periodeSelesai,
              aktif: form.aktif,
            }
          : a))
      } else {
        const row = newPenugasanRow({
          sekolahId: form.sekolahId,
          trainerId: form.trainerId,
          asistenId: form.asistenId || null,
          asistenIds: form.asisten2Id ? [form.asisten2Id] : null,
          // Nested cabangId: send the school branch so same-branch rows validate
          // (entities.php:176-194); cross-branch rows correctly 422 instead of
          // silently landing (D-PG plan §4).
          cabangId: sch?.cabangId || host?.cabangId || null,
          hari: form.hari || null,
          jamMulai: form.jamMulai || null,
          jamSelesai: form.jamSelesai || null,
          periodeMulai: form.periodeMulai,
          periodeSelesai,
          aktif: form.aktif,
        })
        next = [...existing, row]
      }
      // BUG7 (F-PG5; D-PG9) — same-host double-booking pre-check on the
      // full replace payload (server re-checks authoritatively in
      // trainer.php; this surfaces the pinned copy before the write).
      if (findOverlappingPair(next)) {
        showError(PENUGASAN_OVERLAP_ERROR)
        return
      }
      const result = await writeRemote('trainer', { ...host, penugasanPengajar: next })
      if (result.status === 'forbidden') {
        showError(result.message || 'Kamu tidak punya izin untuk menyimpan penugasan ini.')
        return
      }
      if (result.status === 'conflict') {
        showError('Data trainer ini sudah berubah di server. Muat ulang halaman sebelum menyimpan lagi.')
        return
      }
      setModalOpen(false)
      setEditing(null)
      bump()
    } catch (error) {
      showError(error?.message || 'Gagal menyimpan penugasan. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  // AP.B.1 (D-AP3) — shared map-replace writer for status flips and
  // row removal. Full-array replace through the existing trainer.php
  // update path (same as save/deactivate); version/409 copy preserved.
  async function replaceRows(hostId, mapFn) {
    if (saving) return false
    const host = trainerById.get(hostId)
    if (!host) {
      showError('Instruktur tidak ditemukan. Muat ulang halaman dan coba lagi.')
      return false
    }
    setSaving(true)
    try {
      const existing = Array.isArray(host.penugasanPengajar) ? host.penugasanPengajar : []
      const result = await writeRemote('trainer', { ...host, penugasanPengajar: existing.map(mapFn).filter(Boolean) })
      if (result.status === 'forbidden') {
        showError(result.message || 'Kamu tidak punya izin untuk mengubah penugasan ini.')
        return false
      }
      if (result.status === 'conflict') {
        showError('Data trainer ini sudah berubah di server. Muat ulang halaman sebelum menyimpan lagi.')
        return false
      }
      bump()
      return true
    } catch (error) {
      showError(error?.message || 'Gagal mengubah penugasan. Coba lagi.')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function activate(hostId, assignmentId) {
    await replaceRows(hostId, a => (a && a.id === assignmentId ? { ...a, aktif: true } : a))
  }

  // CS.B.1 (F-CS2; D-CS2) — cover creation. A cover is an explicit row on
  // the SUBSTITUTE's payload with coverOf = origin id + same sekolahId /
  // slot scope; the school bills through the cover's legacy session row
  // while the substitute's absensiPengajar row passes the gate through
  // the link (Q1a). Slot defaults to the origin slot, validated against
  // the school vocabulary exactly like the main flow.
  function openCover(row) {
    setCoverOrigin(row)
    setCoverForm({
      substituteId: '',
      hari: row.hari || '',
      jamMulai: row.jamMulai || '',
      jamSelesai: row.jamSelesai || '',
      tanggal: localDateString(),
    })
    setCoverConfirm(false)
    setCoverModalOpen(true)
  }

  function coverFormError() {
    if (!coverOrigin) return 'Penugasan asal tidak ditemukan.'
    if (!coverForm.substituteId) return 'Pengganti wajib dipilih.'
    if (!coverForm.tanggal) return 'Tanggal wajib diisi.'
    const sch = sekolahById.get(coverOrigin.sekolahId)
    return validateRowDates({
      sekolahId: coverOrigin.sekolahId,
      trainerId: coverForm.substituteId,
      periodeMulai: coverForm.tanggal,
      periodeSelesai: null,
      hari: coverForm.hari || null,
      jamMulai: coverForm.jamMulai || null,
      jamSelesai: coverForm.jamSelesai || null,
      sekolahJadwalList: sch?.jadwalList,
    })
  }

  function requestCoverConfirm() {
    const err = coverFormError()
    if (err) {
      showError(err)
      return
    }
    setCoverConfirm(true)
  }

  async function saveCover() {
    if (saving || !coverOrigin) return
    const err = coverFormError()
    if (err) {
      showError(err)
      return
    }
    const sch = sekolahById.get(coverOrigin.sekolahId)
    const host = trainerById.get(coverForm.substituteId)
    if (!host) {
      showError('Pengganti tidak ditemukan. Muat ulang halaman dan coba lagi.')
      return
    }
    setSaving(true)
    try {
      const existing = Array.isArray(host.penugasanPengajar) ? host.penugasanPengajar : []
      const row = {
        ...newPenugasanRow({
          sekolahId: coverOrigin.sekolahId,
          trainerId: coverForm.substituteId,
          asistenId: null,
          cabangId: sch?.cabangId || host?.cabangId || null,
          hari: coverForm.hari || null,
          jamMulai: coverForm.jamMulai || null,
          jamSelesai: coverForm.jamSelesai || null,
          periodeMulai: coverForm.tanggal,
          periodeSelesai: null,
          aktif: true,
        }),
        coverOf: coverOrigin.id,
      }
      const result = await writeRemote('trainer', { ...host, penugasanPengajar: [...existing, row] })
      if (result.status === 'forbidden') {
        showError(result.message || 'Kamu tidak punya izin untuk menyimpan penugasan ini.')
        return
      }
      if (result.status === 'conflict') {
        showError('Data trainer ini sudah berubah di server. Muat ulang halaman sebelum menyimpan lagi.')
        return
      }
      setCoverModalOpen(false)
      setCoverConfirm(false)
      setCoverOrigin(null)
      bump()
    } catch (error) {
      showError(error?.message || 'Gagal menyimpan penugasan pengganti. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  // AP.B.1 — Hapus removes the array entry only. absensi_pengajar rows
  // live in their own table, so history and honor math are untouched.
  async function removeRow(hostId, assignmentId) {
    await replaceRows(hostId, a => (a && a.id === assignmentId ? null : a))
  }

  async function deactivate(hostId, assignmentId) {
    await replaceRows(hostId, a => (a && a.id === assignmentId ? { ...a, aktif: false } : a))
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
                <th className="py-4 px-6">Slot</th>
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
                  <td className="py-4 px-6 font-semibold text-slate-600">{asistenNames(r)}</td>
                  <td className="py-4 px-6 font-semibold text-slate-600">{slotLabel(r)}</td>
                  <td className="py-4 px-6 font-semibold text-slate-600">{r.periodeMulai || '—'}</td>
                  <td className="py-4 px-6 font-semibold text-slate-600">{r.periodeSelesai || 'Berlaku terus'}</td>
                  <td className="py-4 px-6 text-center">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${r.aktif === true ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {r.aktif === true ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-center">
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <button
                        onClick={() => openEdit(r)}
                        disabled={saving}
                        className="bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-extrabold text-[11px] px-3.5 py-1.5 rounded-lg transition shadow-sm active:scale-95"
                      >
                        Edit
                      </button>
                      {r.aktif === true ? (
                        <>
                          <button
                            onClick={() => openCover(r)}
                            disabled={saving}
                            className="bg-blue-100 hover:bg-blue-200 disabled:opacity-60 text-blue-700 font-extrabold text-[11px] px-3.5 py-1.5 rounded-lg transition shadow-sm active:scale-95"
                          >
                            Buat Pengganti
                          </button>
                          <button
                            onClick={() => deactivate(r.hostId, r.id)}
                            disabled={saving}
                            className="bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-extrabold text-[11px] px-3.5 py-1.5 rounded-lg transition shadow-sm active:scale-95"
                          >
                            Nonaktifkan
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setConfirm({ action: 'activate', row: r })}
                            disabled={saving}
                            className="bg-emerald-100 hover:bg-emerald-200 disabled:opacity-60 text-emerald-700 font-extrabold text-[11px] px-3.5 py-1.5 rounded-lg transition shadow-sm active:scale-95"
                          >
                            Aktifkan
                          </button>
                          <button
                            onClick={() => setConfirm({ action: 'delete', row: r })}
                            disabled={saving}
                            className="bg-rose-100 hover:bg-rose-200 disabled:opacity-60 text-rose-700 font-extrabold text-[11px] px-3.5 py-1.5 rounded-lg transition shadow-sm active:scale-95"
                          >
                            Hapus
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Belum ada penugasan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => !saving && setModalOpen(false)} title={editing ? 'Edit Penugasan' : 'Tambah Penugasan'}>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Sekolah</label>
          <select
            value={form.sekolahId}
            onChange={e => setForm({ ...form, sekolahId: e.target.value })}
            disabled={saving || editing !== null}
            title={editing !== null ? 'Sekolah tidak dapat dipindah pada mode edit' : undefined}
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
            onChange={e => setForm({ ...form, trainerId: e.target.value, asistenId: '', asisten2Id: '' })}
            disabled={saving || editing !== null}
            title={editing !== null ? 'Instruktur tidak dapat dipindah pada mode edit' : undefined}
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
          <label className="text-xs font-bold text-slate-400 uppercase">Asisten 2 <span className="normal-case font-normal text-slate-400">(opsional)</span></label>
          <select
            value={form.asisten2Id}
            onChange={e => setForm({ ...form, asisten2Id: e.target.value })}
            disabled={saving}
            className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white disabled:opacity-60"
          >
            <option value="">— Tanpa asisten 2 —</option>
            {trainers.filter(t => t.id !== form.trainerId && t.id !== form.asistenId).map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Slot <span className="normal-case font-normal text-slate-400">(opsional — Semua slot bila kosong)</span></label>
          <div className="flex gap-2 mt-1">
            <select
              value={form.hari}
              onChange={e => setForm({ ...form, hari: e.target.value, jamMulai: e.target.value ? form.jamMulai : '', jamSelesai: e.target.value ? form.jamSelesai : '' })}
              disabled={saving}
              aria-label="Hari"
              className="flex-1 rounded-lg border p-2.5 text-sm bg-white disabled:opacity-60"
            >
              <option value="">Semua hari</option>
              {PENUGASAN_HARI.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <input
              type="time"
              value={form.jamMulai}
              onChange={e => setForm({ ...form, jamMulai: e.target.value })}
              disabled={saving || !form.hari}
              aria-label="Jam Mulai"
              title="Jam Mulai"
              className="flex-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
            />
            <input
              type="time"
              value={form.jamSelesai}
              onChange={e => setForm({ ...form, jamSelesai: e.target.value })}
              disabled={saving || !form.hari}
              aria-label="Jam Selesai"
              title="Jam Selesai"
              className="flex-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
            />
          </div>
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

      <Modal open={coverModalOpen} onClose={() => !saving && setCoverModalOpen(false)} title="Buat Penugasan Pengganti">
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Pengganti untuk</label>
          <p className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-slate-50 text-slate-700 font-semibold">
            {coverOrigin ? `${sekolahById.get(coverOrigin.sekolahId)?.nama || 'Sekolah tidak ditemukan'} · ${trainerById.get(coverOrigin.trainerId)?.nama || 'Trainer tidak ditemukan'} · ${slotLabel(coverOrigin)}` : '—'}
          </p>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Pengganti</label>
          <select
            value={coverForm.substituteId}
            onChange={e => setCoverForm({ ...coverForm, substituteId: e.target.value })}
            disabled={saving}
            className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white disabled:opacity-60"
          >
            <option value="">-- Pilih Pengganti --</option>
            {trainers.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Slot <span className="normal-case font-normal text-slate-400">(opsional — Semua slot bila kosong)</span></label>
          <div className="flex gap-2 mt-1">
            <select
              value={coverForm.hari}
              onChange={e => setCoverForm({ ...coverForm, hari: e.target.value, jamMulai: e.target.value ? coverForm.jamMulai : '', jamSelesai: e.target.value ? coverForm.jamSelesai : '' })}
              disabled={saving}
              aria-label="Hari"
              className="flex-1 rounded-lg border p-2.5 text-sm bg-white disabled:opacity-60"
            >
              <option value="">Semua hari</option>
              {PENUGASAN_HARI.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <input
              type="time"
              value={coverForm.jamMulai}
              onChange={e => setCoverForm({ ...coverForm, jamMulai: e.target.value })}
              disabled={saving || !coverForm.hari}
              aria-label="Jam Mulai"
              title="Jam Mulai"
              className="flex-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
            />
            <input
              type="time"
              value={coverForm.jamSelesai}
              onChange={e => setCoverForm({ ...coverForm, jamSelesai: e.target.value })}
              disabled={saving || !coverForm.hari}
              aria-label="Jam Selesai"
              title="Jam Selesai"
              className="flex-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Tanggal</label>
          <input
            type="date"
            value={coverForm.tanggal}
            onChange={e => setCoverForm({ ...coverForm, tanggal: e.target.value })}
            disabled={saving}
            className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={requestCoverConfirm} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm">
            {saving ? 'Menyimpan...' : 'Buat'}
          </button>
          <button onClick={() => setCoverModalOpen(false)} disabled={saving} className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition">Batal</button>
        </div>
      </Modal>
      <ConfirmDialog
        open={coverConfirm}
        onCancel={() => setCoverConfirm(false)}
        onConfirm={saveCover}
        title="Buat Penugasan Pengganti"
        body="Buat penugasan pengganti untuk sesi ini? Sekolah ditagih, pengajar pengganti dibayar (Q1a)."
        confirmLabel="Buat"
        danger={false}
      />

      <AlertDialog open={alertOpen} onOk={() => setAlertOpen(false)} title="Peringatan" body={alertMsg} />
      <ConfirmDialog
        open={confirm !== null}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const c = confirm
          setConfirm(null)
          if (!c) return
          if (c.action === 'activate') await activate(c.row.hostId, c.row.id)
          else await removeRow(c.row.hostId, c.row.id)
        }}
        title={confirm?.action === 'delete' ? 'Hapus Penugasan' : 'Aktifkan Penugasan'}
        body={confirm?.action === 'delete'
          ? 'Hapus penugasan ini? Riwayat absensi tidak ikut terhapus.'
          : 'Aktifkan kembali penugasan ini?'}
        confirmLabel={confirm?.action === 'delete' ? 'Hapus' : 'Aktifkan'}
        danger={confirm?.action === 'delete'}
      />
    </div>
  )
}
