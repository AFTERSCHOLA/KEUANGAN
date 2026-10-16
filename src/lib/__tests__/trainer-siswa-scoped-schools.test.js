import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// TS.2 — trainer scoped-schools regression (next to
// store-trainer-siswa-scope.test.js).
//
// The trainer "Tambah Siswa Baru" dropdown lists only the assigned-schools
// union: legacy trainer.sekolahIds + server snapshot + aktif
// penugasanPengajar (trainer or asisten position, penugasanInvolvesTrainer
// parity). readCached('sekolah') already IS that union for trainers
// (store.js isWithinScope 'sekolah'), so StudentList passes the prop
// through untouched — this unit pins the data foundation the UI branches
// on: union membership, the empty-list (disabled button + hint) branch,
// and the admin default (sekolah[0]) staying untouched.
// Mirrors the store-trainer-siswa-scope.test.js identity-mock harness.

const authModulePath = '../auth.js'
const storeModulePath = '../store.js'

function setIdentity(identity) {
  vi.doMock(authModulePath, () => ({
    getSafeIdentityContext: () => identity,
  }))
}

async function freshStore() {
  vi.resetModules()
  return import(storeModulePath)
}

const trainerIdentity = {
  id: 'usr-self',
  role: 'trainer',
  cabangId: null,
  trainerId: 'trn-self',
  active: true,
  mustChangePassword: false,
}

const superadminIdentity = {
  id: 'usr-pusat',
  role: 'superadmin',
  cabangId: null,
  trainerId: null,
  active: true,
  mustChangePassword: false,
}

function seedUnionScope() {
  localStorage.setItem('afterschola_v4_sekolah', JSON.stringify([
    { id: 'sch-legacy', nama: 'Sekolah Legacy', cabangId: 'cbg-1' },
    { id: 'sch-direct', nama: 'Sekolah Asisten', cabangId: 'cbg-1' },
    { id: 'sch-assign', nama: 'Sekolah Tugas', cabangId: 'cbg-1' },
    { id: 'sch-snap', nama: 'Sekolah Snapshot', cabangId: 'cbg-1' },
    { id: 'sch-other', nama: 'Sekolah Lain', cabangId: 'cbg-2' },
  ]))
  localStorage.setItem('afterschola_v4_trainer', JSON.stringify([
    // Own record: legacy link only, no assignments hosted here.
    { id: 'trn-self', nama: 'Trainer Sim', sekolahIds: ['sch-legacy'], penugasanPengajar: [] },
    {
      id: 'trn-ins',
      nama: 'Instruktur Sim',
      sekolahIds: [],
      penugasanPengajar: [
        // Legacy asistenId position (position 0).
        {
          sekolahId: 'sch-direct',
          trainerId: 'trn-ins',
          asistenId: 'trn-self',
          aktif: true,
          periodeMulai: '2026-01-01',
          periodeSelesai: null,
        },
        // asistenIds position (positions 1-2).
        {
          sekolahId: 'sch-assign',
          trainerId: 'trn-ins',
          asistenId: null,
          asistenIds: ['trn-self'],
          aktif: true,
          periodeMulai: '2026-01-01',
          periodeSelesai: null,
        },
      ],
    },
  ]))
  // Server-scope snapshot member (T2.A.1): no legacy link, no live
  // assignment — visible via the snapshot only.
  localStorage.setItem('afterschola_v4_trainerScope', JSON.stringify({
    trainerId: 'trn-self',
    schoolIds: ['sch-snap'],
    updatedAt: Date.now(),
  }))
  localStorage.setItem('afterschola_v4_siswa', JSON.stringify([
    { id: 'sw-legacy', nama: 'Siswa Legacy', sekolahId: 'sch-legacy' },
    { id: 'sw-direct', nama: 'Siswa Asisten', sekolahId: 'sch-direct' },
    { id: 'sw-assign', nama: 'Siswa Tugas', sekolahId: 'sch-assign' },
    { id: 'sw-snap', nama: 'Siswa Snapshot', sekolahId: 'sch-snap' },
    { id: 'sw-other', nama: 'Siswa Lain', sekolahId: 'sch-other' },
  ]))
}

beforeEach(() => {
  const values = new Map()
  globalThis.localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
  globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {} }
  globalThis.fetch = vi.fn()
  vi.doUnmock(authModulePath)
})

afterEach(() => {
  vi.doUnmock(authModulePath)
  vi.resetModules()
})

describe('TS.2 trainer scoped-schools union', () => {
  it('dropdown union: legacy + asisten positions + snapshot schools visible, unassigned excluded', async () => {
    seedUnionScope()
    setIdentity(trainerIdentity)
    const store = await freshStore()
    // Seeded order preserved, unassigned school filtered out.
    expect(store.readCached('sekolah').map(s => s.id)).toEqual([
      'sch-legacy',
      'sch-direct',
      'sch-assign',
      'sch-snap',
    ])
    // Siswa read scope matches the same union (the dropdown mirrors it).
    expect(store.readCached('siswa').map(s => s.id)).toEqual([
      'sw-legacy',
      'sw-direct',
      'sw-assign',
      'sw-snap',
    ])
    // Assignment predicate agrees on both positions, denies the outsider.
    expect(store.trainerHasAnyActiveAssignmentToSekolahClient('trn-self', 'sch-assign')).toBe(true)
    expect(store.trainerHasAnyActiveAssignmentToSekolahClient('trn-self', 'sch-direct')).toBe(true)
    expect(store.trainerHasAnyActiveAssignmentToSekolahClient('trn-self', 'sch-other')).toBe(false)
  })

  it('empty-list hint branch: trainer with no assignment sees zero schools (button disabled, no submit)', async () => {
    localStorage.setItem('afterschola_v4_sekolah', JSON.stringify([
      { id: 'sch-A', nama: 'Sekolah A', cabangId: 'cbg-1' },
      { id: 'sch-B', nama: 'Sekolah B', cabangId: 'cbg-1' },
    ]))
    localStorage.setItem('afterschola_v4_trainer', JSON.stringify([
      { id: 'trn-self', nama: 'Trainer Sim', sekolahIds: [], penugasanPengajar: [] },
    ]))
    localStorage.setItem('afterschola_v4_siswa', JSON.stringify([
      { id: 'sw-1', nama: 'Siswa A', sekolahId: 'sch-A' },
    ]))
    // No snapshot seeded: no legacy link, no assignment, no snapshot.
    setIdentity(trainerIdentity)
    const store = await freshStore()
    // StudentList renders the disabled button + "Belum ada sekolah
    // penugasan" hint exactly when this list is empty; openAdd early-returns
    // on the same condition, so no submit path exists.
    expect(store.readCached('sekolah')).toEqual([])
    expect(store.readCached('siswa')).toEqual([])
  })

  it('admin default untouched: superadmin sees the full list in order (sekolah[0] default)', async () => {
    seedUnionScope()
    setIdentity(superadminIdentity)
    const store = await freshStore()
    const ids = store.readCached('sekolah').map(s => s.id)
    expect(ids).toEqual(['sch-legacy', 'sch-direct', 'sch-assign', 'sch-snap', 'sch-other'])
    // openAdd default for non-trainerScoped is unchanged: first school.
    expect(ids[0]).toBe('sch-legacy')
  })
})
