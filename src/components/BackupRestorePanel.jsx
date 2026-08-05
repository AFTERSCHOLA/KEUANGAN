import { useRef, useState } from 'react'
import { downloadBackup, readBackupFile, restoreBackup } from '../lib/backup'

/**
 * Drop this inside the Settings modal body.
 * ASSUMPTION (flag for integrator): styled per the Part-5 design table —
 * emerald = export/success action, rose = destructive (restore overwrites
 * everything), yellow-400 border-t-4 = confirm dialog idiom. If the real
 * Settings modal already has its own confirm/toast primitives from
 * components/, swap the local confirm state below for those instead of
 * duplicating the pattern.
 */
export default function BackupRestorePanel({ onRestored }) {
  const fileInputRef = useRef(null)
  const [pendingRestore, setPendingRestore] = useState(null) // { parsed } | null
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function handleExport() {
    downloadBackup()
    showToast('Backup berhasil diunduh.')
  }

  function handlePickFile() {
    setError('')
    fileInputRef.current?.click()
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file later
    if (!file) return

    const result = await readBackupFile(file)
    if (!result.valid) {
      setError(result.errors.join(' '))
      return
    }
    setError('')
    setPendingRestore({ parsed: result.parsed })
  }

  function confirmRestore() {
    try {
      restoreBackup(pendingRestore.parsed)
      setPendingRestore(null)
      showToast('Restore berhasil. Memuat ulang data...')
      onRestored?.()
    } catch (err) {
      setError(err.message)
      setPendingRestore(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
        <h4 className="text-sm font-bold text-slate-800 mb-1">Cadangkan Data (Backup)</h4>
        <p className="text-xs text-slate-500 mb-3">
          Unduh seluruh data (sekolah, siswa, trainer, absensi, pembayaran) sebagai satu file JSON.
        </p>
        <button
          onClick={handleExport}
          className="rounded-xl bg-emerald-600 text-white text-sm font-semibold px-4 py-2 hover:bg-emerald-700 transition-colors"
        >
          Unduh Backup
        </button>
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
        <h4 className="text-sm font-bold text-slate-800 mb-1">Pulihkan Data (Restore)</h4>
        <p className="text-xs text-slate-500 mb-3">
          Pilih file backup JSON. <span className="font-semibold text-rose-600">Ini akan menimpa seluruh data saat ini.</span>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={handlePickFile}
          className="rounded-xl bg-rose-600 text-white text-sm font-semibold px-4 py-2 hover:bg-rose-700 transition-colors"
        >
          Pilih File Backup...
        </button>
        {error && (
          <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>
        )}
      </div>

      {pendingRestore && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl animate-scaleIn max-w-sm w-full border-t-4 border-yellow-400">
            <div className="p-5">
              <h3 className="text-base font-bold text-slate-800 mb-2">Timpa semua data?</h3>
              <p className="text-sm text-slate-600">
                File backup valid. Melanjutkan akan menghapus seluruh data saat ini dan menggantinya
                dengan isi file ini. Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 pb-5">
              <button
                onClick={() => setPendingRestore(null)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                onClick={confirmRestore}
                className="rounded-xl bg-rose-600 text-white px-4 py-2 text-sm font-semibold hover:bg-rose-700"
              >
                Ya, Timpa Data
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-xl bg-slate-900 text-white text-sm font-medium px-4 py-2 shadow-lg animate-fadeIn">
          {toast}
        </div>
      )}
    </div>
  )
}
