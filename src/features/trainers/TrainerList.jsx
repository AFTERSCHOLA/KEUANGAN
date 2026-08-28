import { useState } from 'react'
import { formatRupiah, waNormalize } from '../../lib/format.js'
import { newTrainer, defaultCabang } from '../../lib/constants.js'
import Modal from '../../components/Modal.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import { readCached, write, upsert, getRoleContext } from '../../lib/store.js'

export default function TrainerList() {
  const [trainers, setTrainers] = useState(() => readCached('trainer'))
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(newTrainer())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMsg, setConfirmMsg] = useState('')
  const [pendingRemoveId, setPendingRemoveId] = useState(null)

  function refresh() {
    setTrainers(readCached('trainer'))
  }

  function openAdd() {
  const ctx = getRoleContext()
  const branches = readCached('cabang')
  const branch = ctx.role === 'admin_cabang'
    ? branches.find(c => c.id === ctx.cabangId) || defaultCabang()
    : branches[0] || defaultCabang()
  setForm(newTrainer(branch.id, branch.kode))
  setModalOpen(true)
}

  function openEdit(t) {
    setForm({ ...t })
    setModalOpen(true)
  }

  function save() {
    const prev = trainers.find(t => t.id === form.id)
    const oldSekolahIds = prev ? prev.sekolahIds : []
    upsert('trainer', form)
    const sekolahList = readCached('sekolah')
    oldSekolahIds.forEach(sId => {
      if (!form.sekolahIds.includes(sId)) {
        const s = sekolahList.find(sch => sch.id === sId)
        if (s) {
          s.trainerIds = (s.trainerIds || []).filter(tId => tId !== form.id)
          upsert('sekolah', s)
        }
      }
    })
    form.sekolahIds.forEach(sId => {
      if (!oldSekolahIds.includes(sId)) {
        const s = sekolahList.find(sch => sch.id === sId)
        if (s) {
          if (!(s.trainerIds || []).includes(form.id)) {
            s.trainerIds = [...(s.trainerIds || []), form.id]
            upsert('sekolah', s)
          }
        }
      }
    })
    setModalOpen(false)
    refresh()
  }

  function remove(id) {
    setConfirmMsg('Hapus trainer ini? Data absensi dan pembayaran tetap tersimpan.')
    setPendingRemoveId(id)
    setConfirmOpen(true)
  }

  function doRemove() {
    if (!pendingRemoveId) return
    const updated = trainers.filter(t => t.id !== pendingRemoveId)
    write('trainer', updated)
    setPendingRemoveId(null)
    setConfirmOpen(false)
    refresh()
  }

  if (trainers.length === 0 && !modalOpen) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Manajemen Trainer</h2>
            <p className="text-xs text-slate-500">Kelola info trainer, penugasan bimbingan kelas, serta honor sesi mengajar.</p>
          </div>
          <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold px-5 py-2.5 rounded-xl transition shadow-sm active:scale-95">Tambah Trainer Baru</button>
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-sm border text-center">
          <p className="text-slate-400 text-sm">Belum ada data trainer. Klik "Tambah Trainer Baru" untuk memulai.</p>
        </div>
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Tambah Trainer">
          <TrainerForm form={form} setForm={setForm} save={save} onClose={() => setModalOpen(false)} />
        </Modal>
        <ConfirmDialog open={confirmOpen} onCancel={() => { setConfirmOpen(false); setPendingRemoveId(null) }} onConfirm={doRemove} title="Konfirmasi" body={confirmMsg} danger={true} confirmLabel="Hapus" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Manajemen Trainer</h2>
          <p className="text-xs text-slate-500">Kelola info trainer, penugasan bimbingan kelas, serta honor sesi mengajar.</p>
        </div>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold px-5 py-2.5 rounded-xl transition shadow-sm active:scale-95">Tambah Trainer Baru</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {trainers.map(t => (
          <div key={t.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                    {t.nama?.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">{t.nama}</h3>
                    <p className="text-xs text-slate-400">Trainer Afterschola</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(t)} className="text-slate-400 hover:text-blue-600 p-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536M6.5 21.036H3v-3.572" strokeWidth="2"/></svg>
                  </button>
                  <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-rose-600 p-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21" strokeWidth="2"/></svg>
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 pt-3 border-t text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">WhatsApp</span>
                  <a href={`https://wa.me/${t.wa}`} target="_blank" className="font-bold text-blue-600 hover:underline">{t.wa}</a>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-dashed">
                  <span className="text-slate-400">Jadwal Mengajar</span>
                  <span className="font-semibold text-slate-700">{t.jadwal}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-700 pt-1 border-t">
                  <span>Honor per Kedatangan</span>
                  <span className="text-blue-700 font-extrabold">{formatRupiah(t.honor)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.id && trainers.find(t => t.id === form.id) ? 'Edit Trainer' : 'Tambah Trainer'}>
        <TrainerForm form={form} setForm={setForm} save={save} onClose={() => setModalOpen(false)} />
      </Modal>
      <ConfirmDialog open={confirmOpen} onCancel={() => { setConfirmOpen(false); setPendingRemoveId(null) }} onConfirm={doRemove} title="Konfirmasi" body={confirmMsg} danger={true} confirmLabel="Hapus" />
    </div>
  )
}

function TrainerForm({ form, setForm, save, onClose }) {
  const sekolah = readCached('sekolah')
  return (
    <>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">Nama Trainer</label>
        <input value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">WhatsApp</label>
        <input value={form.wa} onChange={e => setForm({ ...form, wa: e.target.value })} onBlur={e => setForm({ ...form, wa: waNormalize(e.target.value) })} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">Jadwal</label>
        <input value={form.jadwal} onChange={e => setForm({ ...form, jadwal: e.target.value })} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">Honor per Kedatangan</label>
        <input type="number" min="0" value={form.honor} onChange={e => setForm({ ...form, honor: Number(e.target.value) })} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">Sekolah Penugasan</label>
        <div className="space-y-1 mt-1">
          {sekolah.map(s => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.sekolahIds.includes(s.id)} onChange={e => {
                const ids = e.target.checked ? [...form.sekolahIds, s.id] : form.sekolahIds.filter(id => id !== s.id)
                setForm({ ...form, sekolahIds: ids })
              }} className="rounded" />
              {s.nama}
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={save} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm">Simpan</button>
        <button onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition">Batal</button>
      </div>
    </>
  )
}