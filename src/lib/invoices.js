import { readCached, write } from './store.js'
import { generateId, DEFAULT_CABANG_KODE } from './constants.js'

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
 * currently exist in the codebase (F-SB6/D-SB10 — not yet consolidated):
 *   - client newInvoice(): { periodeList: [...] }
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
 * Normalizes the invoice's billed total across both shapes:
 *   - server: grandTotal (sum of items[].total)
 *   - client: total (jumlahSiswa * hargaSatuan)
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