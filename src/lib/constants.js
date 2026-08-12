export const MONTHS = [
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
]

export const MONTH_KEYS = [
  '07',
  '08',
  '09',
  '10',
  '11',
  '12',
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
]

export const CALENDAR_YEAR_BOUNDARY = 7

export const monthsUntilJune = [
  'Agustus', 'September', 'Oktober', 'November', 'Desember',
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
]

export function generateId(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
}

export function newSekolah() {
  return { id: generateId('skl'), nama: '', alamat: '', foto: '', jadwal: '', spp: 0, trainerIds: [] }
}

export function newTrainer() {
  return { id: generateId('trn'), nama: '', wa: '', jadwal: '', sekolahIds: [], honor: 0 }
}

export function newSiswa(sekolahId, sekolahNama) {
  return { id: generateId('sw'), nama: '', wa: '', kelas: '', sekolahId, sekolahNama, foto: '', sppLunas: {} }
}

export function newHonorPayment({ trainerId, periode, nominal, tanggalBayar }) {
  return { id: generateId('hp'), trainerId, periode, nominal, tanggalBayar }
}

export function newAbsensi({
  id,
  tanggal,
  sekolahId,
  trainerId,
  trainerNama,
  trainerStatus = 'Hadir',
  siswaList = [],
  asistenId = null,
  asistenNama = null,
  dokumentasi = [],
  catatan = '',
  statusVerifikasi = null,
  sesiKe = 1,
}) {
  return {
    id: id || generateId('abs'),
    tanggal,
    periode: tanggal.slice(0, 7),
    sekolahId,
    trainerId,
    trainerNama,
    trainerStatus,
    siswaList,
    asistenId,
    asistenNama,
    dokumentasi,
    catatan,
    statusVerifikasi,
    sesiKe,
  }
}

// ============================================
// ACADEMIC YEAR ENGINE (M1.1)
// ============================================

/**
 * Konversi bulan (1-12) + tahun ajaran awal (A) → tahun kalender sesungguhnya.
 * Juli-Desember → tahun A. Januari-Juni → tahun A+1.
 */
export function calYear(monthNum, academicStartYear) {
  return monthNum >= CALENDAR_YEAR_BOUNDARY ? academicStartYear : academicStartYear + 1
}

/** Bikin key "YYYY-MM" dari bulan (1-12) + tahun ajaran awal */
export function periodeKey(monthNum, academicStartYear) {
  const year = calYear(monthNum, academicStartYear)
  return `${year}-${String(monthNum).padStart(2, '0')}`
}

/** Ambil key "YYYY-MM" langsung dari tanggal "YYYY-MM-DD" — TIDAK ADA parsing nama bulan */
export function periodeFromDate(tanggal) {
  return tanggal.slice(0, 7)
}

/** Label tampilan tahun ajaran, misal 2026 → "2026/2027" */
export function academicYearLabel(A) {
  return `${A}/${A + 1}`
}

/** Tahun ajaran default = tahun ajaran yang sedang berjalan hari ini */
export function defaultAcademicYear() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  return m >= CALENDAR_YEAR_BOUNDARY ? y : y - 1
}

/** Bulan default = bulan berjalan hari ini (1-12) */
export function defaultMonth() {
  return new Date().getMonth() + 1
}
