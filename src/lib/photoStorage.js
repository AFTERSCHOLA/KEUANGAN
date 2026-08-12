// src/lib/photoStorage.js
const DB_NAME = 'afterschola_photos'
const STORE_NAME = 'photos'
const DB_VERSION = 1
const IDB_THRESHOLD_BYTES = 1_000_000 // 1MB — di atas ini simpan ke IndexedDB
const LOCALSTORAGE_WARN_BYTES = 4 * 1024 * 1024 // 4MB

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(key, dataUrl) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(dataUrl, key)
    tx.oncomplete = () => resolve(key)
    tx.onerror = () => reject(tx.error)
  })
}

async function idbGet(key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

async function idbDelete(key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Kompres file gambar jadi dataURL JPEG, resize maksimal 1000px sisi terpanjang */
export function compressImage(file, { maxDimension = 1000, quality = 0.7 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Gagal memuat gambar'))
      img.onload = () => {
        let { width, height } = img
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width)
            width = maxDimension
          } else {
            width = Math.round((width * maxDimension) / height)
            height = maxDimension
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export function dataUrlSizeBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] || ''
  return Math.round(base64.length * 0.75)
}

/** Simpan dataURL hasil kompres — ke IndexedDB kalau >1MB, kalau kecil disimpan langsung di record */
export async function storePhoto(dataUrl, keyPrefix) {
  const size = dataUrlSizeBytes(dataUrl)
  if (size > IDB_THRESHOLD_BYTES) {
    const key = `${keyPrefix}-${Date.now()}`
    await idbPut(key, dataUrl)
    return { type: 'idb', key, size }
  }
  return { type: 'dataurl', data: dataUrl, size }
}

/** Ambil dataURL dari entry dokumentasi (dari IndexedDB kalau perlu) */
export async function loadPhotoDataUrl(entry) {
  if (!entry) return null
  if (entry.type === 'dataurl') return entry.data
  if (entry.type === 'idb') return idbGet(entry.key)
  return null
}

/** Hapus entry dari IndexedDB kalau tersimpan di sana (no-op kalau dataurl) */
export async function deletePhotoEntry(entry) {
  if (entry && entry.type === 'idb') {
    await idbDelete(entry.key)
  }
}

/** Estimasi kasar total pemakaian localStorage untuk semua key afterschola_v4_* */
export function localStorageUsageBytes() {
  let total = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('afterschola_v4')) {
      total += key.length + (localStorage.getItem(key) || '').length
    }
  }
  return total
}

export const LOCALSTORAGE_WARN_THRESHOLD = LOCALSTORAGE_WARN_BYTES