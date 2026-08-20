import { del, get, set } from 'idb-keyval'

export const PHOTO_MAX_BYTES = 500 * 1024
const DB_KEY_PREFIX = 'afterschola-photo-'
const LOCALSTORAGE_WARN_BYTES = 4 * 1024 * 1024

export function dataUrlSizeBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] || ''
  return Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)
}

function imageDataUrl(file, maxDimension, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Gagal memuat gambar'))
      img.onload = () => {
        let { width, height } = img
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.max(1, Math.round((height * maxDimension) / width))
            width = maxDimension
          } else {
            width = Math.max(1, Math.round((width * maxDimension) / height))
            height = maxDimension
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('Browser tidak mendukung pemrosesan gambar'))
          return
        }
        context.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export async function compressImage(file, { maxBytes = PHOTO_MAX_BYTES } = {}) {
  let maxDimension = 1600
  let quality = 0.8
  let result = ''
  for (let attempt = 0; attempt < 8; attempt++) {
    result = await imageDataUrl(file, maxDimension, quality)
    if (dataUrlSizeBytes(result) <= maxBytes) return result
    if (quality > 0.4) quality -= 0.1
    else maxDimension = Math.max(320, Math.round(maxDimension * 0.75))
  }
  if (dataUrlSizeBytes(result) > maxBytes) throw new Error('Foto terlalu besar setelah kompresi')
  return result
}

export async function storePhoto(dataUrl, keyPrefix) {
  const size = dataUrlSizeBytes(dataUrl)
  if (size > PHOTO_MAX_BYTES) throw new Error('Foto melebihi batas 500 KB')
  const key = `${DB_KEY_PREFIX}${keyPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await set(key, dataUrl)
  return { type: 'idb', key, size }
}

export async function loadPhotoDataUrl(entry) {
  if (!entry) return null
  if (entry.type === 'dataurl') return entry.data || null
  if (entry.type === 'idb') return (await get(entry.key)) || null
  return null
}

export async function deletePhotoEntry(entry) {
  if (entry?.type === 'idb') await del(entry.key)
}

export function localStorageUsageBytes() {
  let total = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('afterschola_v4')) total += key.length + (localStorage.getItem(key) || '').length
  }
  return total
}

export const LOCALSTORAGE_WARN_THRESHOLD = LOCALSTORAGE_WARN_BYTES
