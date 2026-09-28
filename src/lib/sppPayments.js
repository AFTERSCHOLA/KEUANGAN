// Ledger pembayaran SPP siswa — mirror pola honorPayments (append-only).
// Koreksi lewat entry baru, bukan hapus/edit di tempat.
import { readCached, write, writeRemote } from './store.js'
import { generateId } from './constants.js'
import { invoicePeriods } from './invoices.js'

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

/**
 * BUG12/13 (R-SB2 analog) — derive every cached siswa's sppLunas map from
 * the ledger into the LOCAL cache only (never a server write: the ledger
 * stays the single source of truth). Without this, per-student pills
 * revert after refresh/logout because recomputeSppLunasForSiswa() only
 * ever touched localStorage. Runs after login hydrate + full refresh.
 * write() merges scoped-only for non-superadmin roles, so out-of-scope
 * rows are preserved untouched.
 */
export function recomputeAllSppLunas() {
  const siswaList = readCached('siswa')
  if (siswaList.length === 0) return 0
  const sekolahById = new Map(readCached('sekolah').map(s => [s.id, s]))
  const allPayments = readCached('sppPayments')
  const updated = siswaList.map(s => ({
    ...s,
    sppLunas: computeSppLunas(s.id, allPayments, sekolahById.get(s.sekolahId)?.spp || 0),
  }))
  write('siswa', updated)
  return updated.length
}

// ============================================================
// BR.1 (F-BR1; D-BR1) — bulk-settle preview + source helpers.
// Pure functions (no store access): the BR.2 dialog composes these,
// then appends one row per mintable cell via addSppPayment() —
// never a bare siswaId-null row for the same settlement (that would
// double-count against the minted rows in matchedPaymentsForInvoice).
// ============================================================

/** Tarif efektif per siswa: sppOverride numerik menang atas spp sekolah. */
export function tarifEfektifSiswa(siswa, sekolah) {
  const override = siswa?.sppOverride
  if (typeof override === 'number' && Number.isFinite(override)) return override
  return Number(sekolah?.spp) || 0
}

/** Total nominal baris per-siswa untuk satu sel (siswa, periode). */
export function paidForSiswaPeriode(allPayments, siswaId, periode) {
  return (allPayments || [])
    .filter(p => p.siswaId === siswaId && p.periode === periode)
    .reduce((sum, p) => sum + Number(p.nominal || 0), 0)
}

/**
 * Preview pelunasan sekolah untuk satu invoice (D-BR1, skip-settled mint).
 *
 * Satu sel = (siswa aktif non-Trial milik invoice.sekolahId) × (satu
 * periode dalam invoicePeriods(invoice)). remaining = tarif − paid;
 * sel dengan remaining ≤ 0 dilewati — murid yang sudah lunas (mis.
 * dibayar orang tua) tidak pernah mendapat baris baru, sehingga sumber
 * dana mereka tidak tertimpa apa pun (F-BR1, by construction).
 *
 * Baris invoice-level telanjang (siswaId null) sengaja TIDAK dihitung
 * ke paid: alokasi lump-sum ke per-siswa adalah ambiguitas yang
 * D-BR1 tolak (considered-and-rejected (a)).
 *
 * Returns { cells: [{ siswaId, periode, tarif, paid, remaining }],
 *           rows: [{ siswaId, invoiceId, sekolahId, periode,
 *                    nominal: remaining, sumberDana: 'sekolah' }] }
 * `rows` adalah partial — BR.2 melengkapi via newSppPayment()
 * (metode/diterimaOleh/tanggalBayar/cabang).
 */
export function bulkSettlePreview(invoice, { siswa = [], sekolah = [], sppPayments = [] } = {}) {
  if (!invoice?.id || !invoice?.sekolahId) return { cells: [], rows: [] }
  const periods = invoicePeriods(invoice)
  if (periods.length === 0) return { cells: [], rows: [] }
  const sch = (sekolah || []).find(s => s.id === invoice.sekolahId)
  if (!sch) return { cells: [], rows: [] }

  const cells = []
  const rows = []
  ;(siswa || [])
    .filter(s => s.sekolahId === invoice.sekolahId && s.status !== 'Trial')
    .forEach(s => {
      const tarif = tarifEfektifSiswa(s, sch)
      periods.forEach(periode => {
        const paid = paidForSiswaPeriode(sppPayments, s.id, periode)
        const remaining = tarif - paid
        cells.push({ siswaId: s.id, periode, tarif, paid, remaining })
        if (remaining > 0) {
          rows.push({
            siswaId: s.id,
            invoiceId: invoice.id,
            sekolahId: invoice.sekolahId,
            periode,
            nominal: remaining,
            sumberDana: 'sekolah',
          })
        }
      })
    })
  return { cells, rows }
}

/**
 * Sumber pelunasan satu sel (display-only, tanpa perubahan skema).
 * Mengembalikan sumberDana baris yang mendorong total kumulatif
 * melewati tarif dalam urutan (tanggalBayar, id) — atau null bila
 * sel belum lunas. Baris lama tanpa sumberDana dibaca 'sekolah'
 * (D-SB12: default histori). Deterministik untuk kasus campuran
 * (parsial ortu + sisa sekolah → 'sekolah' yang menggenapkan).
 */
export function sumberPelunasan({ siswaId, periode, payments = [], tarif = 0 }) {
  const ordered = (payments || [])
    .filter(p => p.siswaId === siswaId && p.periode === periode)
    .sort((a, b) =>
      String(a.tanggalBayar || '') < String(b.tanggalBayar || '') ? -1
      : String(a.tanggalBayar || '') > String(b.tanggalBayar || '') ? 1
      : String(a.id || '') < String(b.id || '') ? -1 : 1)
  let running = 0
  for (const p of ordered) {
    running += Number(p.nominal || 0)
    if (running >= Number(tarif)) return p.sumberDana ?? 'sekolah'
  }
  return null
}