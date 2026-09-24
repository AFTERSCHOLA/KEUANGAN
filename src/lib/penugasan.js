import { generateId, localDateString } from './constants.js'
import { formatJadwalList } from './format.js'

// PG.A.1 (F-PG1; D-PG1, D-PG2, D-PG3) — pure assignment constructors.
// No store/API access here: the manager UI composes these, then persists
// via the existing trainer.php update path (full-array replace).
// Shape mirrors server/validation/entities.php:126-199 + the seed in
// tests/trainer-attendance-form.spec.js:98-107.
// PS.A.1 (F-PS2/F-PS3; D-PS2/D-PS3/D-PS5) — nullable slot scope.
// hari/jamMulai/jamSelesai filter which school slots this assignment covers;
// null = unscoped (all slots, legacy behavior). School jadwalList stays the
// sole owner of time definitions (D-PS3); the assignment only filters.
export const PENUGASAN_HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function newPenugasanRow({
  sekolahId = '',
  trainerId = '',
  asistenId = null,
  cabangId = null,
  periodeMulai = localDateString(),
  periodeSelesai = null,
  aktif = true,
  hari = null,
  jamMulai = null,
  jamSelesai = null,
} = {}) {
  return {
    id: generateId('pgs'),
    sekolahId,
    trainerId,
    asistenId: asistenId || null,
    cabangId: cabangId || null,
    periodeMulai,
    periodeSelesai: periodeSelesai || null,
    aktif,
    hari: hari || null,
    jamMulai: jamMulai || null,
    jamSelesai: jamSelesai || null,
  }
}

// Returns an Indonesian error string, or null when the row is submittable.
// Mirrors the server gates the UI must satisfy before writeRemote:
// sekolahId + trainerId required (entities.php:136-153), dates ordered,
// and the authorize date predicate needs a non-empty periodeMulai.
// Slot triple (PS.A.1; D-PS2/D-PS3/D-PS5): missing keys read as null
// (unscoped, legacy rows stay valid); hari null forces times null; when set,
// the triple must match the picked school's jadwalList vocabulary.
export function validateRowDates({ sekolahId, trainerId, periodeMulai, periodeSelesai, hari, jamMulai, jamSelesai, sekolahJadwalList } = {}) {
  if (!sekolahId || typeof sekolahId !== 'string' || !sekolahId.trim()) {
    return 'Sekolah wajib dipilih.'
  }
  if (!trainerId || typeof trainerId !== 'string' || !trainerId.trim()) {
    return 'Instruktur wajib dipilih.'
  }
  if (!periodeMulai || typeof periodeMulai !== 'string' || !periodeMulai.trim()) {
    return 'Tanggal mulai wajib diisi.'
  }
  if (periodeSelesai != null && String(periodeSelesai).trim() !== '' && String(periodeSelesai) < String(periodeMulai)) {
    return 'Tanggal selesai harus setelah tanggal mulai.'
  }
  const hariNorm = hari || null
  const jamMulaiNorm = jamMulai || null
  const jamSelesaiNorm = jamSelesai || null
  if (hariNorm == null) {
    if (jamMulaiNorm != null || jamSelesaiNorm != null) {
      return 'Hari, jam mulai, dan jam selesai harus merujuk pada jadwal sekolah yang dipilih.'
    }
    return null
  }
  if (!PENUGASAN_HARI.includes(hariNorm)) {
    return 'Hari, jam mulai, dan jam selesai harus merujuk pada jadwal sekolah yang dipilih.'
  }
  if ((jamMulaiNorm == null) !== (jamSelesaiNorm == null)) {
    return 'Hari, jam mulai, dan jam selesai harus merujuk pada jadwal sekolah yang dipilih.'
  }
  if (jamMulaiNorm == null && jamSelesaiNorm == null) {
    if (Array.isArray(sekolahJadwalList) && !(sekolahJadwalList || []).some(e => e && e.dayOfWeek === hariNorm)) {
      return 'Hari, jam mulai, dan jam selesai harus merujuk pada jadwal sekolah yang dipilih.'
    }
    return null
  }
  if (!TIME_RE.test(String(jamMulaiNorm)) || !TIME_RE.test(String(jamSelesaiNorm))) {
    return 'Hari, jam mulai, dan jam selesai harus merujuk pada jadwal sekolah yang dipilih.'
  }
  if (String(jamSelesaiNorm) <= String(jamMulaiNorm)) {
    return 'Jam selesai harus setelah jam mulai.'
  }
  if (Array.isArray(sekolahJadwalList)) {
    const match = (sekolahJadwalList || []).some(e => e && e.dayOfWeek === hariNorm && e.time === jamMulaiNorm && (e.endTime || '') === jamSelesaiNorm)
    if (!match) {
      return 'Hari, jam mulai, dan jam selesai harus merujuk pada jadwal sekolah yang dipilih.'
    }
  }
  return null
}

// Day names match TrainerDashboard.jsx DAY_NAMES (user-local calendar).
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

// Local parse only — never new Date("YYYY-MM-DD") (UTC-shift trap,
// TrainerDashboard.jsx:38-45). Returns '' for malformed input.
export function dayNameForTanggal(tanggal) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(tanggal || ''))
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return ''
  return DAY_NAMES[d.getDay()]
}

// PG.B.1 (F-PG2; D-PG4, D-PG5) — pure daily join: one row per
// (assignment valid that date × school slot matching that weekday).
// Date predicate mirrors trainerHasActiveAssignmentClient() (store.js)
// and trainerHasActiveAssignment() (authorize.php); weekday match mirrors
// scheduleIncludesToday() (TrainerDashboard.jsx). Schools with no slot
// that weekday produce zero rows (D-PG4). Deterministic order:
// sekolahNama → waktu → trainerId (CSV equality depends on it).
export function buildDailyTimetable({ trainers = [], sekolah = [], tanggal = '' } = {}) {
  const hari = dayNameForTanggal(tanggal)
  if (!hari) return []
  const schoolById = new Map((sekolah || []).map(s => [s && s.id, s]))
  const out = []
  ;(trainers || []).forEach(t => {
    const assignments = Array.isArray(t && t.penugasanPengajar) ? t.penugasanPengajar : []
    assignments.forEach(a => {
      if (!a || typeof a !== 'object' || !a.sekolahId) return
      if (a.aktif !== true) return
      if (!a.periodeMulai || typeof a.periodeMulai !== 'string' || tanggal < a.periodeMulai) return
      if (a.periodeSelesai != null && String(a.periodeSelesai).trim() !== '' && tanggal > String(a.periodeSelesai)) return
      const sch = schoolById.get(a.sekolahId)
      if (!sch) return
      const slots = (sch.jadwalList || []).filter(e => e && e.dayOfWeek === hari)
      slots.forEach(slot => {
        out.push({
          assignmentId: a.id || null,
          sekolahId: sch.id,
          sekolahNama: sch.nama || '',
          trainerId: a.trainerId || null,
          asistenId: a.asistenId || null,
          hari,
          waktu: formatJadwalList([slot]),
        })
      })
    })
  })
  return out.sort((x, y) =>
    String(x.sekolahNama).localeCompare(String(y.sekolahNama), 'id')
    || String(x.waktu).localeCompare(String(y.waktu), 'id')
    || String(x.trainerId || '').localeCompare(String(y.trainerId || ''), 'id'))
}
