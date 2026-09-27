import { test, expect } from './fixtures.js'

const APP = 'http://localhost:5173'

// DC.B.4 (D-DC1): the M7.2.1 offline-queue test is deleted with the queue
// it contracted (upsert+syncLog+Sinkronisasi all removed; M7.2.1 offline
// capture explicitly unsupported). Offline-render (cache shows when reads
// fail) has no dedicated leg — logged as drift DL-3 for triage.

test('M7.2.3: large photo compresses below 500KB and stays in IndexedDB', async ({ page, pageErrors }) => {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  const result = await page.evaluate(async () => {
    const { compressImage, storePhoto, dataUrlSizeBytes, localStorageUsageBytes } = await import('/src/lib/photoStorage.js')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><rect width="1200" height="1200" fill="#1e3a8a"/>${' '.repeat(600 * 1024)}</svg>`
    const file = new File([svg], 'large.svg', { type: 'image/svg+xml' })
    const compressed = await compressImage(file)
    const entry = await storePhoto(compressed, 'm72')
    const stored = await new Promise((resolve, reject) => {
      const request = indexedDB.open('keyval-store')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const transaction = request.result.transaction('keyval', 'readonly')
        const getRequest = transaction.objectStore('keyval').get(entry.key)
        getRequest.onsuccess = () => resolve(getRequest.result)
        getRequest.onerror = () => reject(getRequest.error)
      }
    })
    localStorage.setItem('afterschola_v4_absensi', JSON.stringify([{ id: 'abs-photo-m72', dokumentasi: [entry] }]))
    return {
      sourceBytes: file.size,
      outputBytes: dataUrlSizeBytes(compressed),
      entry,
      storedBytes: dataUrlSizeBytes(stored),
      localStorageBytes: localStorageUsageBytes(),
    }
  })

  expect(result.sourceBytes).toBeGreaterThan(500 * 1024)
  expect(result.outputBytes).toBeLessThanOrEqual(500 * 1024)
  expect(result.entry.type).toBe('idb')
  expect(result.entry).not.toHaveProperty('data')
  expect(result.storedBytes).toBeLessThanOrEqual(500 * 1024)
  expect(result.localStorageBytes).toBeLessThan(2 * 1024 * 1024)
  expect(pageErrors).toHaveLength(0)
})
