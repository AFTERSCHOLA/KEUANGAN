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
