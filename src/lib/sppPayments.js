// Ledger pembayaran SPP siswa — mirror pola honorPayments (append-only).
// Koreksi lewat entry baru, bukan hapus/edit di tempat.
import { readCached, write, writeRemote } from './store.js'
import { generateId } from './constants.js'

export function newSppPayment({
  siswaId,
  periode,
  nominal,
  tanggalBayar,
  metode,
  diterimaOleh,
  bukti = null,
  sudahDisetor = false,
  sumberDana = 'sekolah',
  invoiceId = null,
  sekolahId = null,
  cabangKode,
  cabangId,
}) {
  const payment = {
    id: generateId('spp', cabangKode),
    siswaId,
    periode,
    nominal: Number(nominal),
    tanggalBayar,
    metode,
    diterimaOleh,
    bukti,
    sudahDisetor,
    sumberDana,
    cabangId,
  }
  if (invoiceId) payment.invoiceId = invoiceId
  if (sekolahId) payment.sekolahId = sekolahId
  return payment
}

export function listSppPayments() {
  return readCached('sppPayments')
}

export function sppPaymentsForSiswa(siswaId) {
  return readCached('sppPayments').filter(p => p.siswaId === siswaId)
}

export function sppPaymentsForPeriode(periode) {
  return readCached('sppPayments').filter(p => p.periode === periode)
}

/**
 * Tambah entry baru ke ledger (append-only — tidak ada fungsi "update"/"hapus").
 *
 * DC.B.2 (F-DC2; D-DC1) — direct write: payment langsung POST ke server
 * saat submit (dulu antre lewat queueSync + tombol Sinkronisasi; antrean
 * dihapus). writeRemote menggabungkan hasil ke cache + notify.
 */
export async function addSppPayment(payment) {
  const result = await writeRemote('sppPayments', payment)
  return { payment, status: result.status, message: result.message ?? null }
}

/** Turunkan sppLunas dari jumlah nominal ledger terhadap tarif sekolah. */
export function computeSppLunas(siswaId, allPayments, sppTarif = 0) {
  const map = {}
  const totalsByPeriode = {}
  allPayments
    .filter(p => p.siswaId === siswaId)
    .forEach(p => {
      totalsByPeriode[p.periode] = (totalsByPeriode[p.periode] || 0) + Number(p.nominal || 0)
    })
  Object.entries(totalsByPeriode).forEach(([periode, total]) => {
    if (total >= Number(sppTarif)) map[periode] = true
  })
  return map
}

/** Hitung ulang sppLunas siswa dari ledger, lalu simpan ke record siswa. */
export function recomputeSppLunasForSiswa(siswaId) {
  const siswaList = readCached('siswa')
  const target = siswaList.find(s => s.id === siswaId)
  if (!target) return null

  const sekolah = readCached('sekolah').find(s => s.id === target.sekolahId)
  const allPayments = readCached('sppPayments')
  const sppLunas = computeSppLunas(siswaId, allPayments, sekolah?.spp || 0)
  const updated = { ...target, sppLunas }
  write('siswa', siswaList.map(s => (s.id === siswaId ? updated : s)))
  return updated
}