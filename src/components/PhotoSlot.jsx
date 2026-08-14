import { useState, useEffect } from 'react'
import { compressImage, storePhoto, loadPhotoDataUrl, deletePhotoEntry } from '../lib/photoStorage.js'

export default function PhotoSlot({ label, entry, onChange, disabled }) {
  const [previewUrl, setPreviewUrl] = useState(null)
  const [busy, setBusy] = useState(false)

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
    try {
      const compressed = await compressImage(file)
      const stored = await storePhoto(compressed, label.toLowerCase().replace(/\s+/g, '-'))
      onChange(stored)
    } catch (err) {
      console.error('Gagal memproses foto', err)
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
    </div>
  )
}