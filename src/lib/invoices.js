import { read, write } from './store.js'
import { generateId } from './constants.js'

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
}) {
  return {
    id: generateId('inv'),
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
  return read('invoices')
}

export function invoicesForSekolah(sekolahId) {
  return read('invoices').filter(inv => inv.sekolahId === sekolahId)
}

export function addInvoice(invoice) {
  const all = read('invoices')
  write('invoices', [...all, invoice])
  return invoice
}

/**
 * Nomor resmi cuma digenerate SEKALI, pas invoice pertama kali diterbitkan
 * (Draft -> Terbit) — supaya draft yang dihapus tidak "membakar" nomor urut.
 * Reset ke 0001 tiap ganti tahun kalender (dihitung dari tanggalTerbit).
 */
export function generateInvoiceNumber(tanggal) {
  const all = read('invoices')
  const year = tanggal.slice(0, 4)
  const yearMonth = tanggal.slice(0, 7).replace('-', '')
  const countThisYear = all.filter(inv => inv.nomor && inv.tanggalTerbit?.slice(0, 4) === year).length
  const seq = countThisYear + 1
  return `AFS-${yearMonth}-${String(seq).padStart(4, '0')}`
}

export function setInvoiceStatus(id, status) {
  const all = read('invoices')
  const updated = all.map(inv => {
    if (inv.id !== id) return inv
    const next = { ...inv, status }
    if (status === 'Terbit' && !inv.nomor) {
      next.nomor = generateInvoiceNumber(inv.tanggalTerbit)
    }
    return next
  })
  write('invoices', updated)
  return updated.find(inv => inv.id === id)
}

export function deleteInvoice(id) {
  const all = read('invoices').filter(inv => inv.id !== id)
  write('invoices', all)
  return all
}