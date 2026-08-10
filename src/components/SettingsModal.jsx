import { useState } from 'react'
import Modal from './Modal.jsx'
import BackupRestorePanel from './BackupRestorePanel.jsx'
import { getSettings, setSettings } from '../lib/store'

const inputClass = 'w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600'
const labelClass = 'text-xs font-bold text-slate-400 uppercase'

export default function SettingsModal({ open, onClose, onSaved }) {
  const initial = getSettings()
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl || '')
  const [title, setTitle] = useState(initial.title || '')

  function handleSave() {
    setSettings({ logoUrl: logoUrl.trim(), title: title.trim() })
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
            <input
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://contoh.com/logo.png"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Judul Dashboard</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Afterschola"
              className={inputClass}
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              className="rounded-xl bg-blue-600 text-white text-sm font-semibold px-4 py-2 hover:bg-blue-700 transition-colors"
            >
              Simpan
            </button>
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
