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
// R-TA14/D-TA16: label I/A always follows `trainer.tipePengajar`
// TERKINI (not a per-record snapshot) — a type change re-labels old
// cells; that is accepted risk, not a bug.
// R-TA4: correction records supersede the original they point at via
// `correctionOf` (same latest-wins rule as TrainerAttendanceAdmin.jsx
// visibleRows) — a corrected row never appears twice in one cell.
export function buildTrainerMatrix({ absensiPengajar = [], sekolah = [], trainer = [], periode }) {
  const trainersById = new Map((trainer || []).map(t => [t.id, t]))
  const schoolsById = new Map((sekolah || []).map(s => [s.id, s]))

  const latestByOriginal = new Map()
  ;(absensiPengajar || [])
    .filter(r => r.periode === periode)
    .forEach(r => {
      const key = r.correctionOf || r.id
      const existing = latestByOriginal.get(key)
      if (!existing || (r.correctionOf && !existing.correctionOf) || r.id > existing.id) {
        latestByOriginal.set(key, r)
      }
    })

  const cellsBySchoolDay = new Map()
  ;[...latestByOriginal.values()].forEach(r => {
    const t = trainersById.get(r.trainerId)
    const label = t?.tipePengajar === 'asisten' ? 'A' : 'I'
    const entry = {
      nama: t?.nama || 'Trainer tidak ditemukan',
      label,
      keterangan: r.keterangan || null,
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

  const schoolIds = [...new Set([...latestByOriginal.values()].map(r => r.sekolahId))]
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
  const mine = (absensiPengajar || []).filter(
    r => r.trainerId === trainerId && (!periode || r.periode === periode),
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
