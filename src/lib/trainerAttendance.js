// TA.B.4 fix — resolve absensiPengajar ke state TERKINI, benar untuk
// rantai koreksi berapa pun levelnya (bukan cuma 1 level). Sebelumnya
// tiap pemanggil (TrainerAttendanceAdmin.jsx, pengajarHonorStats,
// buildTrainerMatrix) punya logic dedup sendiri-sendiri berbasis
// `correctionOf || id` — pecah jadi 2 grup kalau ada koreksi-dari-koreksi
// (rantai 2 level), menyebabkan versi PERANTARA (belum final) ikut
// tampil berdampingan sama versi final — dan untuk pengajarHonorStats,
// berisiko salah hitung honor kalau status berubah di tengah rantai.
// summarizeTrainerAttendance() malah tidak punya dedup sama sekali —
// setiap koreksi dalam rantai dihitung sebagai entry terpisah.
//
// Fix: sebuah record dianggap "sudah kedaluwarsa" kalau id-nya jadi
// correctionOf milik record LAIN — tidak peduli berapa level rantainya.
export function resolveCurrentAbsensiPengajar(records = []) {
  const supersededIds = new Set(
    (records || []).map(r => r?.correctionOf).filter(Boolean)
  )
  return (records || []).filter(r => r && !supersededIds.has(r.id))
}

// TA.C.1 (F-TA4, F-TA5; D-TA13, D-TA15; R-TA5, R-TA6) — personal
// attendance summary helpers for `absensiPengajar` (D-TA7). Pure
// functions so the VERIFY unit test can pin ownership + periode
// filtering without a browser. The UI counterpart is
// src/features/attendance/TrainerAttendanceSummary.jsx.
//
// R-TA6: every helper takes an explicit trainerId and never returns
// rows belonging to another trainer. Callers pass the authenticated
// trainerId (App.jsx `trainerId` prop), never a free-text input.

// TA.C.2 (F-TA4, F-TA5; D-TA15; R-TA5, R-TA9, R-TA10) — monthly matrix
// builder. Pure function: rows = sekolah with ≥1 record in `periode`,
// columns = every calendar day of the month (empty days stay columns,
// R-TA5 derived view). One cell may hold SEVERAL teachers (R-TA9).
//
// R-TA14/D-TA16: label I/A follows the row's `peran` first (CS.B.2
// D-CS3); live `trainer.tipePengajar` is display fallback only for rows
// without peran and never overwrites stored history.
// R-TA4: correction records supersede the original they point at via
// `correctionOf` (same latest-wins rule as TrainerAttendanceAdmin.jsx
// visibleRows) — a corrected row never appears twice in one cell.
// AP.C.2 (D-AP5) — matrix cell text. Pure so the format is unit-pinned:
// Hadir renders bare `Nama (I/A)` (exemplar default); any non-Hadir
// status joins the details after the dash, keterangan last:
// `Nama (I) — EXPO`, `Nama (I) — Izin`, `Nama (I) — Izin, Acara keluarga`.
export function formatMatrixCell(entry) {
  let text = `${entry.nama} (${entry.label})`
  const details = []
  if (entry.status && entry.status !== 'Hadir') details.push(entry.status)
  if (entry.keterangan) details.push(entry.keterangan)
  if (details.length > 0) text += ` — ${details.join(', ')}`
  return text
}

export function buildTrainerMatrix({ absensiPengajar = [], sekolah = [], trainer = [], periode }) {
  const trainersById = new Map((trainer || []).map(t => [t.id, t]))
  const schoolsById = new Map((sekolah || []).map(s => [s.id, s]))

  const current = resolveCurrentAbsensiPengajar(
   (absensiPengajar || []).filter(r => r.periode === periode)
 )

  const cellsBySchoolDay = new Map()
  ;current.forEach(r => {
    const t = trainersById.get(r.trainerId)
    // CS.B.2 (D-CS3) — session role rides on the row: an explicit peran
    // wins over live tipePengajar (display fallback only, never rewrites
    // history). Rows without peran label exactly as before.
    const label = r.peran === 'A' ? 'A' : r.peran === 'I' ? 'I' : (t?.tipePengajar === 'asisten' ? 'A' : 'I')
    const entry = {
      nama: t?.nama || 'Trainer tidak ditemukan',
      label,
      keterangan: r.keterangan || null,
      // Display-only thread for the matrix title-tooltip; never part of
      // cell text (formatMatrixCell) or the CSV export mirror.
      catatan: r.catatan || null,
      status: r.status,
    }
    const key = `${r.sekolahId}|${r.tanggal}`
    if (!cellsBySchoolDay.has(key)) cellsBySchoolDay.set(key, [])
    cellsBySchoolDay.get(key).push(entry)
  })
  cellsBySchoolDay.forEach(entries => entries.sort((a, b) => a.nama.localeCompare(b.nama, 'id')))

  const [y, m] = String(periode).split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const dates = Array.from({ length: daysInMonth }, (_, i) => `${periode}-${String(i + 1).padStart(2, '0')}`)

  const schoolIds = [...new Set(current.map(r => r.sekolahId))]
  const rows = schoolIds
    .map(id => ({
      sekolahId: id,
      nama: schoolsById.get(id)?.nama || 'Sekolah tidak ditemukan',
      cells: Object.fromEntries(dates.map(d => [d, cellsBySchoolDay.get(`${id}|${d}`) || []])),
    }))
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'))

  return { periode, dates, rows }
}
export function summarizeTrainerAttendance({ absensiPengajar = [], trainerId, periode }) {
  const mine = resolveCurrentAbsensiPengajar(
   (absensiPengajar || []).filter(
     r => r.trainerId === trainerId && (!periode || r.periode === periode),
   )
 )
  const total = { Hadir: 0, Izin: 0, Alpa: 0 }
  const schoolIds = new Set()
  mine.forEach(r => {
    if (Object.prototype.hasOwnProperty.call(total, r.status)) total[r.status] += 1
    if (r.sekolahId) schoolIds.add(r.sekolahId)
  })
  const riwayat = [...mine].sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1))
  return { total, sekolahIds: [...schoolIds], riwayat, count: mine.length }
}
