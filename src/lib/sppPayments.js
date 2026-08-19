// src/lib/sppPayments.js
// Ledger pembayaran SPP siswa — mirror pola honorPayments (append-only).
// Koreksi dilakukan lewat hapus-entry, bukan edit di tempat.
import { read, write } from './store.js'
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
}) {
  return {
    id: generateId('spp'),
    siswaId,
    periode,
    nominal: Number(nominal),
    tanggalBayar,
    metode,
    diterimaOleh,
    bukti,
    sudahDisetor,
  }
}

export function listSppPayments() {
  return read('sppPayments')
}

export function sppPaymentsForSiswa(siswaId) {
  return read('sppPayments').filter(p => p.siswaId === siswaId)
}

export function sppPaymentsForPeriode(periode) {
  return read('sppPayments').filter(p => p.periode === periode)
}

/** Tambah entry baru ke ledger (append-only — tidak ada fungsi "update") */
export function addSppPayment(payment) {
  const all = read('sppPayments')
  write('sppPayments', [...all, payment])
  return payment
}

/** Hapus 1 entry — ini satu-satunya jalur koreksi */
export function deleteSppPayment(id) {
  const all = read('sppPayments')
  const deleted = all.find(p => p.id === id)
  const remaining = all.filter(p => p.id !== id)
  write('sppPayments', remaining)
  if (deleted) recomputeSppLunasForSiswa(deleted.siswaId)
  return remaining
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
  const siswaList = read('siswa')
  const target = siswaList.find(s => s.id === siswaId)
  if (!target) return null

  const sekolah = read('sekolah').find(s => s.id === target.sekolahId)
  const allPayments = read('sppPayments')
  const sppLunas = computeSppLunas(siswaId, allPayments, sekolah?.spp || 0)
  const updated = { ...target, sppLunas }
  write('siswa', siswaList.map(s => (s.id === siswaId ? updated : s)))
  return updated
}