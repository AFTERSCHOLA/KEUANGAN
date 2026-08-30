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

// M7.1.2 — branch-prefixed IDs: prefix-BRANCH-Date.now-random.
export function generateId(prefix, cabangKode) {
  const branch = cabangKode ? `${String(cabangKode).trim().toUpperCase()}-` : ''
  return `${prefix}-${branch}${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function newCabang({ nama = '', kode = '' } = {}) {
  return { id: generateId('cbg'), nama, kode: String(kode).trim().toUpperCase() }
}

export const DEFAULT_CABANG_KODE = 'PST'

export function defaultCabang() {
  return { id: `cbg-${DEFAULT_CABANG_KODE}-default`, nama: 'Cabang Pusat', kode: DEFAULT_CABANG_KODE }
}

export function newSekolah(cabangId, cabangKode = DEFAULT_CABANG_KODE) {
  const branchId = cabangId || defaultCabang().id
  return {
    id: generateId('skl', cabangKode),
    nama: '',
    alamat: '',
    foto: '',
    jadwal: '',
    spp: 0,
    trainerIds: [],
    cabangId: branchId,
  }
}

export function newTrainer(cabangId, cabangKode) {
  return { id: generateId('trn', cabangKode || cabangId), nama: '', wa: '', jadwal: '', sekolahIds: [], honor: 0, cabangId: cabangId || null }
}

export function newSiswa(sekolahId, sekolahNama, cabangKode) {
  const siswa = {
    id: generateId('sw', cabangKode),
    nama: '',
    wa: '',
    kelas: '',
    sekolahId,
    sekolahNama,
    foto: '',
    status: 'Aktif',
    trialMulai: null,
    sppLunas: {},
  }

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

function branchId(id, prefix, kode, usedIds) {
  const pattern = new RegExp(`^${prefix}-${kode}-\\d+-[a-z0-9]+$`, 'i')
  if (pattern.test(id) && !usedIds.has(id)) {
    usedIds.add(id)
    return id
  }
  let next = generateId(prefix, kode)
  while (usedIds.has(next)) next = generateId(prefix, kode)
  usedIds.add(next)
  return next
}

function mapId(map, id) {
  return map.get(id) || id
}

function unique(values) {
  return [...new Set(values)]
}

function branchForSchool(school, branchesById, fallback) {
  return branchesById.get(school?.cabangId)?.kode || fallback.kode
}

function trainerBranchCode(trainer, schoolsById, branchesById, fallback) {
  const codes = unique((trainer.sekolahIds || [])
    .map(id => branchForSchool(schoolsById.get(id), branchesById, fallback)))
    .sort()
  return codes[0] || fallback.kode
}

function assertUniqueIds(collections) {
  const seen = new Set()
  collections.flat().forEach(record => {
    if (!record.id || seen.has(record.id)) throw new Error(`migrateIds: duplicate ID ${record.id}`)
    seen.add(record.id)
  })
}

function assertReferences({ sekolah, trainer, siswa, absensi, honorPayments, sppPayments, invoices }) {
  const schools = new Set(sekolah.map(s => s.id))
  const trainers = new Set(trainer.map(t => t.id))
  const students = new Set(siswa.map(s => s.id))
  const has = (set, id, label) => {
    if (id && !set.has(id)) throw new Error(`migrateIds: missing ${label} reference ${id}`)
  }
  sekolah.forEach(s => (s.trainerIds || []).forEach(id => has(trainers, id, 'trainer')))
  trainer.forEach(t => (t.sekolahIds || []).forEach(id => has(schools, id, 'sekolah')))
  siswa.forEach(s => has(schools, s.sekolahId, 'sekolah'))
  absensi.forEach(a => {
    has(schools, a.sekolahId, 'sekolah')
    has(trainers, a.trainerId, 'trainer')
    ;(a.siswaList || []).forEach(s => has(students, s.siswaId, 'siswa'))
  })
  honorPayments.forEach(p => has(trainers, p.trainerId, 'trainer'))
  sppPayments.forEach(p => has(students, p.siswaId, 'siswa'))
  invoices.forEach(i => has(schools, i.sekolahId, 'sekolah'))
}

export function migrateIds({ read, write, getKeys, getMigrationState, setMigrationState }) {
  if (getMigrationState?.().m71BranchSchema?.completedAt) return { skipped: true }
  if (!getKeys().cabang) throw new Error('migrateIds: store.getKeys() belum punya key "cabang".')

  const cabang = read('cabang').length ? read('cabang') : [defaultCabang()]
  const fallback = cabang[0]
  const branchesById = new Map(cabang.map(c => [c.id, c]))
  const knownCodes = new Set(cabang.map(c => c.kode))
  const raw = {
    sekolah: read('sekolah'),
    trainer: read('trainer'),
    siswa: read('siswa'),
    absensi: read('absensi'),
    honorPayments: read('honorPayments'),
    sppPayments: read('sppPayments'),
    invoices: read('invoices'),
  }
  const usedIds = new Set(cabang.map(c => c.id))
  const schoolSeed = raw.sekolah.map(s => ({ ...s, cabangId: s.cabangId || fallback.id }))
  const oldSchools = new Map(schoolSeed.map(s => [s.id, s]))
  const schoolIdMap = new Map()
  const sekolah = schoolSeed.map(s => {
    const id = branchId(s.id, 'skl', branchForSchool(s, branchesById, fallback), usedIds)
    schoolIdMap.set(s.id, id)
    return { ...s, id }
  })
  const schoolsById = new Map(schoolSeed.map(s => [s.id, s]))
  const migratedSchoolsById = new Map(sekolah.map(s => [s.id, s]))

  const trainerIdMap = new Map()
  const trainer = raw.trainer.map(t => {
    const sekolahIds = unique((t.sekolahIds || []).map(id => mapId(schoolIdMap, id)))
    const id = branchId(t.id, 'trn', trainerBranchCode({ ...t, sekolahIds: t.sekolahIds || [] }, schoolsById, branchesById, fallback), usedIds)
    trainerIdMap.set(t.id, id)
    return { ...t, id, sekolahIds }
  })
  const trainersById = new Map(raw.trainer.map(t => [t.id, t]))
  const migratedTrainersById = new Map(trainer.map(t => [t.id, t]))

  const siswaIdMap = new Map()
  const siswa = raw.siswa.map(s => {
    const sekolahId = mapId(schoolIdMap, s.sekolahId)
    const id = branchId(s.id, 'sw', branchForSchool(schoolsById.get(s.sekolahId), branchesById, fallback), usedIds)
    siswaIdMap.set(s.id, id)
    return { ...s, id, sekolahId }
  })
  const studentsById = new Map(raw.siswa.map(s => [s.id, s]))

  const absensiIds = new Set()
  const absensi = raw.absensi.map((a, index) => {
    const sekolahId = mapId(schoolIdMap, a.sekolahId)
    const trainerId = mapId(trainerIdMap, a.trainerId)
    let id = `${a.tanggal}_${sekolahId}_${trainerId}`
    if (absensiIds.has(id)) id = `${id}_${a.sesiKe || index + 1}`
    absensiIds.add(id)
    return {
      ...a,
      id,
      sekolahId,
      trainerId,
      siswaList: (a.siswaList || []).map(s => ({ ...s, siswaId: mapId(siswaIdMap, s.siswaId) })),
    }
  })

  const honorPayments = raw.honorPayments.map(p => ({
    ...p,
    id: branchId(p.id, 'pay', trainerBranchCode(trainersById.get(p.trainerId) || {}, schoolsById, branchesById, fallback), usedIds),
    trainerId: mapId(trainerIdMap, p.trainerId),
  }))
  const sppPayments = raw.sppPayments.map(p => ({
    ...p,
    id: branchId(p.id, 'spp', branchForSchool(schoolsById.get(studentsById.get(p.siswaId)?.sekolahId), branchesById, fallback), usedIds),
    siswaId: mapId(siswaIdMap, p.siswaId),
  }))
  const invoices = raw.invoices.map(i => ({
    ...i,
    id: branchId(i.id, 'inv', branchForSchool(schoolsById.get(i.sekolahId), branchesById, fallback), usedIds),
    sekolahId: mapId(schoolIdMap, i.sekolahId),
  }))

  const remappedSchools = sekolah.map(s => ({
    ...s,
    trainerIds: unique((s.trainerIds || []).map(id => mapId(trainerIdMap, id))),
  }))
  assertUniqueIds([remappedSchools, trainer, siswa, absensi, honorPayments, sppPayments, invoices])
  assertReferences({ sekolah: remappedSchools, trainer, siswa, absensi, honorPayments, sppPayments, invoices })

  write('cabang', cabang)
  write('sekolah', remappedSchools)
  write('trainer', trainer)
  write('siswa', siswa)
  write('absensi', absensi)
  write('honorPayments', honorPayments)
  write('sppPayments', sppPayments)
  write('invoices', invoices)
  setMigrationState?.({ ...(getMigrationState?.() || {}), m71BranchSchema: { completedAt: new Date().toISOString(), version: 1 } })

  return { skipped: false, counts: Object.fromEntries(Object.entries(raw).map(([key, records]) => [key, records.length])) }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function newHonorPayment({
  trainerId,
  periode,
  nominal,
  tanggalBayar,
  cabangKode,
}) {
  return {
    id: generateId('pay', cabangKode),
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