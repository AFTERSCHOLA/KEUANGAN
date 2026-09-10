import { useRef, useState } from 'react'
import { downloadBackup, exportBackup, readBackupFile, restoreBackup } from '../lib/backup'
import { apiRequest, ApiError } from '../lib/api'
import { getRoleContext } from '../lib/store'
import AppModal from './AppModal.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'

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
  const importFileRef = useRef(null)
  const [pendingRestore, setPendingRestore] = useState(null) // { parsed } | null
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  // RH.F.3 — server-side v4 import (superadmin-only). The server importer
  // (server/api/v4-import.php) is the ONLY write path here: no
  // localStorage-only import exists on this panel.
  const [importError, setImportError] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [preview, setPreview] = useState(null) // { payload, report, errorMessage } | null

  // Local mirror of the server-side contract (manage_backup deny-list):
  // every role except superadmin is rejected by the endpoint, and the
  // block below never renders for them either.
  const canImportV4 = getRoleContext().role === 'superadmin'

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

  // --- RH.F.3 v4 import to server --------------------------------------
  // Decision (taste #17): the dry-run preview renders through AppModal
  // directly with ConfirmDialog's exact button classes + yellow topAccent
  // (taste #11 — mirror the idiom, don't invent one). ConfirmDialog
  // itself can't be reused: its body prop is a plain string, while the
  // spec requires per-entity counts plus conflict/error lists.

  async function runImportDryRun(payload) {
    setImportBusy(true)
    setImportError('')
    try {
      const result = await apiRequest('/api/v4-import.php', {
        method: 'POST',
        body: { ...payload, dryRun: true },
      })
      setPreview({ payload, report: result.report, errorMessage: '' })
    } catch (err) {
      const report = err instanceof ApiError ? err.body?.report : null
      if (report && (err.status === 422 || err.status === 409)) {
        // Validation / conflict preview: still a preview — show the
        // counts plus what blocks the commit. "Mulai Impor" stays
        // hidden until the report is clean.
        setPreview({ payload, report, errorMessage: err.message })
      } else {
        setImportError(err instanceof Error ? err.message : 'Gagal melakukan pratinjau impor.')
      }
    } finally {
      setImportBusy(false)
    }
  }

  function handlePickImportFile() {
    setImportError('')
    importFileRef.current?.click()
  }

  async function handleImportFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file later
    if (!file) return
    let parsed = null
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      setImportError('File bukan JSON yang valid.')
      return
    }
    await runImportDryRun(parsed)
  }

  function handleUseBrowserData() {
    // D-RH3: the real v4 data lives in the operator's browser — send
    // the current browser export straight to the server importer.
    runImportDryRun(exportBackup())
  }

  async function handleCommitImport() {
    if (!preview || committing) return
    setCommitting(true)
    try {
      await apiRequest('/api/v4-import.php', {
        method: 'POST',
        body: { ...preview.payload },
      })
      setPreview(null)
      showToast('Impor berhasil. Memuat ulang data...')
      onRestored?.()
      // The server now holds rows the local cache has never seen —
      // hard-reload so every tab re-hydrates from the server.
      setTimeout(() => window.location.reload(), 800)
    } catch (err) {
      const report = err instanceof ApiError ? err.body?.report : null
      if (report && (err.status === 422 || err.status === 409)) {
        setPreview({ payload: preview.payload, report, errorMessage: err.message })
      } else {
        setPreview(null)
        setImportError(err instanceof Error ? err.message : 'Gagal melakukan impor.')
      }
    } finally {
      setCommitting(false)
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

      {canImportV4 && (
        <div data-testid="v4-import-block" className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <h4 className="text-sm font-bold text-slate-800 mb-1">Impor Data v4 ke Server</h4>
          <p className="text-xs text-slate-500 mb-3">
            Kirim data browser (format v4) ke server. Pratinjau dulu sebelum mengimpor.
          </p>
          <input
            ref={importFileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFileChange}
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handlePickImportFile}
              disabled={importBusy}
              className="rounded-xl bg-blue-600 text-white text-sm font-semibold px-4 py-2 hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              Pilih File V4...
            </button>
            <button
              onClick={handleUseBrowserData}
              disabled={importBusy}
              className="rounded-xl bg-emerald-600 text-white text-sm font-semibold px-4 py-2 hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {importBusy ? 'Memuat pratinjau...' : 'Gunakan Data Browser'}
            </button>
          </div>
          {importError && (
            <p className="mt-2 text-xs font-medium text-rose-600">{importError}</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingRestore}
        onCancel={() => setPendingRestore(null)}
        onConfirm={confirmRestore}
        title="Timpa semua data?"
        body="File backup valid. Melanjutkan akan menghapus seluruh data saat ini dan menggantinya dengan isi file ini. Tindakan ini tidak dapat dibatalkan."
        danger
        confirmLabel="Ya, Timpa Data"
        cancelLabel="Batal"
      />

      <AppModal
        open={!!preview}
        onClose={() => { if (!committing) setPreview(null) }}
        title="Pratinjau Impor"
        topAccent="yellow"
        size="lg"
        hideCloseButton
        disableBackdropClose
      >
        {preview && (
          <ImportPreviewBody report={preview.report} errorMessage={preview.errorMessage} />
        )}
        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={() => setPreview(null)}
            disabled={committing}
            className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-500 disabled:opacity-50"
          >
            Batalkan
          </button>
          {preview?.report?.ok && (
            <button
              type="button"
              onClick={handleCommitImport}
              disabled={committing}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow disabled:opacity-50"
            >
              {committing ? 'Mengimpor...' : 'Mulai Impor'}
            </button>
          )}
        </div>
      </AppModal>

      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-xl bg-slate-900 text-white text-sm font-medium px-4 py-2 shadow-lg animate-fadeIn">
          {toast}
        </div>
      )}
    </div>
  )
}

const IMPORT_ENTITY_ORDER = ['cabang', 'sekolah', 'trainer', 'siswa', 'absensi', 'honorPayments', 'sppPayments', 'invoices', 'settings']

function ImportPreviewBody({ report, errorMessage }) {
  const counts = report?.counts || {}
  const total = report?.total ?? Object.values(counts).reduce((n, v) => n + (Number(v) || 0), 0)
  const conflicts = report?.conflicts || []
  const errors = report?.errors || []
  return (
    <div className="space-y-3 -mt-2">
      <p className="text-sm text-slate-600">
        {report?.ok
          ? `Ditemukan ${total} data siap diimpor ke server:`
          : (errorMessage || 'Impor dibatalkan: periksa daftar di bawah ini.')}
      </p>
      <ul className="grid grid-cols-2 gap-1 text-sm text-slate-700">
        {IMPORT_ENTITY_ORDER.map((entity) => (
          <li key={entity} data-testid={`impor-count-${entity}`}>
            {entity}: {Number(counts[entity]) || 0}
          </li>
        ))}
      </ul>
      {conflicts.length > 0 && (
        <div data-testid="impor-conflicts" className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-xs font-bold text-rose-700 mb-1">Konflik ({conflicts.length}) — id sudah tersimpan:</p>
          <ul className="text-xs text-rose-600 space-y-0.5 max-h-32 overflow-y-auto">
            {conflicts.map((c, i) => (
              <li key={`${c.entity}-${c.id}-${i}`}>{c.entity}: {c.id}</li>
            ))}
          </ul>
        </div>
      )}
      {errors.length > 0 && (
        <div data-testid="impor-errors" className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-700 mb-1">Galat ({errors.length}):</p>
          <ul className="text-xs text-amber-700 space-y-0.5 max-h-32 overflow-y-auto">
            {errors.map((e, i) => (
              <li key={`${e.entity}-${e.field}-${i}`}>{e.message || `${e.entity}.${e.field}`}</li>
            ))}
          </ul>
        </div>
      )}
      {Array.isArray(report?.warnings) && report.warnings.length > 0 && (
        <p className="text-xs text-slate-400">{report.warnings.join(' ')}</p>
      )}
    </div>
  )
}
