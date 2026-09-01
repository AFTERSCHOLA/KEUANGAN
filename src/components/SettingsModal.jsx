import { useState } from 'react'
import Modal from './Modal.jsx'
import BackupRestorePanel from './BackupRestorePanel.jsx'
import { getSettings, setSettings } from '../lib/store'
import { inputClass } from '../lib/ui.js'

// In-panel label style — kept local so the muted uppercase caption
// look on the Settings modal doesn't drift into the LoginPage (which
// uses the shared labelClass for a stronger form-label look).
const labelClass = 'mt-1 block text-xs font-bold text-slate-400 uppercase'
const fieldClass = `${inputClass} mt-1`

export default function SettingsModal({ open, onClose, onSaved }) {
  const initial = getSettings()
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl || '')
  const [title, setTitle] = useState(initial.title || '')
  const [alamatUsaha, setAlamatUsaha] = useState(initial.alamatUsaha || '')
  const [rekeningBank, setRekeningBank] = useState(initial.rekeningBank || '')
  const [rekeningNomor, setRekeningNomor] = useState(initial.rekeningNomor || '')
  const [rekeningAtasNama, setRekeningAtasNama] = useState(initial.rekeningAtasNama || '')
  const [penandatangan, setPenandatangan] = useState(initial.penandatangan || '')

  function handleSaveIdentitas() {
    setSettings({ logoUrl: logoUrl.trim(), title: title.trim() })
    onSaved?.()
    onClose()
  }

  function handleSaveInvoiceInfo() {
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

  return (
    <Modal open={open} onClose={onClose} title="Pengaturan">
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-4">
          <h4 className="text-sm font-bold text-slate-800">Identitas Aplikasi</h4>
          <div>
            <label className={labelClass}>Logo URL</label>
            <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://contoh.com/logo.png" className={fieldClass} />
          </div>
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