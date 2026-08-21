import { test, expect } from './fixtures.js'

const APP = 'http://localhost:5173'

function clearStorage(page) {
  return page.addInitScript(() => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith('afterschola_v4')) localStorage.removeItem(key)
    }
    localStorage.setItem('afterschola_v4_sekolah', JSON.stringify([
      { id: 'skl-PST-cache', nama: 'Sekolah Cache', trainerIds: [], cabangId: 'cbg-PST' },
    ]))
    localStorage.setItem('afterschola_v4_ui', JSON.stringify({ role: 'admin' }))
    localStorage.setItem('afterschola_v4_syncLog', JSON.stringify([
      { key: 'absensi', id: 'abs-offline-1', record: { id: 'abs-offline-1' }, queuedAt: Date.now() },
    ]))
  })
}

test('M7.2.1: offline cache renders and pending sync resolves online', async ({ page, pageErrors }) => {
  await clearStorage(page)
  await page.route('**/api/read.php**', route => route.abort())
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('button', { name: /Sinkronisasi \(1\)/ })).toBeVisible()

  await page.getByRole('button', { name: 'Data Sekolah', exact: true }).click()
  await expect(page.getByText('Sekolah Cache', { exact: true })).toBeVisible()

  let syncPayload = null
  await page.unroute('**/api/read.php**')
  await page.route('**/api/read.php**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'abs-server-1', tanggal: '2026-08-20' }]) })
  })
  await page.route('**/api/sync.php', async route => {
    syncPayload = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ synced: 1, failed: [] }) })
  })

  await page.getByRole('button', { name: /Sinkronisasi \(1\)/ }).click()
  await expect(page.getByRole('button', { name: 'Sinkronisasi', exact: true })).toBeVisible()
  expect(syncPayload.entries).toHaveLength(1)
  expect(syncPayload.entries[0].id).toBe('abs-offline-1')

  const snapshot = await page.evaluate(() => ({
    pending: JSON.parse(localStorage.getItem('afterschola_v4_syncLog') || '[]'),
    absensi: JSON.parse(localStorage.getItem('afterschola_v4_absensi') || '[]'),
  }))
  expect(snapshot.pending).toHaveLength(0)
  expect(snapshot.absensi[0].id).toBe('abs-server-1')
  expect(pageErrors).toHaveLength(0)
})

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
