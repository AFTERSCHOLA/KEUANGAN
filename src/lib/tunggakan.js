// lib/tunggakan.js — Person 4 (M3.2, row #13)
// Pure functions only — no store/DOM access, so it can be unit-tested
// and dropped into features/students/StudentList.jsx without altering
// that file's ownership boundary more than necessary (R7).

import { MONTHS, MONTH_KEYS, calYear } from './constants'

/**
 * List of { monthName, periode } pairs for the academic year `academicStartYear`,
 * from Juli up to (and including) the selected month index (0-based position
 * in MONTHS/MONTH_KEYS, i.e. Juli=0 ... Juni=11).
 * "Elapsed" = Juli..selectedMonth inclusive, per the M3.2 spec.
 */
export function elapsedPeriods(academicStartYear, selectedMonthNum) {
  // Find index of selectedMonthNum (1-12 calendar month) within MONTH_KEYS order.
  const key = String(selectedMonthNum).padStart(2, '0')
  const idx = MONTH_KEYS.indexOf(key)
  if (idx === -1) return []

  return MONTH_KEYS.slice(0, idx + 1).map((mk, i) => {
    const monthNum = Number(mk)
    const year = calYear(monthNum, academicStartYear)
    return {
      monthName: MONTHS[i],
      periode: `${year}-${mk}`,
    }
  })
}

/**
 * Does this siswa have at least one unpaid month among the elapsed periods?
 * sppLunas is sparse: missing key = unpaid (Part 2 convention #2).
 */
export function isTunggakan(siswa, elapsed) {
  return elapsed.some(({ periode }) => !siswa.sppLunas?.[periode])
}

/**
 * Filter siswa list down to those with at least one unpaid elapsed month.
 * Each returned item is annotated with `unpaidMonths` (display names) for
 * the row UI to render, e.g. "Belum bayar: Agustus, Oktober".
 */
export function filterTunggakan(siswaList, academicStartYear, selectedMonthNum) {
  const elapsed = elapsedPeriods(academicStartYear, selectedMonthNum)
  return siswaList
    .filter(s => isTunggakan(s, elapsed))
    .map(s => ({
      ...s,
      unpaidMonths: elapsed.filter(({ periode }) => !s.sppLunas?.[periode]).map(e => e.monthName),
    }))
}

/**
 * Build the WhatsApp deep link + prefilled message for a tunggakan reminder.
 * Uses the *most recent* unpaid month in unpaidMonths for the template
 * (last element, since elapsed[] is chronological Juli→...).
 * spp = the school's SPP nominal (rupiah, raw number).
 */
export function buildTagihanWaLink(siswa, spp, unpaidMonths) {
  const bulan = unpaidMonths[unpaidMonths.length - 1] || ''
  const rupiah = new Intl.NumberFormat('id-ID').format(spp)
  const text = `Tagihan SPP bulan ${bulan} untuk Ananda ${siswa.nama}: Rp ${rupiah}`
  return `https://wa.me/${siswa.wa}?text=${encodeURIComponent(text)}`
}
