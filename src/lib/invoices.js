import { readCached, write, deleteRemote, getSettings } from './store.js'
import { apiRequest, getCsrfToken } from './api.js'
import { generateId, DEFAULT_CABANG_KODE } from './constants.js'

// ============================================================
// SB.C.2 (D-SB10) — LEGACY. newInvoice()/addInvoice()/setInvoiceStatus()/
// generateInvoiceNumber()/deleteInvoice() below write ONLY to
// localStorage and were NEVER wired to any server endpoint (confirmed:
// 'invoices' was absent from store.js's WRITE_ENDPOINTS/READABLE_SERVER_KEYS
// until this same microtask added it for reading). They are kept
// UNCHANGED here purely so any invoice created by the old InvoiceModal
// flow, before this migration, remains readable/printable from whatever
// is still sitting in a user's local cache.
//
// DO NOT call these to create new invoices. The canonical creation path
// is generateInvoiceForSekolah() at the bottom of this file, which calls
// /api/invoices-generate.php — the same function the cron/manual-trigger
// bulk generator uses (server/lib/invoiceGenerator.php).
//
// KNOWN GAP (flagging, not solving here — out of SB.C.2's stated scope):
// any invoice created via the OLD client flow before this migration
// exists ONLY in that browser's localStorage and was never in MySQL. It
// will not appear for other devices/sessions, and — because 'invoices'
// create/update was never in WRITE_ENDPOINTS — there is no automatic
// backfill path. If those old records need to survive, that's a
// one-time data migration, not something this microtask silently
// attempts.
// ============================================================

export function newInvoice({
  sekolahId,
  mode, // 'bulanan' | 'semester'
  periodeList,
  jumlahSiswa,
  hargaSatuan,
  jumlahPertemuan = null,
  pjSekolah = '',
  uraian = '',
  tanggalTerbit,
  cabangKode,
  carryOverLines = [],
}) {
  return {
    id: generateId('inv', cabangKode),
    nomor: null, // diisi otomatis saat status berubah jadi 'Terbit' (lihat setInvoiceStatus)
    sekolahId,
    mode,
    periodeList,
    jumlahSiswa,
    hargaSatuan,
    jumlahPertemuan,
    total: jumlahSiswa * hargaSatuan,
    pjSekolah,
    uraian,
    tanggalTerbit,
    status: 'Draft',
    carryOverLines,
    createdAt: new Date().toISOString(),
  }
}

export function listInvoices() {
  return readCached('invoices')
}

export function invoicesForSekolah(sekolahId) {
  return readCached('invoices').filter(inv => inv.sekolahId === sekolahId)
}

export function addInvoice(invoice) {
  const all = readCached('invoices')
  write('invoices', [...all, invoice])
  return invoice
}

/**
 * Nomor resmi cuma digenerate SEKALI, pas invoice pertama kali diterbitkan
 * (Draft -> Terbit) — supaya draft yang dihapus tidak "membakar" nomor urut.
 * Reset ke 0001 tiap ganti tahun kalender (dihitung dari tanggalTerbit).
 */
export function generateInvoiceNumber(tanggal, sekolahId) {
  const all = readCached('invoices')
  const year = tanggal.slice(0, 4)
  const sekolah = readCached('sekolah').find(s => s.id === sekolahId)
  const cabang = readCached('cabang').find(c => c.id === sekolah?.cabangId)
  const branch = cabang?.kode || DEFAULT_CABANG_KODE
  const countThisYearAndBranch = all.filter(inv => {
    if (!inv.nomor || inv.tanggalTerbit?.slice(0, 4) !== year) return false
    const invoiceSchool = readCached('sekolah').find(s => s.id === inv.sekolahId)
    const invoiceBranch = readCached('cabang').find(c => c.id === invoiceSchool?.cabangId)
    return (invoiceBranch?.kode || DEFAULT_CABANG_KODE) === branch
  }).length
  const seq = countThisYearAndBranch + 1
  return `${branch}-${year}${tanggal.slice(5, 7)}-${String(seq).padStart(4, '0')}`
}

export function setInvoiceStatus(id, status) {
  const all = readCached('invoices')
  const updated = all.map(inv => {
    if (inv.id !== id) return inv
    const next = { ...inv, status }
    if (status === 'Terbit' && !inv.nomor) {
      next.nomor = generateInvoiceNumber(inv.tanggalTerbit, inv.sekolahId)
    }
    return next
  })
  write('invoices', updated)
  return updated.find(inv => inv.id === id)
}

export function deleteInvoice(id) {
  const all = readCached('invoices').filter(inv => inv.id !== id)
  write('invoices', all)
  return all
}

// ============================================================
// SB.B.2 — derived payment status (D-SB8, D-SB9). Pure read-only
// functions: never write to sppPayments (R-SB1) or to invoice.status
// (D-SB9 — Lunas/Belum Lunas is always computed, never stored).
// ============================================================

/**
 * Normalizes the periode(s) an invoice covers, across both shapes that
 * currently exist in the codebase (F-SB6/D-SB10):
 *   - client newInvoice() [legacy, no longer used to CREATE]: { periodeList: [...] }
 *   - server generateInvoicesForPeriod(): { periode: 'YYYY-MM' }
 * Returns [] if neither is present.
 */
export function invoicePeriods(invoice) {
  if (Array.isArray(invoice.periodeList) && invoice.periodeList.length > 0) {
    return invoice.periodeList
  }
  if (invoice.periode) return [invoice.periode]
  return []
}

/**
 * SB.B.4 / D-SB11
 * Mengecek apakah suatu periode sudah tercakup invoice Terbit
 * untuk sekolah yang sama.
 *
 * Read-only: tidak mengubah invoice apa pun.
 */
export function findIssuedInvoiceForPeriod(
  sekolahId,
  periode,
  { invoices = [] } = {}
) {
  if (!sekolahId || !periode) return null

  return invoices.find(inv =>
    inv.sekolahId === sekolahId &&
    inv.status === 'Terbit' &&
    invoicePeriods(inv).includes(periode)
  ) || null
}

/**
 * Normalizes the invoice's billed total across both shapes:
 *   - server: grandTotal (sum of items[].total)
 *   - client legacy: total (jumlahSiswa * hargaSatuan)
 * Prefers grandTotal since D-SB10 names the server path canonical.
 */
export function invoiceTotal(invoice) {
  if (typeof invoice.grandTotal === 'number') return invoice.grandTotal
  if (typeof invoice.total === 'number') return invoice.total
  return 0
}

/**
 * Matches sppPayments rows to one invoice, per D-SB8:
 *   1. New payments carry invoiceId directly — match on that alone.
 *   2. Historical payments have no invoiceId — match via siswa's
 *      sekolahId (must equal invoice.sekolahId) AND the payment's
 *      periode falling inside the invoice's periode(s) (R-SB6: never
 *      cross-sekolah).
 * Read-only: does not touch the sppPayments ledger.
 */
export function matchedPaymentsForInvoice(invoice, { sppPayments = [], siswa = [] } = {}) {
  const periods = invoicePeriods(invoice)
  const siswaIdsForSekolah = new Set(
    siswa.filter(s => s.sekolahId === invoice.sekolahId).map(s => s.id)
  )

  return sppPayments.filter(p => {
    if (p.invoiceId) return p.invoiceId === invoice.id
    if (!siswaIdsForSekolah.has(p.siswaId)) return false
    return periods.includes(p.periode)
  })
}

/**
 * Derives total / dibayar / sisa / credit / status for one invoice from
 * the ledger, per D-SB9: status is always computed here, never stored.
 * `status: 'Lunas'` when sisa <= 0 (covers both exact and overpayment;
 * overpayment additionally reports a positive `credit`).
 */
export function invoiceSettlement(invoice, { sppPayments = [], siswa = [] } = {}) {
  const matched = matchedPaymentsForInvoice(invoice, { sppPayments, siswa })
  const dibayar = matched.reduce((sum, p) => sum + Number(p.nominal || 0), 0)
  const total = invoiceTotal(invoice)
  const sisa = Math.max(0, total - dibayar)
  const credit = Math.max(0, dibayar - total)

  return {
    total,
    dibayar,
    sisa,
    credit,
    status: sisa <= 0 ? 'Lunas' : 'Belum Lunas',
  }
}

/**
 * SB.B.4 — Carry-over dari invoice sebelumnya.
 *
 * Carry-over tidak mengubah invoice.total.
 * Yang dibawa hanya:
 *   - sisa invoice sebelumnya -> positif
 *   - credit/kelebihan bayar -> negatif
 *
 * Setiap line wajib membawa invoiceId asal agar sumbernya jelas.
 * Hanya invoice dari sekolah yang sama yang boleh menjadi sumber.
 *
 * SB.C.2 — hasil fungsi ini dikirim ke server (invoices-generate.php)
 * sebagai carryOverLines pada request; server MEMVALIDASI ULANG setiap
 * invoiceId di dalamnya benar-benar milik sekolahId yang sama (R-SB6)
 * sebelum menyimpannya. Fungsi ini sendiri tetap read-only.
 */
export function carryOverLines(
  invoice,
  {
    invoices = [],
    sppPayments = [],
    siswa = [],
  } = {}
) {
  if (!invoice?.id || !invoice?.sekolahId) return []

  const previousInvoices = invoices
    .filter(inv =>
      inv.id !== invoice.id &&
      inv.sekolahId === invoice.sekolahId &&
      inv.status === 'Terbit'
    )
    .sort((a, b) => {
      const aDate = a.tanggalTerbit || a.createdAt || ''
      const bDate = b.tanggalTerbit || b.createdAt || ''
      return aDate < bDate ? 1 : -1
    })

  if (previousInvoices.length === 0) return []

  const previous = previousInvoices[0]

  // Hard guard: carry-over tidak boleh lintas sekolah.
  if (previous.sekolahId !== invoice.sekolahId) {
    throw new Error('Carry-over invoice tidak boleh lintas sekolah')
  }

  const settlement = invoiceSettlement(previous, {
    sppPayments,
    siswa,
  })

  const lines = []

  if (settlement.sisa > 0) {
    lines.push({
      type: 'carry-over',
      kind: 'outstanding',
      invoiceId: previous.id,
      nomorInvoiceAsal: previous.nomor || null,
      description: `Sisa tagihan invoice ${previous.nomor || previous.id}`,
      amount: settlement.sisa,
    })
  }

  if (settlement.credit > 0) {
    lines.push({
      type: 'carry-over',
      kind: 'credit',
      invoiceId: previous.id,
      nomorInvoiceAsal: previous.nomor || null,
      description: `Kelebihan bayar invoice ${previous.nomor || previous.id}`,
      amount: -settlement.credit,
    })
  }

  return lines
}

// ============================================================
// SB.C.2 (D-SB10) — CANONICAL invoice creation. Server-authoritative:
// this calls /api/invoices-generate.php, which runs the SAME
// generateInvoicesForPeriod() the cron/manual-trigger bulk generator
// uses (server/lib/invoiceGenerator.php). There is now exactly one
// function in the whole codebase that decides how an invoice's items/
// grandTotal/nomorInvoice are computed.
// ============================================================

/**
 * Membuat invoice untuk satu sekolah via server.
 *
 * mode 'bulanan' -> periodeList berisi 1 periode -> 1 panggilan server.
 * mode 'semester' -> periodeList berisi 6 periode -> N panggilan server,
 * satu per bulan (D-SB10 §9 poin 2 follow-up, opsi (a): map ke N invoice
 * single-periode, bukan extend generator jadi multi-periode-per-invoice).
 *
 * KNOWN LIMITATION: carryOverLines cuma dipasang di invoice PERTAMA
 * dalam batch (bulan pertama semester). Invoice ke-2 dst dalam batch yang
 * sama BELUM di-chain carry-over dari invoice ke-1 dalam batch yang sama
 * (baru "invoice Terbit sungguhan yang sudah ada di server sebelum batch
 * ini mulai" yang ter-carry). Kalau chaining intra-batch dibutuhkan, itu
 * follow-up terpisah — tidak ditebak di sini.
 *
 * Melempar (throw) kalau salah satu panggilan gagal; panggilan
 * sebelumnya dalam batch yang sama TETAP tersimpan di server (tidak ada
 * rollback lintas-request) — pemanggil (UI) perlu refresh data invoice
 * setelah error untuk melihat state sebenarnya, bukan asumsi "semua
 * gagal".
 */
export async function generateInvoiceForSekolah({
  sekolahId,
  cabangId,
  uraian,
  periodeList,
  carryOverLines: precomputedCarryOverLines = [],
}) {
  if (!Array.isArray(periodeList) || periodeList.length === 0) {
    throw new Error('periodeList tidak boleh kosong')
  }

  const results = []
  for (let i = 0; i < periodeList.length; i++) {
    const periode = periodeList[i]
    const body = { periode, uraian, sekolahId }
    if (cabangId) body.cabangId = cabangId
    if (i === 0 && precomputedCarryOverLines.length > 0) {
      body.carryOverLines = precomputedCarryOverLines
    }
    const result = await apiRequest('/api/invoices-generate.php', {
      method: 'POST',
      body,
    })
    results.push(result)
  }
  return results
}

/** Menghapus invoice via server (superadmin-only, ditegakkan di invoices.php). */
export async function deleteInvoiceServer(id) {
  return deleteRemote('invoices', id)
}

// ============================================================
// IP.3 (D-IP7) — Dokumen invoice resmi dari server.
// POST /api/invoices-doc.php mengembalikan HTML mandiri (inline CSS,
// dataURL images, tanpa JS) yang divisualkan seperti invoice-template.pdf.
// settings (localStorage-only, tidak ada endpoint server) dikirim dalam
// body display-only dan tidak pernah disimpan. Response dibuka di tab
// baru; pengguna menyimpan sebagai PDF lewat dialog Cetak browser.
// Idiom blob-download meniru downloadBackup() di src/lib/backup.js.
// ============================================================

/**
 * Membuka dokumen invoice resmi di tab baru. Melempar Error dengan pesan
 * Indonesia (dari server bila ada) saat gagal — pemanggil menampilkan di
 * slot errorMsg miliknya (R-IP2: parent owns the explanation).
 */
export async function openInvoiceDoc(id) {
  const token = await getCsrfToken()
  const response = await fetch('/api/invoices-doc.php', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/html',
      'X-CSRF-Token': token,
    },
    body: JSON.stringify({ id, settings: getSettings() }),
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