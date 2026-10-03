import { useState, useEffect, useMemo, useCallback } from 'react'
import { readCached, read, writeRemote, deleteRemote, getRoleContext, subscribeStore } from '../../lib/store.js'
import { academicYearLabel } from '../../lib/constants.js'
import { RAPORT_SEMESTER } from '../../lib/raport.js'
import Modal from '../../components/Modal.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import RaportForm from './RaportForm.jsx'
import RaportTemplate from './RaportTemplate.jsx'

// Slice 1 Raport (Task 6) — daftar raport semester per siswa.
// Tabel + filter + modal idiom meniru StudentList.jsx (header
// bg-slate-50, card rounded-2xl) dan EksternalManager.jsx
// (ConfirmDialog Hapus/Batal, toast lokal). Akses data hanya via
// readCached/writeRemote/deleteRemote 'raport' (store Task 4);
// scope per-role ditegakkan server + filter klien readCached.
function statusBadge(status) {
  if (status === 'Terverifikasi') return 'bg-emerald-100 text-emerald-700'
  if (status === 'Diajukan') return 'bg-blue-100 text-blue-700'
  return 'bg-slate-100 text-slate-500'
}

export default function RaportList() {
  const role = getRoleContext().role
  const isAdmin = role === 'superadmin' || role === 'admin_cabang'
  const isTrainer = role === 'trainer'

  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick(t => t + 1), [])
  useEffect(() => subscribeStore(bump), [bump])
  useEffect(() => {
    read('raport').then(bump).catch(() => {})
    read('siswa').then(bump).catch(() => {})
    read('sekolah').then(bump).catch(() => {})
  }, [bump])

  const [semesterFilter, setSemesterFilter] = useState('')
  const [sekolahFilter, setSekolahFilter] = useState('')
  const [cari, setCari] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  // Task 7 — navigasi cetak: id raport yang cetakannya dibuka
  // (pola printInvoice di SchoolList.jsx).
  const [printId, setPrintId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [acting, setActing] = useState(false)
  const [toast, setToast] = useState('')

  const raport = useMemo(() => readCached('raport'), [tick])
  const siswa = useMemo(() => readCached('siswa'), [tick])
  const sekolah = useMemo(() => readCached('sekolah'), [tick])
  const siswaById = useMemo(() => new Map(siswa.map(s => [s.id, s])), [siswa])
  const sekolahById = useMemo(() => new Map(sekolah.map(s => [s.id, s])), [sekolah])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // Sekolah record raport: baris siswa live dulu (pola store
  // sekolahIdForRaport), fallback ke snapshot yang dikunci.
  function sekolahIdOf(r) {
    const live = siswaById.get(r.siswaId)?.sekolahId
    if (typeof live === 'string' && live !== '') return live
    return r.sekolahId || ''
  }

  const visible = useMemo(() => raport
    .filter(r => !semesterFilter || r.semester === semesterFilter)
    .filter(r => !sekolahFilter || sekolahIdOf(r) === sekolahFilter)
    .filter(r => {
      const q = cari.trim().toLowerCase()
      if (!q) return true
      return (siswaById.get(r.siswaId)?.nama || '').toLowerCase().includes(q)
    })
    .sort((a, b) => (a.updatedAt || a.createdAt || '') < (b.updatedAt || b.createdAt || '') ? 1 : -1),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [raport, semesterFilter, sekolahFilter, cari, tick])

  function openAdd() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(r) {
    setEditing(r)
    setModalOpen(true)
  }

  async function refresh() {
    await read('raport').catch(() => {})
    bump()
  }

  // Transisi cepat: trainer Draft → Diajukan; admin Diajukan → Terverifikasi.
  async function setStatus(r, status) {
    if (acting) return
    setActing(true)
    try {
      const result = await writeRemote('raport', { ...r, status })
      if (result.status === 'forbidden') {
        showToast(result.message || 'Kamu tidak punya izin mengubah raport ini.')
        return
      }
      if (result.status === 'conflict') {
        showToast('Data raport ini sudah berubah di server. Memuat ulang...')
        await refresh()
        return
      }
      await refresh()
    } catch (error) {
      showToast(error?.message || 'Gagal mengubah status raport.')
    } finally {
      setActing(false)
    }
  }

  async function doRemove() {
    if (!confirmId || acting) return
    setActing(true)
    try {
      const result = await deleteRemote('raport', confirmId)
      if (result.status === 'forbidden') {
        setConfirmId(null)
        showToast(result.message || 'Kamu tidak punya izin menghapus raport ini.')
        return
      }
      setConfirmId(null)
      await refresh()
    } catch (error) {
      setConfirmId(null)
      showToast(error?.message || 'Gagal menghapus raport.')
    } finally {
      setActing(false)
    }
  }

  // Cetakan menggantikan daftar selama dibuka (pola SchoolList
  // printInvoice): Kembali menutup via onBack.
  const printRaport = printId ? raport.find(r => r.id === printId) || null : null
  if (printRaport) {
    return (
      <RaportTemplate
        raport={printRaport}
        siswa={siswaById.get(printRaport.siswaId)}
        sekolah={sekolahById.get(sekolahIdOf(printRaport))}
        onBack={() => setPrintId(null)}
      />
    )
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="Raport"
        subtitle="Nilai semester per siswa"
        actions={
          <button
            onClick={openAdd}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold px-5 py-2.5 rounded-xl transition shadow-sm active:scale-95"
          >
            Tambah Raport
          </button>
        }
      />

      <div className="bg-white p-4 rounded-2xl shadow-sm border flex items-end gap-3 flex-wrap">
        <div>
          <label htmlFor="raport-filter-semester" className="text-xs font-bold text-slate-400 uppercase">
            Filter semester
          </label>
          <select
            id="raport-filter-semester"
            value={semesterFilter}
            onChange={e => setSemesterFilter(e.target.value)}
            className="mt-1 rounded-lg border p-2 text-xs bg-white font-semibold"
          >
            <option value="">Semua Semester</option>
            {RAPORT_SEMESTER.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="raport-filter-sekolah" className="text-xs font-bold text-slate-400 uppercase">
            Filter sekolah
          </label>
          <select
            id="raport-filter-sekolah"
            value={sekolahFilter}
            onChange={e => setSekolahFilter(e.target.value)}
            className="mt-1 rounded-lg border p-2 text-xs bg-white font-semibold"
          >
            <option value="">Semua Sekolah</option>
            {sekolah.map(s => (
              <option key={s.id} value={s.id}>{s.nama}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label htmlFor="raport-cari" className="text-xs font-bold text-slate-400 uppercase">
            Cari
          </label>
          <input
            id="raport-cari"
            value={cari}
            onChange={e => setCari(e.target.value)}
            placeholder="Cari nama siswa..."
            className="w-full mt-1 rounded-lg border p-2 text-xs outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="py-4 px-6">Siswa</th>
                <th className="py-4 px-6">Sekolah</th>
                <th className="py-4 px-6">Semester</th>
                <th className="py-4 px-6 text-center">Total</th>
                <th className="py-4 px-6">Grade</th>
                <th className="py-4 px-6 text-center">Status</th>
                <th className="py-4 px-6 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {visible.map(r => {
                const sw = siswaById.get(r.siswaId)
                const schName = sekolahById.get(sekolahIdOf(r))?.nama || 'Sekolah tidak ditemukan'
                const canEdit = isAdmin || r.status !== 'Terverifikasi'
                const canDelete = isAdmin || r.status === 'Draft'
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="py-4 px-6 font-bold text-slate-800">{sw?.nama || 'Siswa tidak ditemukan'}</td>
                    <td className="py-4 px-6 font-semibold text-slate-600">{schName}</td>
                    <td className="py-4 px-6 font-semibold text-slate-600">
                      {r.semester} · {academicYearLabel(Number(r.tahunAjaran))}
                    </td>
                    <td className="py-4 px-6 text-center font-extrabold text-blue-700">{r.total}</td>
                    <td className="py-4 px-6 font-bold text-slate-600">{r.grade}</td>
                    <td className="py-4 px-6 text-center">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusBadge(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="flex justify-center gap-2 flex-wrap">
                        {canEdit && (
                          <button
                            onClick={() => openEdit(r)}
                            className="text-xs font-bold px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition"
                          >
                            Koreksi
                          </button>
                        )}
                        {isTrainer && r.status === 'Draft' && (
                          <button
                            onClick={() => setStatus(r, 'Diajukan')}
                            disabled={acting}
                            className="text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition disabled:opacity-60"
                          >
                            Ajukan
                          </button>
                        )}
                        {isAdmin && r.status === 'Diajukan' && (
                          <button
                            onClick={() => setStatus(r, 'Terverifikasi')}
                            disabled={acting}
                            className="text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-60"
                          >
                            Verifikasi
                          </button>
                        )}
                        <button
                          onClick={() => setPrintId(r.id)}
                          className="text-xs font-bold px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                        >
                          Cetak
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => setConfirmId(r.id)}
                            className="text-xs font-bold px-3 py-1.5 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 transition"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Belum ada raport.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Koreksi Raport' : 'Tambah Raport'}>
        <RaportForm
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          editing={editing}
          siswaList={siswa}
          onSaved={async () => {
            setModalOpen(false)
            setEditing(null)
            await refresh()
          }}
          showToast={showToast}
        />
      </Modal>

      <ConfirmDialog
        open={confirmId !== null}
        onCancel={() => setConfirmId(null)}
        onConfirm={doRemove}
        title="Hapus Raport"
        body="Hapus raport ini? Tindakan ini tidak bisa dibatalkan."
        danger={true}
        confirmLabel="Hapus"
      />

      {toast && (
        <div role="status" className="fixed top-4 right-4 z-[60] bg-rose-600 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
