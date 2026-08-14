export const MONTHS = [
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
]

export const MONTH_KEYS = [
  '07', '08', '09', '10', '11', '12',
  '01', '02', '03', '04', '05', '06',
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
  return {
    id: generateId('skl'),
    nama: '',
    alamat: '',
    foto: '',
    jadwal: '',
    spp: 0,
    trainerIds: [],
  }
}

export function newTrainer() {
  return {
    id: generateId('trn'),
    nama: '',
    wa: '',
    jadwal: '',
    sekolahIds: [],
    honor: 0,
  }
}

export function newSiswa(sekolahId, sekolahNama, { trial = false, trialMulai = null } = {}) {
  return {
    id: generateId('sw'),
    nama: '',
    wa: '',
    kelas: '',
    sekolahId,
    sekolahNama,
    foto: '',
    sppLunas: {},
    status: trial ? 'Trial' : 'Aktif',
    trialMulai: trial ? (trialMulai || todayISO()) : null,
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function newHonorPayment({
  trainerId,
  periode,
  nominal,
  tanggalBayar,
}) {
  return {
    id: generateId('pay'),
    trainerId,
    periode,
    nominal: Number(nominal),
    tanggalBayar,
  }
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
  foto = '',
  konfirmasiTrainer = null,
  lastEditedAt = null,
}) {
  return {
    id: id || `${tanggal}_${sekolahId}_${trainerId}`,
    tanggal,
    periode: periodeFromDate(tanggal),
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
    foto,
    konfirmasiTrainer,
    lastEditedAt,
  }
}

// ============================================
// ACADEMIC YEAR ENGINE
// ============================================

/**
 * Konversi bulan (1-12) + tahun ajaran awal (A)
 * → tahun kalender sesungguhnya.
 *
 * Juli-Desember → tahun A
 * Januari-Juni → tahun A+1
 */
export function calYear(monthNum, academicStartYear) {
  return monthNum >= CALENDAR_YEAR_BOUNDARY
    ? academicStartYear
    : academicStartYear + 1
}

export function periodeKey(monthNum, academicStartYear) {
  const year = calYear(monthNum, academicStartYear)
  return `${year}-${String(monthNum).padStart(2, '0')}`
}

export function periodeFromDate(tanggal) {
  return tanggal.slice(0, 7)
}

export function academicYearLabel(A) {
  return `${A}/${A + 1}`
}

export function defaultAcademicYear() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1

  return m >= CALENDAR_YEAR_BOUNDARY ? y : y - 1
}

export function defaultMonth() {
  return new Date().getMonth() + 1
}

export function monthLabel(monthKeyStr) {
  const idx = MONTH_KEYS.indexOf(monthKeyStr)
  return idx >= 0 ? MONTHS[idx] : monthKeyStr
}