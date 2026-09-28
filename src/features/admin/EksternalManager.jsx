import { useState, useEffect, useMemo, useCallback } from 'react'
import { readCached, writeRemote, deleteRemote, getRoleContext, subscribeStore } from '../../lib/store.js'
import { newEksternal } from '../../lib/constants.js'
import AlertDialog from '../../components/AlertDialog.jsx'
import Modal from '../../components/Modal.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'

// BUG5 (F-CS5/D-CS5) — admin manager for external assistants (no login
// accounts). Server CRUD already exists (/api/eksternal.php +
// validateEksternal + store wiring); this is the missing write UI —
// trainers keep reference-only access (server 403s their writes).
// Table + Modal idiom mirrors PenugasanManager.jsx (classNames verbatim);
// Indonesian copy pinned for getByRole selection.
export default function EksternalManager() {
  const ctx = getRoleContext()
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick(t => t + 1), [])
  useEffect(() => subscribeStore(bump), [bump])

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ nama: '', sekolahId: '', kontak: '' })
  const [saving, setSaving] = useState(false)
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertMsg, setAlertMsg] = useState('')
  const [confirmId, setConfirmId] = useState(null)

  const sekolah = useMemo(() => readCached('sekolah'), [tick])
  const eksternal = useMemo(() => readCached('eksternal'), [tick])
  const sekolahById = useMemo(() => new Map(sekolah.map(s => [s.id, s])), [sekolah])

  function showError(message) {
    setAlertMsg(message)
    setAlertOpen(true)
  }

  function openAdd() {
    setForm({ nama: '', sekolahId: '', kontak: '' })
    setModalOpen(true)
  }

  async function save() {
    if (saving) return
    if (!form.nama.trim()) {
      showError('Nama asisten eksternal tidak boleh kosong.')
      return
    }
    const sch = sekolahById.get(form.sekolahId)
    if (!sch) {
      showError('Sekolah wajib dipilih.')
      return
    }
    setSaving(true)
    try {
      // cabangId follows the picked school (nested-branch parity with
      // PenugasanManager); prepareWritePayload strips it for admin_cabang
      // (server forces session branch), superadmin sends it explicitly.
      const result = await writeRemote('eksternal', newEksternal({
        sekolahId: sch.id,
        nama: form.nama.trim(),
        kontak: form.kontak.trim(),
        cabangId: sch.cabangId || null,
      }))
      if (result.status === 'forbidden') {
        showError(result.message || 'Kamu tidak punya izin untuk menambah asisten eksternal.')
        return
      }
      if (result.status === 'conflict') {
        showError('Data berubah di server. Muat ulang halaman sebelum menyimpan lagi.')
        return
      }
      setModalOpen(false)
      bump()
    } catch (error) {
      showError(error?.message || 'Gagal menyimpan asisten eksternal. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id) {
    const result = await deleteRemote('eksternal', id)
    if (result.status === 'forbidden') {
      showError(result.message || 'Kamu tidak punya izin untuk menghapus asisten eksternal.')
      return
    }
    setConfirmId(null)
    bump()
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
          <h2 className="text-xl font-bold text-slate-800">Asisten Eksternal</h2>
          <p className="text-xs text-slate-500">Kelola asisten tanpa akun login per sekolah.</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm px-4 py-2.5 rounded-xl transition shadow-sm active:scale-95"
        >
          Tambah Asisten Eksternal
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="py-4 px-6">Nama</th>
                <th className="py-4 px-6">Sekolah</th>
                <th className="py-4 px-6">Kontak</th>
                <th className="py-4 px-6 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {eksternal.map(e => (
                <tr key={e.id} className="hover:bg-slate-50/50 transition align-top">
                  <td className="py-4 px-6 font-bold text-slate-800">{e.nama}</td>
                  <td className="py-4 px-6 font-semibold text-slate-600">{sekolahById.get(e.sekolahId)?.nama || 'Sekolah tidak ditemukan'}</td>
                  <td className="py-4 px-6 font-semibold text-slate-600">{e.kontak || '—'}</td>
                  <td className="py-4 px-6 text-right">
                    <button
                      type="button"
                      onClick={() => setConfirmId(e.id)}
                      className="text-xs font-bold px-3 py-1.5 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 transition"
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
              {eksternal.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400">
                    Belum ada asisten eksternal.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => !saving && setModalOpen(false)} title="Tambah Asisten Eksternal">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Nama Asisten Eksternal</label>
            <input
              value={form.nama}
              onChange={e => setForm({ ...form, nama: e.target.value })}
              disabled={saving}
              placeholder="cth: Budi Santoso"
              className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
            />
          </div>
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
            <label className="text-xs font-bold text-slate-400 uppercase">Kontak <span className="normal-case font-normal text-slate-400">(opsional)</span></label>
            <input
              value={form.kontak}
              onChange={e => setForm({ ...form, kontak: e.target.value })}
              disabled={saving}
              placeholder="cth: 0812 3456 7890"
              className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={save} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
            <button onClick={() => !saving && setModalOpen(false)} disabled={saving} className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition">Batal</button>
          </div>
        </div>
      </Modal>

      <AlertDialog open={alertOpen} onOk={() => setAlertOpen(false)} title="Peringatan" body={alertMsg} />
      <ConfirmDialog
        open={confirmId !== null}
        onCancel={() => setConfirmId(null)}
        onConfirm={() => remove(confirmId)}
        title="Hapus Asisten Eksternal"
        body="Asisten eksternal ini akan dihapus. Riwayat absensi yang sudah tercatat tidak ikut terhapus."
        confirmLabel="Hapus"
        danger
      />
    </div>
  )
}
