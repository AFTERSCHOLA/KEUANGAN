import { useState } from 'react'
import Modal from './Modal.jsx'
import BackupRestorePanel from './BackupRestorePanel.jsx'
import { getSettings, setSettings, getRoleContext } from '../lib/store'
import { inputClass } from '../lib/ui.js'
import PhotoSlot from './PhotoSlot.jsx'

// In-panel label style — kept local so the muted uppercase caption
// look on the Settings modal doesn't drift into the LoginPage (which
// uses the shared labelClass for a stronger form-label look).
const labelClass = 'mt-1 block text-xs font-bold text-slate-400 uppercase'
const fieldClass = `${inputClass} mt-1`

export default function SettingsModal({ open, onClose, onSaved }) {
  const initial = getSettings()
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl || '')
  const [logoEntry, setLogoEntry] = useState(initial.logoEntry || null)
  const [title, setTitle] = useState(initial.title || '')
  const [alamatUsaha, setAlamatUsaha] = useState(initial.alamatUsaha || '')
  const [rekeningBank, setRekeningBank] = useState(initial.rekeningBank || '')
  const [rekeningNomor, setRekeningNomor] = useState(initial.rekeningNomor || '')
  const [rekeningAtasNama, setRekeningAtasNama] = useState(initial.rekeningAtasNama || '')
  const [penandatangan, setPenandatangan] = useState(initial.penandatangan || '')

  // AUDIT_FOLLOWUP M-AF2.2 — close the read-side settings leak.
  // The server already denies writes for non-superadmin (settings.php
  // / manage_settings deny-list) and the entity itself is excluded
  // from roleCanReadEntity() for non-superadmin. The remaining gap
  // is the form rendering: getSettings() reads from localStorage,
  // which a stale browser profile or a previously-superadmin session
  // can leave populated. The role-gated render here is the local
  // mirror of the server-side contract — non-superadmin callers
  // never see bank rekening / penandatangan / alamatUsaha in the
  // DOM, even if the data is sitting in localStorage.
  const ctx = getRoleContext()
  const canEditSettings = ctx.role === 'superadmin'

  function handleSaveIdentitas() {
  if (!canEditSettings) return
  setSettings({ logoUrl: logoUrl.trim(), logoEntry, title: title.trim() })
  onSaved?.()
  onClose()
  }

  function handleSaveInvoiceInfo() {
    if (!canEditSettings) return
    setSettings({
      alamatUsaha: alamatUsaha.trim(),
      rekeningBank: rekeningBank.trim(),
      rekeningNomor: rekeningNomor.trim(),
      rekeningAtasNama: rekeningAtasNama.trim(),
      penandatangan: penandatangan.trim(),
    })
    onSaved?.()
    onClose()
  }

  if (open && !canEditSettings) {
    return (
      <Modal open={open} onClose={onClose} title="Pengaturan">
        <div
          data-testid="settings-readonly-notice"
          className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600"
        >
          Hanya Superadmin yang dapat mengubah pengaturan global.
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Pengaturan">
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-4">
          <h4 className="text-sm font-bold text-slate-800">Identitas Aplikasi</h4>
          <div>
  <label className={labelClass}>Logo URL</label>
  <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://contoh.com/logo.png" className={fieldClass} />
  <p className="text-[11px] text-slate-400 mt-1">Atau unggah logo langsung di bawah ini — jika ada, logo unggahan akan lebih diprioritaskan tampil.</p>
</div>
<PhotoSlot
  label="Logo (Unggah)"
  entry={logoEntry}
  onChange={setLogoEntry}
/>
          <div>
            <label className={labelClass}>Judul Dashboard</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Afterschola" className={fieldClass} />
          </div>
          <div className="flex justify-end">
            <button onClick={handleSaveIdentitas} className="rounded-xl bg-blue-600 text-white text-sm font-semibold px-4 py-2 hover:bg-blue-700 transition-colors">Simpan</button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-4">
          <h4 className="text-sm font-bold text-slate-800">Info Invoice &amp; Pembayaran</h4>
          <p className="text-[11px] text-slate-400 -mt-2">Dipakai otomatis di setiap invoice yang dicetak.</p>
          <div>
            <label className={labelClass}>Alamat Usaha</label>
            <input value={alamatUsaha} onChange={e => setAlamatUsaha(e.target.value)} placeholder="Jl. Contoh No. 1, Bandung" className={fieldClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Nama Bank</label>
              <input value={rekeningBank} onChange={e => setRekeningBank(e.target.value)} placeholder="BSI" className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>No. Rekening</label>
              <input value={rekeningNomor} onChange={e => setRekeningNomor(e.target.value)} placeholder="1234567890" className={fieldClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Atas Nama</label>
            <input value={rekeningAtasNama} onChange={e => setRekeningAtasNama(e.target.value)} placeholder="PT Contoh" className={fieldClass} />
          </div>
          <div>
            <label className={labelClass}>Nama Penandatangan Invoice</label>
            <input value={penandatangan} onChange={e => setPenandatangan(e.target.value)} placeholder="Nama Lengkap" className={fieldClass} />
          </div>
          <div className="flex justify-end">
            <button onClick={handleSaveInvoiceInfo} className="rounded-xl bg-blue-600 text-white text-sm font-semibold px-4 py-2 hover:bg-blue-700 transition-colors">Simpan</button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <h4 className="text-sm font-bold text-slate-800 mb-3">Backup &amp; Restore Data</h4>
          <BackupRestorePanel onRestored={() => onClose()} />
        </div>
      </div>
    </Modal>
  )
}