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
  // DC.C.2 (F-DC3; D-CS4/D-DC3) — additive 2nd-assistant key (max 2,
  // server-gated in entities.php); legacy asistenId stays position 0.
  asistenIds = null,
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
    asistenIds: Array.isArray(asistenIds) ? asistenIds.filter(id => typeof id === 'string' && id) : null,
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

// BUG7 (F-PG5; D-PG9) — intra-payload double-booking guard (same-host
// reject; server re-checks authoritatively in trainer.php via
// validateNoOverlappingAssignments). Mirrors that predicate exactly:
// exact triple equality, unscoped fans out over the same school,
// cover-linked + same-id pairs skipped, inactive and non-intersecting
// ranges never block. Pinned copy shared with the server gate.
export const PENUGASAN_OVERLAP_ERROR = 'Penugasan ganda: sekolah dan waktu yang sama sudah terisi pada rentang tanggal ini.'

function penugasanSlotKey(a) {
  const norm = v => (v === '' ? null : (v ?? null))
  return JSON.stringify([norm(a?.hari), norm(a?.jamMulai), norm(a?.jamSelesai)])
}

const PENUGASAN_UNSCOPED_KEY = JSON.stringify([null, null, null])

function penugasanRangeEnd(v) {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? '9999-12-31' : s
}

// Returns the first overlapping [a, b] pair, or null when the payload
// holds no double booking.
export function findOverlappingPair(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  for (let i = 0; i < list.length; i++) {
    const a = list[i]
    if (!a || typeof a !== 'object') continue
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]
      if (!b || typeof b !== 'object') continue
      if (typeof a.id === 'string' && a.id !== '' && a.id === b.id) continue
      if ((typeof a.coverOf === 'string' && a.coverOf !== '' && a.coverOf === b.id)
        || (typeof b.coverOf === 'string' && b.coverOf !== '' && b.coverOf === a.id)) continue
      if (a.aktif !== true || b.aktif !== true) continue
      if (typeof a.sekolahId !== 'string' || a.sekolahId === '' || a.sekolahId !== b.sekolahId) continue
      const start = [a.periodeMulai || '', b.periodeMulai || ''].sort()[1]
      const endA = penugasanRangeEnd(a.periodeSelesai)
      const endB = penugasanRangeEnd(b.periodeSelesai)
      if (start > (endA < endB ? endA : endB)) continue
      const keyA = penugasanSlotKey(a)
      const keyB = penugasanSlotKey(b)
      if (keyA !== keyB && keyA !== PENUGASAN_UNSCOPED_KEY && keyB !== PENUGASAN_UNSCOPED_KEY) continue
      return [a, b]
    }
  }
  return null
}

// DB.A.2 (F-DB1/F-DB2; D-DB1, D-DB2, D-DB4, D-DB5) — cross-host occupant
// pre-check (client mirror of findCrossHostConflict() in
// server/lib/assignments.php; the server stays authoritative, taste #61).
// Compares the about-to-be-saved rows of ONE host (nextRows) against
// every other cached host's rows (otherHostsRows). Same predicate as the
// server scan: same sekolahId + both aktif + intersecting ranges (open
// end = 9999-12-31) + same slot scope (exact triple; unscoped fans out)
// + occupant sets intersect (trainerId ∪ asistenId ∪ asistenIds[]).
// Same-id pairs (edit path) and cover-linked pairs (either direction)
// never block; rows with no attributable occupant never block.
// Returns the first conflicting [mine, theirs] pair, or null.
function crossHostOccupants(r) {
  const out = []
  for (const single of [r?.trainerId, r?.asistenId]) {
    if (typeof single === 'string' && single.trim() !== '') out.push(single)
  }
  if (Array.isArray(r?.asistenIds)) {
    for (const id of r.asistenIds) {
      if (typeof id === 'string' && id.trim() !== '') out.push(id)
    }
  }
  return [...new Set(out)]
}

export function findCrossHostPair(nextRows = [], otherHostsRows = []) {
  const mine = Array.isArray(nextRows) ? nextRows : []
  const theirs = Array.isArray(otherHostsRows) ? otherHostsRows : []
  for (const a of mine) {
    if (!a || typeof a !== 'object') continue
    for (const b of theirs) {
      if (!b || typeof b !== 'object') continue
      if (typeof a.id === 'string' && a.id !== '' && a.id === b.id) continue
      if ((typeof a.coverOf === 'string' && a.coverOf !== '' && a.coverOf === b.id)
        || (typeof b.coverOf === 'string' && b.coverOf !== '' && b.coverOf === a.id)) continue
      if (a.aktif !== true || b.aktif !== true) continue
      if (typeof a.sekolahId !== 'string' || a.sekolahId === '' || a.sekolahId !== b.sekolahId) continue
      const start = [a.periodeMulai || '', b.periodeMulai || ''].sort()[1]
      const endA = penugasanRangeEnd(a.periodeSelesai)
      const endB = penugasanRangeEnd(b.periodeSelesai)
      if (start > (endA < endB ? endA : endB)) continue
      const keyA = penugasanSlotKey(a)
      const keyB = penugasanSlotKey(b)
      if (keyA !== keyB && keyA !== PENUGASAN_UNSCOPED_KEY && keyB !== PENUGASAN_UNSCOPED_KEY) continue
      const occA = crossHostOccupants(a)
      if (occA.length === 0) continue
      const occB = new Set(crossHostOccupants(b))
      if (occB.size === 0) continue
      if (!occA.some(id => occB.has(id))) continue
      return [a, b]
    }
  }
  return null
}

// BUG8 (D-BUG8) — cover marks for timetable rows (display-only).
// A row carrying coverOf is the substitute (Pengganti); an origin row
// whose id is some same-school+same-waktu row's coverOf is covered
// (Digantikan oleh …). Pure so views and the CSV export share one owner.
//
// Returns { subsByOrigin: Map<assignmentId, string[] trainerIds>,
// isCoverRow(row): bool, coveredBy(row): string[] }.
export function coverMarksForRows(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  const subsByOrigin = new Map()
  list.forEach(r => {
    if (!r || typeof r !== 'object' || !r.coverOf) return
    const peers = list.filter(o => o && typeof o === 'object'
      && o.assignmentId === r.coverOf
      && o.sekolahId === r.sekolahId
      && o.waktu === r.waktu)
    if (peers.length === 0) return
    if (!subsByOrigin.has(r.coverOf)) subsByOrigin.set(r.coverOf, [])
    const names = subsByOrigin.get(r.coverOf)
    if (r.trainerId && !names.includes(r.trainerId)) names.push(r.trainerId)
  })
  return {
    subsByOrigin,
    isCoverRow: r => !!(r && typeof r === 'object' && r.coverOf),
    coveredBy: r => (r && typeof r === 'object' && r.assignmentId && subsByOrigin.get(r.assignmentId)) || [],
  }
}

// DC.C.1 (F-DC3; D-CS4/D-DC3) — union membership: legacy asistenId
// counts as position 0, asistenIds adds positions 1-2. Mirrors the server
// union in authorize.php trainerHasActiveAssignment() so client scope
// checks and the gate agree on who an assignment covers.
export function penugasanInvolvesTrainer(assignment, trainerId) {
  if (!assignment || typeof trainerId !== 'string' || trainerId === '') return false
  if (assignment.trainerId === trainerId) return true
  if (assignment.asistenId === trainerId) return true
  const extra = assignment.asistenIds
  return Array.isArray(extra) && extra.includes(trainerId)
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
      // BUG3 (D-PS4): the slot predicate gains the assignment scope —
      // unscoped (null triple) fans out over every slot that weekday, a
      // scoped assignment renders only its exact slots. Exact string
      // equality only (YAGNI, no interval matching).
      const slots = (sch.jadwalList || []).filter(e => e && e.dayOfWeek === hari
        && (!a.hari || e.dayOfWeek === a.hari)
        && (!a.jamMulai || e.time === a.jamMulai)
        && (!a.jamSelesai || e.endTime === a.jamSelesai))
      slots.forEach(slot => {
        out.push({
          assignmentId: a.id || null,
          // BUG8 (D-BUG8): cover link rides along so views can label
          // substitute rows Pengganti and mark covered origins Digantikan.
          coverOf: a.coverOf || null,
          sekolahId: sch.id,
          sekolahNama: sch.nama || '',
          trainerId: a.trainerId || null,
          asistenId: a.asistenId || null,
          // DC.C.2 — carry the 2nd-assistant key so the timetable and
          // its export mirror the manager table (union display).
          asistenIds: Array.isArray(a.asistenIds) ? [...a.asistenIds] : null,
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
