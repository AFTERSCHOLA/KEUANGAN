// ============================================
// M5.3.1 — Review queue logic
// Flags: no-photo, >20% deviation from school trailing average,
// first-ever student appearance, edited-after-verification.
// Plus a stable randomized weekly sample: 2–3 unreviewed records per
// trainer per ISO week when enough records are available.
// ============================================

function isoWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const diff = target - firstThursday
  const week = 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000))
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function hadirCount(record) {
  return (record.siswaList || []).filter(s => s.status === 'Hadir').length
}

function simpleHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}

function hasPhoto(record) {
  return !!record.foto || (record.dokumentasi || []).some(Boolean)
}

/**
 * Returns [{ record, reasons: string[] }] — flagged records first, then
 * the weekly sample (reasons: ['Sampel acak mingguan untuk verifikasi']).
 */
export function buildReviewQueue(absensi) {
  const sorted = [...absensi].sort((a, b) => (a.tanggal < b.tanggal ? -1 : 1))
  const seenStudent = new Set()
  const bySchoolTrailing = {}
  const flagged = []

  sorted.forEach(record => {
    const reasons = []

    if (!hasPhoto(record)) reasons.push('Tanpa foto bukti sesi')

    const trail = bySchoolTrailing[record.sekolahId] || []
    if (trail.length >= 3) {
      const avg = trail.reduce((a, b) => a + b, 0) / trail.length
      const count = hadirCount(record)
      if (avg > 0 && Math.abs(count - avg) / avg > 0.2) {
        reasons.push(`Kehadiran (${count}) menyimpang >20% dari rata-rata sekolah (${avg.toFixed(1)})`)
      }
    }

    ;(record.siswaList || []).forEach(s => {
      if (s.status === 'Hadir') {
        if (!seenStudent.has(s.siswaId)) {
          reasons.push(`Kemunculan pertama siswa: ${s.nama}`)
        }
        seenStudent.add(s.siswaId)
      }
    })

    if (record.statusVerifikasi && record.lastEditedAt && record.lastEditedAt > record.statusVerifikasi.at) {
      reasons.push('Diedit setelah diverifikasi sebelumnya')
    }

    bySchoolTrailing[record.sekolahId] = [...trail, hadirCount(record)].slice(-5)

    if (reasons.length > 0) flagged.push({ record, reasons })
  })

  const flaggedIds = new Set(flagged.map(f => f.record.id))
  const byTrainerWeek = {}
  sorted.forEach(record => {
    if (record.statusVerifikasi?.at || flaggedIds.has(record.id)) return
    const key = `${record.trainerId}|${isoWeekKey(record.tanggal)}`
    if (!byTrainerWeek[key]) byTrainerWeek[key] = []
    byTrainerWeek[key].push(record)
  })

  const sampled = []
  Object.values(byTrainerWeek).forEach(records => {
    const ranked = [...records].sort((a, b) => simpleHash(a.id) - simpleHash(b.id))
    const sampleCount = Math.min(3, records.length >= 2 ? Math.max(2, Math.floor(records.length / 2)) : 1)
    ranked.slice(0, sampleCount).forEach(record => {
      sampled.push({ record, reasons: ['Sampel acak mingguan untuk verifikasi'] })
    })
  })

  return [...flagged, ...sampled]
}
