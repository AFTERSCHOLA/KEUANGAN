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

  // USER_PROVISIONING.md D3/D4/D6 — single-form trainer onboarding.
  // createAccount: whether to also issue a login account (default true; off
  // for substitute trainers who won't log in).
  // username: the login name; required when createAccount is true.
  // pendingPassword: returned once from the server after a successful create,
  // shown in initialPasswordDialog so the admin can read it to the trainer.
  const [createAccount, setCreateAccount] = useState(true)
  const [username, setUsername] = useState('')
  const [initialPasswordDialog, setInitialPasswordDialog] = useState(null) // { username, password } | null
  const [passwordAcknowledged, setPasswordAcknowledged] = useState(false)

  // Privilege matrix (PRODUCTION_PLAN.md section 5): Trainer role is
  // "Read own record" only. Hiding these controls is a UX courtesy, not
  // the security boundary — authorize.php on the server is what actually
  // enforces this regardless of what the client renders.
  const ctx = getRoleContext()
  const canEditTrainers = ctx.role === 'admin_cabang' || ctx.role === 'superadmin'
  const canCreateOrDeleteTrainers = ctx.role === 'admin_cabang'

  function refresh() {
    setTrainers(readCached('trainer'))
  }

  function showError(message) {
    setAlertMsg(message)
    setAlertOpen(true)
  }

  function openAdd() {
  const branches = readCached('cabang')
  const branch = branches.find(c => c.id === ctx.cabangId) || defaultCabang()
  setForm(newTrainer(branch.id, branch.kode))
  setUsername('')
  setCreateAccount(true)
  setModalOpen(true)
}

  function openEdit(t) {
    setForm({ ...t })
    setModalOpen(true)
  }

  async function save() {
  if (saving) return
  if (ctx.role === 'superadmin' && !trainers.find(t => t.id === form.id)) {
    showError('Superadmin tidak dapat membuat trainer baru.')
    return
  }

  setSaving(true)

  try {
    const prev = trainers.find(t => t.id === form.id)
    const oldSekolahIds = prev ? prev.sekolahIds : []
    const isEdit = prev !== undefined
    const isCreatingAccount = !isEdit && createAccount

    // USER_PROVISIONING.md D3: when creating a trainer with login account,
    // route through /api/users.php which atomically creates both the trainer
    // record AND the user account. Edit and create-without-account paths
    // keep using /api/trainer.php.
    let result
    if (isCreatingAccount) {
      if (!username.trim()) {
        showError('Username wajib diisi untuk membuat akun login.')
        return
      }
      const trainerPayload = {
        nama: form.nama,
        wa: form.wa,
        jadwal: form.jadwal,
        honor: form.honor,
        sekolahIds: form.sekolahIds,
      }
      result = await writeRemote('users', {
        action: 'create',
        role: 'trainer',
        username: username.trim(),
        displayName: form.nama,
        cabangId: form.cabangId,
        trainer: trainerPayload,
      })

      if (result.status === 'forbidden') {
        showError(result.message || 'Kamu tidak punya izin untuk membuat akun trainer ini.')
        return
      }
      if (result.status === 'conflict') {
        showError('Data trainer bentrok dengan data yang ada di server.')
        return
      }

      // The /api/users.php response carries the canonical trainer record.
      // Open the initial-password dialog so the admin can read the
      // temporary password to the trainer (USER_PROVISIONING.md D4).
      const serverTrainer = result.body?.trainer
      const initialPassword = result.body?.initialPassword
      if (serverTrainer && initialPassword) {
        // Adopt the server's trainer.id so the local cache reflects truth.
        form.id = serverTrainer.id
        setInitialPasswordDialog({
          username: username.trim(),
          password: initialPassword,
          trainerName: form.nama,
        })
        setPasswordAcknowledged(false)
      }
    } else {
      result = await writeRemote('trainer', form)

      if (result.status === 'forbidden') {
        showError(result.message || 'Kamu tidak punya izin untuk menyimpan trainer ini.')
        return
      }

      if (result.status === 'conflict') {
        showError('Data trainer ini sudah berubah di server sejak terakhir dimuat. Muat ulang halaman sebelum menyimpan lagi.')
        return
      }
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
  if (ctx.role !== 'admin_cabang') return
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
          {canCreateOrDeleteTrainers && (
  <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold px-5 py-2.5 rounded-xl transition shadow-sm active:scale-95">Tambah Trainer Baru</button>
)}
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-sm border text-center">
          <p className="text-slate-400 text-sm">Belum ada data trainer.{canCreateOrDeleteTrainers && ' Klik "Tambah Trainer Baru" untuk memulai.'}</p>
        </div>
        {canCreateOrDeleteTrainers && (
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
        {canCreateOrDeleteTrainers && (
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
                {(canEditTrainers || canCreateOrDeleteTrainers) && (
  <div className="flex gap-1">
    {canEditTrainers && (
      <button onClick={() => openEdit(t)} className="text-slate-400 hover:text-blue-600 p-1">
        {/* pencil icon */}
      </button>
    )}
    {canCreateOrDeleteTrainers && (
      <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-rose-600 p-1">
        {/* trash icon */}
      </button>
    )}
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

      {canEditTrainers && (
  <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.id && trainers.find(t => t.id === form.id) ? 'Edit Trainer' : 'Tambah Trainer'}>
    <TrainerForm
      form={form}
      setForm={setForm}
      save={save}
      onClose={() => setModalOpen(false)}
      saving={saving}
      isEdit={trainers.some(t => t.id === form.id)}
      createAccount={createAccount}
      setCreateAccount={setCreateAccount}
      username={username}
      setUsername={setUsername}
    />
  </Modal>
)}

      {/* USER_PROVISIONING.md D4 — show the system-generated initial password
          exactly once after a successful trainer account creation. The user
          must click "Saya sudah catat" before the dialog can close. */}
      <Modal
        open={initialPasswordDialog !== null && !passwordAcknowledged}
        onClose={() => {}}
        title="Akun Trainer Berhasil Dibuat"
      >
        {initialPasswordDialog && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Akun login untuk <strong>{initialPasswordDialog.trainerName}</strong> sudah dibuat.
              Berikan informasi berikut ke trainer — password hanya ditampilkan sekali dan trainer akan diminta menggantinya saat login pertama.
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">Username</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    readOnly
                    value={initialPasswordDialog.username}
                    className="flex-1 rounded-lg border bg-slate-50 p-2.5 text-sm font-mono"
                  />
                  <button
                    onClick={() => navigator.clipboard?.writeText(initialPasswordDialog.username)}
                    className="bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg text-xs font-bold"
                  >Salin</button>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">Kata Sandi Sementara</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    readOnly
                    value={initialPasswordDialog.password}
                    className="flex-1 rounded-lg border bg-slate-50 p-2.5 text-sm font-mono"
                  />
                  <button
                    onClick={() => navigator.clipboard?.writeText(initialPasswordDialog.password)}
                    className="bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg text-xs font-bold"
                  >Salin</button>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setPasswordAcknowledged(true)
                setInitialPasswordDialog(null)
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm"
            >
              Saya sudah catat, tutup
            </button>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={confirmOpen} onCancel={() => { setConfirmOpen(false); setPendingRemoveId(null) }} onConfirm={doRemove} title="Konfirmasi" body={confirmMsg} danger={true} confirmLabel="Hapus" />
      <AlertDialog open={alertOpen} onOk={() => setAlertOpen(false)} title="Peringatan" body={alertMsg} />
    </div>
  )
}

function TrainerForm({ form, setForm, save, onClose, saving, isEdit, createAccount, setCreateAccount, username, setUsername }) {
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

      {/* USER_PROVISIONING.md D3/D4/D6 — login-account fields, only shown when creating a new trainer. */}
      {!isEdit && (
        <div className="pt-3 border-t border-dashed border-slate-200 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={createAccount}
              disabled={saving}
              onChange={e => setCreateAccount(e.target.checked)}
              className="rounded"
            />
            <span className="font-semibold text-slate-700">Buat akun login untuk trainer ini</span>
          </label>
          <p className="text-[11px] text-slate-400 -mt-2 ml-6">
            Matikan untuk trainer pengganti yang belum membutuhkan kredensial login.
          </p>
          {createAccount && (
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase">Username Login</label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                disabled={saving}
                placeholder="contoh: budi.santoso"
                className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60 font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                3-64 karakter, hanya huruf/angka/titik/garis-bawah/strip. Password sementara akan dibuat otomatis dan ditampilkan setelah simpan.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={save} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm">
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
        <button onClick={onClose} disabled={saving} className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition">Batal</button>
      </div>
    </>
  )
}
