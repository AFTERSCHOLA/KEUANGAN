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
    nominal,
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
  const all = read('sppPayments').filter(p => p.id !== id)
  write('sppPayments', all)
  return all
}

/**
 * M6.1.3 — Turunkan sppLunas dari ledger: satu periode dianggap "lunas"
 * kalau ada MINIMAL 1 entry pembayaran untuk periode itu (bukan jumlah
 * nominal — keputusan desain: sppLunas tetap boolean sederhana seperti
 * semula, bukan tracking pembayaran sebagian).
 */
export function computeSppLunas(siswaId, allPayments) {
  const map = {}
  allPayments
    .filter(p => p.siswaId === siswaId)
    .forEach(p => { map[p.periode] = true })
  return map
}

/** Hitung ulang sppLunas siswa dari ledger, lalu simpan ke record siswa */
export function recomputeSppLunasForSiswa(siswaId) {
  const siswaList = read('siswa')
  const target = siswaList.find(s => s.id === siswaId)
  if (!target) return null

  const allPayments = read('sppPayments')
  const sppLunas = computeSppLunas(siswaId, allPayments)
  const updated = { ...target, sppLunas }
  write('siswa', siswaList.map(s => (s.id === siswaId ? updated : s)))
  return updated
}