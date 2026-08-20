import { useState } from 'react'
import { read, write, upsert, getRoleContext } from '../../lib/store.js'
import { newCabang, defaultCabang } from '../../lib/constants.js'
import AlertDialog from '../../components/AlertDialog.jsx'
import Modal from '../../components/Modal.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'

// M7.1.3 — Branch CRUD (superadmin only).
//
// Branch management is restricted to the explicit superadmin role.

function seedCabangIfEmpty() {
  let list = read('cabang')
  if (list.length === 0) {
    list = [defaultCabang()]
    write('cabang', list)
  }
  return list
}

export default function BranchManager() {
  const ctx = getRoleContext()
  const [cabang, setCabang] = useState(() => seedCabangIfEmpty())
  const [sekolah, setSekolah] = useState(() => read('sekolah'))
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(newCabang())
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertMsg, setAlertMsg] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [assignPickerFor, setAssignPickerFor] = useState(null)

  function refresh() {
    setCabang(read('cabang'))
    setSekolah(read('sekolah'))
  }

  function openAdd() {
    setForm(newCabang())
    setModalOpen(true)
  }

  function openEdit(c) {
    setForm({ ...c })
    setModalOpen(true)
  }

  function save() {
    if (ctx.role !== 'superadmin') return
    if (!form.nama.trim()) {
      setAlertMsg('Nama cabang tidak boleh kosong.')
      setAlertOpen(true)
      return
    }
    if (!form.kode.trim()) {
      setAlertMsg('Kode cabang tidak boleh kosong.')
      setAlertOpen(true)
      return
    }
    const kode = form.kode.trim().toUpperCase()
    const dupe = cabang.find(c => c.kode === kode && c.id !== form.id)
    if (dupe) {
      setAlertMsg(`Kode "${kode}" sudah dipakai cabang "${dupe.nama}". Pilih kode lain.`)
      setAlertOpen(true)
      return
    }
    upsert('cabang', { ...form, kode })
    setModalOpen(false)
    refresh()
  }

  function requestDelete(id) {
    if (ctx.role !== 'superadmin') return
    const c = cabang.find(x => x.id === id)
    if (c && c.id === defaultCabang().id) {
      setAlertMsg('Cabang default (seed) tidak bisa dihapus — cabang ini dipakai sebagai fallback sistem.')
      setAlertOpen(true)
      return
    }
    const assignedCount = sekolah.filter(s => s.cabangId === id).length
    if (assignedCount > 0) {
      setAlertMsg(`Cabang ini masih memiliki ${assignedCount} sekolah. Pindahkan sekolah ke cabang lain dulu sebelum menghapus.`)
      setAlertOpen(true)
      return
    }
    setPendingDeleteId(id)
    setConfirmOpen(true)
  }

  function doDelete() {
    const updated = cabang.filter(c => c.id !== pendingDeleteId)
    write('cabang', updated)
    setConfirmOpen(false)
    setPendingDeleteId(null)
    refresh()
  }

  function assignSchool(schoolId, branchId) {
    if (ctx.role !== 'superadmin') return
    const sch = sekolah.find(s => s.id === schoolId)
    if (!sch) return
    upsert('sekolah', { ...sch, cabangId: branchId })
    setAssignPickerFor(null)
    refresh()
  }

  if (ctx.role !== 'superadmin') {
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
          <h2 className="text-xl font-bold text-slate-800">Manajemen Cabang</h2>
          <p className="text-xs text-slate-500">Kelola cabang dan sekolah yang tergabung di dalamnya.</p>
        </div>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold px-5 py-2.5 rounded-xl transition shadow-sm active:scale-95">Tambah Cabang</button>
      </div>

      {cabang.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 shadow-sm border text-center">
          <p className="text-slate-400 text-sm">Belum ada data cabang. Klik "Tambah Cabang" untuk memulai.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {cabang.map(c => {
            const assigned = sekolah.filter(s => s.cabangId === c.id)
            return (
              <div key={c.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col hover:shadow-md transition">
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-slate-800 line-clamp-1">{c.nama}</h3>
                        <span className="text-xs text-slate-400 bg-slate-100 py-0.5 px-2 rounded-md inline-block mt-1 font-bold uppercase">{c.kode}</span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openEdit(c)} className="bg-slate-50 hover:bg-slate-100 p-1.5 rounded-lg" title="Edit">
                          <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => requestDelete(c.id)} className="bg-slate-50 hover:bg-slate-100 p-1.5 rounded-lg" title="Hapus">
                          <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2"/></svg>
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Sekolah di Cabang Ini ({assigned.length})</p>
                      {assigned.length === 0 ? (
                        <p className="text-xs text-slate-400 mt-2">Belum ada sekolah.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {assigned.map(s => (
                            <span key={s.id} className="text-xs text-slate-600 bg-slate-100 py-1 px-2.5 rounded-md">{s.nama}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => setAssignPickerFor(c.id)}
                      className="w-full bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-slate-600 text-xs font-bold py-2 rounded-xl transition"
                    >
                      + Assign Sekolah
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.id && cabang.find(c => c.id === form.id) ? 'Edit Cabang' : 'Tambah Cabang'}>
        <BranchForm form={form} setForm={setForm} save={save} onClose={() => setModalOpen(false)} />
      </Modal>

      <AlertDialog open={alertOpen} onOk={() => setAlertOpen(false)} title="Peringatan" body={alertMsg} />

      <ConfirmDialog
        open={confirmOpen}
        title="Hapus Cabang"
        body="Cabang ini tidak memiliki sekolah dan akan dihapus permanen. Lanjutkan?"
        confirmLabel="Hapus"
        onCancel={() => { setConfirmOpen(false); setPendingDeleteId(null) }}
        onConfirm={doDelete}
      />

      <AssignSchoolPicker
        open={!!assignPickerFor}
        branchId={assignPickerFor}
        sekolah={sekolah}
        onClose={() => setAssignPickerFor(null)}
        onPick={(schoolId) => assignSchool(schoolId, assignPickerFor)}
      />
    </div>
  )
}

function BranchForm({ form, setForm, save, onClose }) {
  return (
    <>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">Nama Cabang</label>
        <input value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">Kode Cabang</label>
        <input
          value={form.kode}
          onChange={e => setForm({ ...form, kode: e.target.value.toUpperCase() })}
          className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 uppercase"
          placeholder="mis. BDG"
          maxLength={6}
        />
        <p className="text-[11px] text-slate-400 mt-1">Kode singkat, dipakai sebagai prefix ID (mis. skl-BDG-...).</p>
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={save} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm">Simpan</button>
        <button onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition">Batal</button>
      </div>
    </>
  )
}

function AssignSchoolPicker({ open, branchId, sekolah, onClose, onPick }) {
  const targets = sekolah.filter(s => s.cabangId !== branchId)
  return (
    <Modal open={open} onClose={onClose} title="Assign Sekolah ke Cabang">
      {targets.length === 0 ? (
        <p className="text-sm text-slate-500">Semua sekolah sudah berada di cabang ini.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">Pilih sekolah untuk dipindahkan ke cabang ini:</p>
          {targets.map(s => (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              className="w-full text-left bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-xl px-4 py-3 transition"
            >
              <span className="text-sm font-bold text-slate-800">{s.nama}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
