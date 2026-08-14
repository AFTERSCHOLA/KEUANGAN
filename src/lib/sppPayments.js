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