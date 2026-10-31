import { getCsrfToken } from './api.js'
import { getSettings } from './store.js'

// ============================================================
// EX.1 — Backend-owned export documents (rekap-pengajar first).
// POST /api/export-doc.php mengembalikan HTML mandiri (inline CSS,
// tanpa JS) yang divisualkan seperti Dokumen Resmi invoice: settings
// (localStorage-only, tidak ada endpoint server) dikirim dalam body
// display-only dan tidak pernah disimpan. Response dibuka di tab
// baru; pengguna menyimpan sebagai PDF lewat dialog Cetak browser.
// Idiom blob-download meniru downloadBackup() di src/lib/backup.js.
// ============================================================

/**
 * Membuka dokumen ekspor server di tab baru. Melempar Error dengan pesan
 * Indonesia (dari server bila ada) saat gagal — pemanggil menampilkan di
 * slot errorMsg miliknya (R-IP2: parent owns the explanation).
 */
export async function requestExportDoc(type, filters = {}) {
  const token = await getCsrfToken()
  const response = await fetch('/api/export-doc.php', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/html',
      'X-CSRF-Token': token,
    },
    body: JSON.stringify({ type, ...filters, settings: getSettings() }),
  })
  if (!response.ok) {
    let message = `Gagal membuka dokumen (${response.status})`
    try {
      const data = await response.json()
      if (data?.error) message = data.error
    } catch {
      // non-JSON error body — pesan default di atas yang dipakai
    }
    throw new Error(message)
  }
  const html = await response.text()
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener')
  return url
}
