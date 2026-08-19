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

// M7.1.2 — branch-prefixed IDs. cabangKode is optional so every existing
// call site keeps working unchanged (old shape: prefix-timestamp-random);
// passing a kode produces the new shape: prefix-KODE-timestamp-random.
export function generateId(prefix, cabangKode) {
  const branch = cabangKode ? `${cabangKode}-` : ''
  return `${prefix}-${branch}${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ============================================
// M7.1 — CABANG (branch) ENTITY
// ============================================

export function newCabang({ nama = '', kode = '' } = {}) {
  return {
    id: generateId('cbg'),
    nama,
    kode,
  }
}

// Seed branch used before any cabang has been created via BranchManager
// (M7.1.3), and as the fallback target for newSekolah()/migrateIds() below.
export const DEFAULT_CABANG_KODE = 'PST'

export function defaultCabang() {
  return {
    id: `cbg-${DEFAULT_CABANG_KODE}-default`,
    nama: 'Cabang Pusat',
    kode: DEFAULT_CABANG_KODE,
  }
}

export function newSekolah(cabangId) {
  return {
    id: generateId('skl'),
    nama: '',
    alamat: '',
    foto: '',
    jadwal: '',
    spp: 0,
    trainerIds: [],
    // M7.1.1 — required field; falls back to the seed branch when the
    // caller (SekolahForm) doesn't yet pass a selected cabangId.
    cabangId: cabangId || defaultCabang().id,
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

export function newSiswa(sekolahId, sekolahNama) {
  const siswa = {
    id: generateId('sw'),
    nama: '',
    wa: '',
    kelas: '',
    sekolahId,
    sekolahNama,
    foto: '',
    status: 'Aktif',
    trialMulai: null,
    // Derived from sppPayments ledger — never edit directly
    // M6.1.2 — Recompute lewat computeSppLunas() di lib/sppPayments.js.
    // (Objek ini masih dibaca seperti biasa di finance.js/tunggakan.js;
    // yang berubah cuma cara MENULISNYA — tidak lagi manual toggle.)
    sppLunas: {},
  }

  // Dev-only guard: peringatkan kalau ada yang nulis ulang sppLunas
  // langsung di objek baru (misal lewat checkbox lama yang belum dicabut).
  // Catatan: proteksi ini hilang begitu objek di-serialize ke localStorage
  // dan dibaca ulang (JSON.parse menghasilkan objek polos, bukan Proxy) —
  // ini cuma jaring pengaman dev-time, bukan enforcement permanen.
  if (import.meta.env?.MODE !== 'production') {
    return new Proxy(siswa, {
      set(target, prop, value) {
        if (prop === 'sppLunas') {
          console.warn(
            '[siswa.sppLunas] Field ini derived dari sppPayments ledger — jangan diedit langsung. ' +
            'Tulis lewat SppPaymentModal / computeSppLunas() (M6.1.3).'
          )
        }
        target[prop] = value
        return true
      },
    })
  }

  return siswa
}

// ============================================
// M7.1.2 — ONE-TIME ID MIGRATION
// ============================================
// Rewrites existing sekolah/trainer/siswa/absensi IDs to the branch-prefixed
// shape so pre-Phase-C records line up with new ones. Idempotent: an ID
// already carrying a recognized cabang kode as its 2nd segment is skipped.
// Takes the store's { read, write, getKeys } as arguments (rather than
// importing lib/store.js) to avoid a circular import between the two files,
// and so the caller — App.jsx bootstrap, per M7.1.2 — controls exactly when
// migration runs.

function isAlreadyBranched(id, knownKodes) {
  const parts = id.split('-')
  return parts.length >= 4 && knownKodes.has(parts[1])
}

function resolveCabangKode(sekolahId, sekolahById, cabangById, fallbackKode) {
  const sekolah = sekolahById.get(sekolahId)
  const cabang = sekolah && sekolah.cabangId ? cabangById.get(sekolah.cabangId) : null
  return (cabang && cabang.kode) || fallbackKode
}

export function migrateIds({ read, write, getKeys }) {
  const keys = getKeys()
  if (!keys.cabang) {
    throw new Error('migrateIds: store.getKeys() belum punya key "cabang" — tambahkan dulu (M7.1.2).')
  }

  let cabangList = read('cabang')
  if (cabangList.length === 0) {
    cabangList = [defaultCabang()]
    write('cabang', cabangList)
  }
  const cabangById = new Map(cabangList.map(c => [c.id, c]))
  const knownKodes = new Set(cabangList.map(c => c.kode))
  const fallback = cabangList[0]

  // 1) Every sekolah needs a cabangId before branch codes can resolve.
  const sekolahList = read('sekolah')
  let sekolahDirty = false
  const sekolahWithCabang = sekolahList.map(s => {
    if (s.cabangId) return s
    sekolahDirty = true
    return { ...s, cabangId: fallback.id }
  })
  if (sekolahDirty) write('sekolah', sekolahWithCabang)

  // 2) Re-ID sekolah itself (branch is its own cabangId).
  const sekolahIdMap = new Map()
  const migratedSekolah = sekolahWithCabang.map(s => {
    if (isAlreadyBranched(s.id, knownKodes)) return s
    const kode = (cabangById.get(s.cabangId) || fallback).kode
    const newId = generateId('skl', kode)
    sekolahIdMap.set(s.id, newId)
    return { ...s, id: newId }
  })
  write('sekolah', migratedSekolah)
  const sekolahById = new Map(migratedSekolah.map(s => [s.id, s]))

  // 3) Re-ID collections that join to sekolah, remapping any sekolahId
  //    references that changed in step 2 along the way.
  const remapSekolahRefs = (sekolahId) => sekolahIdMap.get(sekolahId) || sekolahId

  const migratedTrainer = read('trainer').map(t => {
    const sekolahIds = (t.sekolahIds || []).map(remapSekolahRefs)
    if (isAlreadyBranched(t.id, knownKodes)) return { ...t, sekolahIds }
    const kode = resolveCabangKode(sekolahIds[0], sekolahById, cabangById, fallback.kode)
    return { ...t, id: generateId('trn', kode), sekolahIds }
  })
  write('trainer', migratedTrainer)

  const migratedSiswa = read('siswa').map(s => {
    const sekolahId = remapSekolahRefs(s.sekolahId)
    if (isAlreadyBranched(s.id, knownKodes)) return { ...s, sekolahId }
    const kode = resolveCabangKode(sekolahId, sekolahById, cabangById, fallback.kode)
    return { ...s, id: generateId('sw', kode), sekolahId }
  })
  write('siswa', migratedSiswa)

  // Absensi IDs are deterministic (`${tanggal}_${sekolahId}_${trainerId}`),
  // not generateId()-based, so only the embedded sekolahId reference needs
  // remapping — the ID format itself stays untouched by design (R5).
  const migratedAbsensi = read('absensi').map(a => ({
    ...a,
    sekolahId: remapSekolahRefs(a.sekolahId),
  }))
  write('absensi', migratedAbsensi)

  return {
    cabang: cabangList,
    sekolahIdMap,
    counts: {
      sekolah: migratedSekolah.length,
      trainer: migratedTrainer.length,
      siswa: migratedSiswa.length,
      absensi: migratedAbsensi.length,
    },
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

export function shiftPeriode(periode, monthsDelta) {
  const [y, m] = periode.split('-').map(Number)
  const d = new Date(y, m - 1 + monthsDelta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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