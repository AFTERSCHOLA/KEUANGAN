import { useState, useEffect } from 'react'
import { compressImage, storePhoto, loadPhotoDataUrl, deletePhotoEntry, uploadPhotoToServer, uploadLogoToServer } from '../lib/photoStorage.js'
import { getSafeIdentityContext } from '../lib/auth.js'

export default function PhotoSlot({ label, entry, onChange, disabled, uploadMode = 'branch-photo' }) {
  const [previewUrl, setPreviewUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!entry) {
      setPreviewUrl(null)
      return
    }
    loadPhotoDataUrl(entry).then(url => {
      if (!cancelled) setPreviewUrl(url)
    })
    return () => { cancelled = true }
  }, [entry])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const compressed = await compressImage(file)
      const stored = await storePhoto(compressed, label.toLowerCase().replace(/\s+/g, '-'))
      // RH.D.5 — server tier when authed (taste #11: same save path, no new
      // pattern). Non-superadmin sessions carry their branch server-side so
      // the upload needs no cabangId; superadmin has no PhotoSlot branch
      // context (no API change) and anonymous/offline has no session — both
      // stay idb-only. Any upload failure falls back to the idb entry
      // silently (photo outbox deferred, RELEASE_HYGIENE_PLAN §13).
      // LP.B.3 — global-logo mode (D-LP4): only a superadmin session takes
      // the server path, via the cabang-less uploadLogoToServer; every other
      // role (and any upload failure) keeps the idb-only entry silently
      // (R-LP5 boundary). Branch-photo mode below is verbatim (R-LP4).
      const user = getSafeIdentityContext()
      const useServerTier = uploadMode === 'global-logo'
        ? (user && user.role === 'superadmin')
        : (user && user.role !== 'superadmin')
      if (useServerTier) {
        try {
          const serverEntry = uploadMode === 'global-logo'
            ? await uploadLogoToServer(compressed)
            : await uploadPhotoToServer(compressed)
          try {
            await deletePhotoEntry(stored)
          } catch {
            // Best-effort dedupe: the server cache already holds the bytes.
          }
          onChange(serverEntry)
          return
        } catch {
          // Offline/denied/validation — keep the idb-only entry below.
        }
      }
      onChange(stored)
    } catch (err) {
      setError(err.message || 'Gagal memproses foto')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (entry) await deletePhotoEntry(entry)
    onChange(null)
  }

  return (
    <div>
      <label className="text-xs font-bold text-slate-400 uppercase">{label}</label>
      <div className="mt-1 flex items-center gap-3">
        {previewUrl ? (
          <img src={previewUrl} alt={label} className="w-16 h-16 rounded-lg object-cover border" />
        ) : (
          <div className="w-16 h-16 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-300 text-[10px] text-center">
            Belum ada
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-blue-600 cursor-pointer hover:underline">
            {busy ? 'Memproses...' : entry ? 'Ganti foto' : 'Pilih foto'}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={disabled || busy} />
          </label>
          {entry && (
            <button type="button" onClick={handleRemove} className="text-xs font-semibold text-rose-500 hover:underline text-left">
              Hapus foto
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-xs font-semibold text-rose-500">{error}</p>}
    </div>
  )
}
