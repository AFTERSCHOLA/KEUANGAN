import { useState, useEffect } from 'react'
import { formatRupiah, formatJadwalList } from '../../lib/format.js'
import { newSekolah, defaultCabang } from '../../lib/constants.js'
import RupiahInput from '../../components/RupiahInput.jsx'
import AlertDialog from '../../components/AlertDialog.jsx'
import Modal from '../../components/Modal.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import InvoiceModal from '../reports/InvoiceModal.jsx'
import InvoiceTemplate from '../reports/InvoiceTemplate.jsx'
import PhotoSlot from '../../components/PhotoSlot.jsx'
import { readCached, write, upsert, getRoleContext, writeRemote, deleteRemote, subscribeStore } from '../../lib/store.js'
import { loadPhotoDataUrl } from '../../lib/photoStorage.js'


export default function SchoolList() {
  const [sekolah, setSekolah] = useState(() => readCached('sekolah'))
  const [cabang, setCabang] = useState(() => {
    const list = readCached('cabang')
    return list.length ? list : [defaultCabang()]
  })
  const [selectedCabangId, setSelectedCabangId] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(newSekolah())
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertMsg, setAlertMsg] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [pendingSiswaCount, setPendingSiswaCount] = useState(0)
  const [simpleConfirmOpen, setSimpleConfirmOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [invoiceModalSchool, setInvoiceModalSchool] = useState(null)
  const [printInvoice, setPrintInvoice] = useState(null)

  // M-AF5.2 — keep the Cabang list in step with the cache. The Sekolah
  // form's Cabang <select> reads from this state (passed to SchoolForm
  // as the `cabang` prop), so a delete on this tab or another tab must
  // refresh within 1s without a full page reload.
  //
  // - Same tab: writeRemote('cabang', …) and deleteRemote('cabang', …)
  //   call notifyStoreChanged() which dispatches `afterschola_v4_changed`
  //   — subscribeStore() picks that up and runs refresh().
  // - Cross tab: a localStorage write in tab A fires the native
  //   `storage` event in tab B; the listener below calls refresh() too.
  //
  // Mirrors the useBranch() + subscribeStore() pattern at
  // src/lib/store.js:589-609 (BranchProvider); no new state library is
  // introduced (taste: mirror existing idiom).
  useEffect(() => {
    refresh()
    const unsubscribe = subscribeStore(() => refresh())
    const onStorage = (e) => {
      if (!e.key || e.key.startsWith('afterschola_v4')) refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      unsubscribe()
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const role = getRoleContext().role
  const visibleSekolah = selectedCabangId ? sekolah.filter(s => s.cabangId === selectedCabangId) : sekolah

  function refresh() {
    setSekolah(readCached('sekolah'))
    const nextCabang = readCached('cabang')
    if (nextCabang.length) setCabang(nextCabang)
  }

  function openAdd() {
    const first = cabang[0] || defaultCabang()
    setForm(newSekolah(first.id, first.kode))
    setModalOpen(true)
  }

  function openEdit(sch) {
  setForm({ jadwalList: [], ...sch })
  setModalOpen(true)
}

async function save() {
  if (!form.nama.trim()) {
    setAlertMsg('Nama sekolah tidak boleh kosong.')
    setAlertOpen(true)
    return
  }
  // AUDIT_FOLLOWUP M-AF3.1 — pre-submit cabangId sanity check. The
  // form's <select> only renders real branch options, but a devtools
  // override of the React form state (or a stale `cabang` cache
  // after a delete) can set form.cabangId to an id that no longer
  // resolves. Reject early with the exact Indonesian copy the plan
  // pins so a) the user sees a localized explanation rather than
  // the generic 422 from sekolah.php:47-49, and b) no /api/sekolah.php
  // request is fired (the school-form-validation spec asserts no
  // network traffic — it's the only way to prove the early-return
  // happened before writeRemote).
  if (!form.cabangId || !cabang.some(c => c.id === form.cabangId)) {
    setAlertMsg('Cabang tidak valid')
    setAlertOpen(true)
    return
  }
  const prev = sekolah.find(s => s.id === form.id)
  const oldTrainerIds = prev ? prev.trainerIds : []

  const result = await writeRemote('sekolah', form)
  if (result.status === 'forbidden') {
    setAlertMsg(result.message || 'Kamu tidak punya izin untuk menyimpan sekolah ini.')
    setAlertOpen(true)
    return
  }
  if (result.status === 'conflict') {
    setAlertMsg('Data sekolah ini sudah berubah di server. Muat ulang halaman sebelum menyimpan lagi.')
    setAlertOpen(true)
    return
  }

  const trainerList = readCached('trainer')
  for (const tId of oldTrainerIds) {
    if (!form.trainerIds.includes(tId)) {
      const t = trainerList.find(tr => tr.id === tId)
      if (t) {
        t.sekolahIds = (t.sekolahIds || []).filter(sId => sId !== form.id)
        await writeRemote('trainer', t)
      }
    }
  }
  for (const tId of form.trainerIds) {
    if (!oldTrainerIds.includes(tId)) {
      const t = trainerList.find(tr => tr.id === tId)
      if (t && !(t.sekolahIds || []).includes(form.id)) {
        t.sekolahIds = [...(t.sekolahIds || []), form.id]
        await writeRemote('trainer', t)
      }
    }
  }

  // Rename sync ke siswa.sekolahNama — ini murni derived cache lokal
  // (bukan sumber kebenaran), jadi upsert/write lokal di sini masih OK.
  if (prev && prev.nama !== form.nama) {
    const siswaList = readCached('siswa')
    let touched = false
    siswaList.forEach(s => {
      if (s.sekolahId === form.id && s.sekolahNama !== form.nama) {
        s.sekolahNama = form.nama
        touched = true
      }
    })
    if (touched) write('siswa', siswaList)
  }

  setModalOpen(false)
  refresh()
}

  function remove(id) {
    const siswa = readCached('siswa')
    if (siswa.some(s => s.sekolahId === id)) {
      setPendingDeleteId(id)
      setPendingSiswaCount(siswa.filter(s => s.sekolahId === id).length)
      setConfirmOpen(true)
      return
    }
    // M-AF5.1: no-siswa case must still confirm — open a simple
    // Hapus ConfirmDialog instead of silent-deleting (F-01 manual
    // audit #008). The reassign dialog (confirmOpen) is unchanged.
    setPendingDeleteId(id)
    setSimpleConfirmOpen(true)
  }

  function openReassign() {
    setConfirmOpen(false)
    setPickerOpen(true)
  }

  function reassignTo(targetId) {
    const id = pendingDeleteId
    const siswaList = readCached('siswa')
    const target = sekolah.find(s => s.id === targetId)
    let touched = false
    siswaList.forEach(s => {
      if (s.sekolahId === id) {
        s.sekolahId = targetId
        s.sekolahNama = target ? target.nama : s.sekolahNama
        touched = true
      }
    })
    if (touched) write('siswa', siswaList) // single bulk write (rule 1)
    setPickerOpen(false)
    doDelete(id)
  }

  async function doDelete(id) {
  const sch = sekolah.find(s => s.id === id)
  if (sch) {
    const trainerList = readCached('trainer')
    for (const tId of (sch.trainerIds || [])) {
      const t = trainerList.find(tr => tr.id === tId)
      if (t) {
        t.sekolahIds = (t.sekolahIds || []).filter(sId => sId !== id)
        await writeRemote('trainer', t)
      }
    }
  }
  const result = await deleteRemote('sekolah', id)
  if (result.status === 'forbidden') {
    setAlertMsg(result.message || 'Kamu tidak punya izin untuk menghapus sekolah ini.')
    setAlertOpen(true)
    return
  }
  setPendingDeleteId(null)
  setPendingSiswaCount(0)
  refresh()
}

    if (printInvoice) {
    return <InvoiceTemplate invoice={printInvoice.invoice} sekolah={printInvoice.sekolah} onBack={() => setPrintInvoice(null)} />
  }

  if (visibleSekolah.length === 0 && !modalOpen) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Manajemen Sekolah Mitra</h2>
            <p className="text-xs text-slate-500">Kelola profil, trainer penanggung jawab, jadwal, dan tarif SPP.</p>
          </div>
          <div className="flex items-center gap-2">
            <BranchFilter cabang={cabang} value={selectedCabangId} onChange={setSelectedCabangId} role={role} />
            <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold px-5 py-2.5 rounded-xl transition shadow-sm active:scale-95">Tambah Sekolah Mitra</button>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-sm border text-center">
          <p className="text-slate-400 text-sm">Belum ada data sekolah mitra. Klik "Tambah Sekolah Mitra" untuk memulai.</p>
        </div>
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.id && sekolah.find(s => s.id === form.id) ? 'Edit Sekolah' : 'Tambah Sekolah'}>
          <SchoolForm form={form} setForm={setForm} save={save} onClose={() => setModalOpen(false)} cabang={cabang} />
        </Modal>
        <AlertDialog open={alertOpen} onOk={() => setAlertOpen(false)} title="Peringatan" body={alertMsg} />
        <ConfirmDialog
          open={confirmOpen}
          title="Hapus Sekolah"
          body={`Sekolah ini memiliki ${pendingSiswaCount} siswa. Pilih "Reassign ke sekolah lain" untuk memindahkan siswa sebelum menghapus.`}
          confirmLabel="Reassign ke sekolah lain"
          onCancel={() => { setConfirmOpen(false); setPendingDeleteId(null) }}
          onConfirm={openReassign}
        />
        <ConfirmDialog
          open={simpleConfirmOpen}
          title="Hapus Sekolah"
          body="Sekolah ini akan dihapus permanen. Lanjutkan?"
          confirmLabel="Hapus"
          danger={true}
          onCancel={() => { setSimpleConfirmOpen(false); setPendingDeleteId(null) }}
          onConfirm={() => { setSimpleConfirmOpen(false); doDelete(pendingDeleteId) }}
        />
        <ReassignPicker
          open={pickerOpen}
          sekolah={sekolah}
          excludeId={pendingDeleteId}
          onClose={() => setPickerOpen(false)}
          onPick={reassignTo}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fadeIn">
        <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Manajemen Sekolah Mitra</h2>
            <p className="text-xs text-slate-500">Kelola profil, trainer penanggung jawab, jadwal, dan tarif SPP.</p>
          </div>
          <div className="flex items-center gap-2">
            <BranchFilter cabang={cabang} value={selectedCabangId} onChange={setSelectedCabangId} role={role} />
            <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold px-5 py-2.5 rounded-xl transition shadow-sm active:scale-95">Tambah Sekolah Mitra</button>
          </div>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleSekolah.map(sch => (
          <div key={sch.id} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-100 flex flex-col hover:shadow-md transition">
            <div className="h-44 relative bg-slate-200">
              <SchoolThumbnail sch={sch} />

              <div className="absolute top-2 right-2 flex gap-1">
                <button onClick={() => setInvoiceModalSchool(sch)} className="bg-white/90 hover:bg-white p-1.5 rounded-lg shadow-sm" title="Kelola Invoice"><svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></button>
                <button onClick={() => openEdit(sch)} className="bg-white/90 hover:bg-white p-1.5 rounded-lg shadow-sm" title="Edit" aria-label="Edit sekolah"><svg className="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                <button onClick={() => remove(sch.id)} className="bg-white/90 hover:bg-white p-1.5 rounded-lg shadow-sm"><svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2"/></svg></button>
              </div>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800 line-clamp-1">{sch.nama}</h3>
                <p className="text-[10px] text-blue-600 font-bold uppercase mt-1">{cabang.find(c => c.id === sch.cabangId)?.kode || 'PST'}</p>
                <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                  <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <span className="line-clamp-1">{sch.alamat}</span>
                </p>

                <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Trainer</p>
                    <p className="text-sm font-semibold text-slate-700 line-clamp-1">{sch.trainerIds?.length || 0} Trainer</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Jumlah Siswa</p>
                    <p className="text-sm font-semibold text-slate-700">{readCached('siswa').filter(s => s.sekolahId === sch.id).length} Siswa</p>
                  </div>
                </div>

                <div className="mt-3">
  <p className="text-[10px] text-slate-400 font-bold uppercase">Jadwal Kelas</p>
  <p className="text-xs text-slate-600 bg-slate-100 py-1 px-2.5 rounded-md inline-block mt-1">
    {formatJadwalList(sch.jadwalList) || sch.jadwal || 'Belum diatur'}
  </p>
</div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-bold uppercase">SPP Bulanan</span>
                <span className="text-base font-extrabold text-blue-700">{formatRupiah(sch.spp)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.id && sekolah.find(s => s.id === form.id) ? 'Edit Sekolah' : 'Tambah Sekolah'}>
        <SchoolForm form={form} setForm={setForm} save={save} onClose={() => setModalOpen(false)} cabang={cabang} />
      </Modal>
      <AlertDialog open={alertOpen} onOk={() => setAlertOpen(false)} title="Peringatan" body={alertMsg} />
      <ConfirmDialog
        open={confirmOpen}
        title="Hapus Sekolah"
        body={`Sekolah ini memiliki ${pendingSiswaCount} siswa. Pilih "Reassign ke sekolah lain" untuk memindahkan siswa sebelum menghapus.`}
        confirmLabel="Reassign ke sekolah lain"
        onCancel={() => { setConfirmOpen(false); setPendingDeleteId(null) }}
        onConfirm={openReassign}
      />
      <ConfirmDialog
        open={simpleConfirmOpen}
        title="Hapus Sekolah"
        body="Sekolah ini akan dihapus permanen. Lanjutkan?"
        confirmLabel="Hapus"
        danger={true}
        onCancel={() => { setSimpleConfirmOpen(false); setPendingDeleteId(null) }}
        onConfirm={() => { setSimpleConfirmOpen(false); doDelete(pendingDeleteId) }}
      />
            <ReassignPicker
        open={pickerOpen}
        sekolah={sekolah}
        excludeId={pendingDeleteId}
        onClose={() => setPickerOpen(false)}
        onPick={reassignTo}
      />
      <InvoiceModal
        open={!!invoiceModalSchool}
        sekolah={invoiceModalSchool}
        onClose={() => setInvoiceModalSchool(null)}
        onPrint={(invoice, sch) => { setInvoiceModalSchool(null); setPrintInvoice({ invoice, sekolah: sch }) }}
      />
    </div>
  )
}

function BranchFilter({ cabang, value, onChange, role }) {
  if (role === 'trainer') return null
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label="Filter Cabang" className="rounded-lg border p-2 text-sm bg-white">
      <option value="">Semua Cabang</option>
      {cabang.map(c => <option key={c.id} value={c.id}>{c.nama} ({c.kode})</option>)}
    </select>
  )
}

function SchoolForm({ form, setForm, save, onClose, cabang }) {
  return (
    <>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">Cabang</label>
        <select value={form.cabangId || cabang[0]?.id || defaultCabang().id} onChange={e => {
          const next = cabang.find(c => c.id === e.target.value) || cabang[0] || defaultCabang()
          setForm({ ...form, cabangId: next.id })
        }} className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white">
          {cabang.map(c => <option key={c.id} value={c.id}>{c.nama} ({c.kode})</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">Nama Sekolah</label>
        <input value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">Alamat</label>
        <textarea value={form.alamat} onChange={e => setForm({ ...form, alamat: e.target.value })} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" rows="2" />
      </div>
      <div>
  <label className="text-xs font-bold text-slate-400 uppercase">Foto (URL)</label>
  <input value={form.foto}
        onChange={e => setForm({ ...form, foto: e.target.value })}
        className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
  <p className="text-[11px] text-slate-400 mt-1">Atau unggah foto langsung di bawah ini — jika ada, foto unggahan akan lebih diprioritaskan tampil.</p>
</div>
<PhotoSlot
  label="Foto Sekolah (Unggah)"
  entry={form.fotoEntry}
  onChange={(entry) => setForm({ ...form, fotoEntry: entry })}
/>
      <div>
  <label className="text-xs font-bold text-slate-400 uppercase">Jadwal Kelas</label>
  <div className="space-y-2 mt-1">
    {(form.jadwalList || []).map((entry, idx) => (
      <div key={idx} className="flex gap-2 items-center">
        <select
          value={entry.dayOfWeek}
          onChange={e => {
            const next = [...form.jadwalList]
            next[idx] = { ...next[idx], dayOfWeek: e.target.value }
            setForm({ ...form, jadwalList: next })
          }}
          className="flex-1 rounded-lg border p-2 text-sm bg-white"
        >
          {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'].map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <input
          type="time"
          value={entry.time}
          onChange={e => {
            const next = [...form.jadwalList]
            next[idx] = { ...next[idx], time: e.target.value }
            setForm({ ...form, jadwalList: next })
          }}
          className="w-32 rounded-lg border p-2 text-sm"
        />
        <button
          type="button"
          onClick={() => setForm({ ...form, jadwalList: form.jadwalList.filter((_, i) => i !== idx) })}
          className="text-rose-500 hover:text-rose-700 p-1"
          title="Hapus jadwal ini"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    ))}
    <button
      type="button"
      onClick={() => setForm({ ...form, jadwalList: [...(form.jadwalList || []), { dayOfWeek: 'Senin', time: '14:00' }] })}
      className="text-xs font-semibold text-blue-600 hover:underline"
    >
      + Tambah Jadwal
    </button>
  </div>
</div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">SPP Bulanan</label>
        <RupiahInput
          value={form.spp}
          onChange={val => setForm({ ...form, spp: val })}
          className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600"
        />
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={save} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm">Simpan</button>
        <button onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition">Batal</button>
      </div>
    </>
  )
}

function SchoolThumbnail({ sch }) {
  const [idbUrl, setIdbUrl] = useState(null)

  useEffect(() => {
    let cancelled = false
    if (sch.fotoEntry) {
      loadPhotoDataUrl(sch.fotoEntry).then(url => {
        if (!cancelled) setIdbUrl(url)
      })
    } else {
      setIdbUrl(null)
    }
    return () => { cancelled = true }
  }, [sch.fotoEntry])

  const fallback = 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=400&auto=format&fit=crop&q=80'
  const src = idbUrl || sch.foto || fallback

  return (
    <img
      src={src}
      alt={sch.nama}
      className="w-full h-full object-cover"
      onError={(e) => { e.target.src = fallback }}
    />
  )
}

function ReassignPicker({ open, sekolah, excludeId, onClose, onPick }) {
  const targets = sekolah.filter(s => s.id !== excludeId)
  return (
    <Modal open={open} onClose={onClose} title="Pindahkan Siswa">
      {targets.length === 0 ? (
        <p className="text-sm text-slate-500">Tidak ada sekolah lain untuk dipindahkan. Tambahkan sekolah tujuan terlebih dahulu.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">Pilih sekolah tujuan untuk memindahkan siswa dari sekolah ini:</p>
          {targets.map(t => (
            <button
              key={t.id}
              onClick={() => onPick(t.id)}
              className="w-full text-left bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-xl px-4 py-3 transition"
            >
              <span className="text-sm font-bold text-slate-800">{t.nama}</span>
              <span className="block text-xs text-slate-400">{readCached('siswa').filter(s => s.sekolahId === t.id).length} siswa</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
