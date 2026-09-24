import { generateId, localDateString } from './constants.js'

// PG.A.1 (F-PG1; D-PG1, D-PG2, D-PG3) — pure assignment constructors.
// No store/API access here: the manager UI composes these, then persists
// via the existing trainer.php update path (full-array replace).
// Shape mirrors server/validation/entities.php:126-199 + the seed in
// tests/trainer-attendance-form.spec.js:98-107.
export function newPenugasanRow({
  sekolahId = '',
  trainerId = '',
  asistenId = null,
  cabangId = null,
  periodeMulai = localDateString(),
  periodeSelesai = null,
  aktif = true,
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
  }
}

// Returns an Indonesian error string, or null when the row is submittable.
// Mirrors the server gates the UI must satisfy before writeRemote:
// sekolahId + trainerId required (entities.php:136-153), dates ordered,
// and the authorize date predicate needs a non-empty periodeMulai.
export function validateRowDates({ sekolahId, trainerId, periodeMulai, periodeSelesai } = {}) {
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
  return null
}
