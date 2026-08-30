import { useState } from 'react'
import { formatRupiah, waNormalize } from '../../lib/format.js'
import { newTrainer, defaultCabang } from '../../lib/constants.js'
import Modal from '../../components/Modal.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import AlertDialog from '../../components/AlertDialog.jsx'
import { readCached, getRoleContext, writeRemote, deleteRemote } from '../../lib/store.js'

export default function TrainerList() {
  const [trainers, setTrainers] = useState(() => readCached('trainer'))
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(newTrainer())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMsg, setConfirmMsg] = useState('')
  const [pendingRemoveId, setPendingRemoveId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertMsg, setAlertMsg] = useState('')

  // Privilege matrix (PRODUCTION_PLAN.md section 5): Trainer role is
  // "Read own record" only. Hiding these controls is a UX courtesy, not
  // the security boundary — authorize.php on the server is what actually
  // enforces this regardless of what the client renders.
  const ctx = getRoleContext()
  const canManageTrainers = ctx.role === 'admin_cabang' || ctx.role === 'superadmin'

  function refresh() {
    setTrainers(readCached('trainer'))
  }

  function showError(message) {
    setAlertMsg(message)
    setAlertOpen(true)
  }

  function openAdd() {
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

  async function save() {
  if (saving) return

  setSaving(true)

  try {
    const prev = trainers.find(t => t.id === form.id)
    const oldSekolahIds = prev ? prev.sekolahIds : []

    const result = await writeRemote('trainer', form)

    if (result.status === 'forbidden') {
      showError(result.message || 'Kamu tidak punya izin untuk menyimpan trainer ini.')
      return
    }

    if (result.status === 'conflict') {
      showError('Data trainer ini sudah berubah di server sejak terakhir dimuat. Muat ulang halaman sebelum menyimpan lagi.')
      return
    }

    const sekolahList = readCached('sekolah')
    const schoolUpdates = []

    oldSekolahIds.forEach(sId => {
      if (!form.sekolahIds.includes(sId)) {
        const s = sekolahList.find(sch => sch.id === sId)

        if (s) {
          schoolUpdates.push({
            ...s,
            trainerIds: (s.trainerIds || []).filter(tId => tId !== form.id),
          })
        }
      }
    })

    form.sekolahIds.forEach(sId => {
      if (!oldSekolahIds.includes(sId)) {
        const s = sekolahList.find(sch => sch.id === sId)

        if (s && !(s.trainerIds || []).includes(form.id)) {
          schoolUpdates.push({
            ...s,
            trainerIds: [...(s.trainerIds || []), form.id],
          })
        }
      }
    })

    let schoolUpdateFailed = false

    for (const s of schoolUpdates) {
      const payload = { ...s }

      if (getRoleContext().role === 'admin_cabang') {
        delete payload.cabangId
      }

      const schoolResult = await writeRemote('sekolah', payload)

      if (
        schoolResult.status === 'forbidden' ||
        schoolResult.status === 'conflict'
      ) {
        schoolUpdateFailed = true
      }
    }

    setModalOpen(false)
    refresh()

    if (schoolUpdateFailed) {
      showError(
        'Trainer tersimpan, tapi penugasan ke salah satu sekolah gagal diperbarui. Muat ulang halaman dan periksa lagi.'
      )
    }
  } catch (error) {
    console.error('Gagal menyimpan trainer:', error)

    showError(
      error?.message ||
      'Terjadi kesalahan saat menyimpan trainer. Coba lagi.'
    )
  } finally {
    setSaving(false)
  }
}

  function remove(id) {
    setConfirmMsg('Hapus trainer ini? Data absensi dan pembayaran tetap tersimpan.')
    setPendingRemoveId(id)
    setConfirmOpen(true)
  }

  async function doRemove() {
  if (!pendingRemoveId || saving) return

  setSaving(true)

  try {
    const result = await deleteRemote('trainer', pendingRemoveId)

    if (result.status === 'forbidden') {
      showError(
        result.message ||
        'Kamu tidak punya izin untuk menghapus trainer ini.'
      )
      return
    }

    setConfirmOpen(false)
    setPendingRemoveId(null)
    refresh()
  } catch (error) {
    console.error('Gagal menghapus trainer:', error)

    showError(
      error?.message ||
      'Terjadi kesalahan saat menghapus trainer. Coba lagi.'
    )
  } finally {
    setSaving(false)
  }
}

  if (trainers.length === 0 && !modalOpen) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Manajemen Trainer</h2>
            <p className="text-xs text-slate-500">Kelola info trainer, penugasan bimbingan kelas, serta honor sesi mengajar.</p>
          </div>
          {canManageTrainers && (
            <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold px-5 py-2.5 rounded-xl transition shadow-sm active:scale-95">Tambah Trainer Baru</button>
          )}
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-sm border text-center">
          <p className="text-slate-400 text-sm">Belum ada data trainer.{canManageTrainers && ' Klik "Tambah Trainer Baru" untuk memulai.'}</p>
        </div>
        {canManageTrainers && (
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Tambah Trainer">
            <TrainerForm form={form} setForm={setForm} save={save} onClose={() => setModalOpen(false)} saving={saving} />
          </Modal>
        )}
        <ConfirmDialog open={confirmOpen} onCancel={() => { setConfirmOpen(false); setPendingRemoveId(null) }} onConfirm={doRemove} title="Konfirmasi" body={confirmMsg} danger={true} confirmLabel="Hapus" />
        <AlertDialog open={alertOpen} onOk={() => setAlertOpen(false)} title="Peringatan" body={alertMsg} />
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
        {canManageTrainers && (
          <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold px-5 py-2.5 rounded-xl transition shadow-sm active:scale-95">Tambah Trainer Baru</button>
        )}
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
                {canManageTrainers && (
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(t)} className="text-slate-400 hover:text-blue-600 p-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536M6.5 21.036H3v-3.572" strokeWidth="2"/></svg>
                    </button>
                    <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-rose-600 p-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21" strokeWidth="2"/></svg>
                    </button>
                  </div>
                )}
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

      {canManageTrainers && (
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.id && trainers.find(t => t.id === form.id) ? 'Edit Trainer' : 'Tambah Trainer'}>
          <TrainerForm form={form} setForm={setForm} save={save} onClose={() => setModalOpen(false)} saving={saving} />
        </Modal>
      )}
      <ConfirmDialog open={confirmOpen} onCancel={() => { setConfirmOpen(false); setPendingRemoveId(null) }} onConfirm={doRemove} title="Konfirmasi" body={confirmMsg} danger={true} confirmLabel="Hapus" />
      <AlertDialog open={alertOpen} onOk={() => setAlertOpen(false)} title="Peringatan" body={alertMsg} />
    </div>
  )
}

function TrainerForm({ form, setForm, save, onClose, saving }) {
  const sekolah = readCached('sekolah')
  return (
    <>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">Nama Trainer</label>
        <input value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} disabled={saving} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60" />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">WhatsApp</label>
        <input value={form.wa} onChange={e => setForm({ ...form, wa: e.target.value })} onBlur={e => setForm({ ...form, wa: waNormalize(e.target.value) })} disabled={saving} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60" />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">Jadwal</label>
        <input value={form.jadwal} onChange={e => setForm({ ...form, jadwal: e.target.value })} disabled={saving} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60" />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">Honor per Kedatangan</label>
        <input type="number" min="0" value={form.honor} onChange={e => setForm({ ...form, honor: Number(e.target.value) })} disabled={saving} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60" />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">Sekolah Penugasan</label>
        <div className="space-y-1 mt-1">
          {sekolah.map(s => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.sekolahIds.includes(s.id)} disabled={saving} onChange={e => {
                const ids = e.target.checked ? [...form.sekolahIds, s.id] : form.sekolahIds.filter(id => id !== s.id)
                setForm({ ...form, sekolahIds: ids })
              }} className="rounded" />
              {s.nama}
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={save} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm">
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
        <button onClick={onClose} disabled={saving} className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition">Batal</button>
      </div>
    </>
  )
}
