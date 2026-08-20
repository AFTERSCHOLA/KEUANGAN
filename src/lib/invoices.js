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
  return `INV/${year}/${tanggal.slice(5, 7)}/${branch}-${String(seq).padStart(4, '0')}`
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