import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// G2 — trainer siswa scope follows penugasanPengajar (H3).
//
// Violated invariant: trainer `sekolah` visibility already ORs
// `trainerHasAnyActiveAssignmentToSekolahClient()` (store.js), but the
// trainer `siswa` case checks only legacy `trainer.sekolahIds`. A
// trainer linked to a school solely via penugasanPengajar (empty
// sekolahIds) therefore sees zero students client-side even though
// the server authorizes those rows via assignment
// (server/auth/authorize.php trainerOwnsRecord `siswa` branch).
// Mirrors the store-cache-isolation.test.js identity-mock harness.

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

function seedAssignmentOnlyTrainer() {
  // Own record: no legacy school links at all.
  // Assignment lives on the instructor's record with this trainer as
  // asisten — the same cross-record shape TrainerAttendanceForm scans.
  localStorage.setItem('afterschola_v4_trainer', JSON.stringify([
    { id: 'trn-self', nama: 'Asisten Sim', sekolahIds: [], penugasanPengajar: [] },
    {
      id: 'trn-ins',
      nama: 'Instruktur Sim',
      sekolahIds: ['sch-A'],
      penugasanPengajar: [
        {
          sekolahId: 'sch-A',
          trainerId: 'trn-ins',
          asistenId: 'trn-self',
          aktif: true,
          periodeMulai: '2026-01-01',
          periodeSelesai: null,
        },
      ],
    },
  ]))
  localStorage.setItem('afterschola_v4_siswa', JSON.stringify([
    { id: 'sw-1', nama: 'Siswa A', sekolahId: 'sch-A' },
    { id: 'sw-2', nama: 'Siswa B', sekolahId: 'sch-B' },
  ]))
}

const trainerIdentity = {
  id: 'usr-self',
  role: 'trainer',
  cabangId: null,
  trainerId: 'trn-self',
  active: true,
  mustChangePassword: false,
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

describe('G2 trainer siswa scope follows penugasanPengajar', () => {
  it('assignment-only trainer (empty sekolahIds) sees the assigned school students', async () => {
    seedAssignmentOnlyTrainer()
    setIdentity(trainerIdentity)
    const store = await freshStore()
    expect(store.readCached('siswa').map(s => s.id)).toEqual(['sw-1'])
  })

  it('trainer with no assignment to a school still sees none of its students', async () => {
    seedAssignmentOnlyTrainer()
    setIdentity(trainerIdentity)
    const store = await freshStore()
    expect(store.readCached('siswa').map(s => s.id)).not.toContain('sw-2')
  })
})
