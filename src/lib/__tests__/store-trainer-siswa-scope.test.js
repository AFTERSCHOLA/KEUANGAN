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

  it('G3a: assignment-only trainer sees own legacy absensi rows for the assigned school', async () => {
    seedAssignmentOnlyTrainer()
    localStorage.setItem('afterschola_v4_absensi', JSON.stringify([
      { id: 'abs-1', sekolahId: 'sch-A', trainerId: 'trn-self', periode: '2026-09', tanggal: '2026-09-10' },
      { id: 'abs-2', sekolahId: 'sch-B', trainerId: 'trn-self', periode: '2026-09', tanggal: '2026-09-10' },
      { id: 'abs-3', sekolahId: 'sch-A', trainerId: 'trn-other', periode: '2026-09', tanggal: '2026-09-10' },
    ]))
    setIdentity(trainerIdentity)
    const store = await freshStore()
    // Own row for the assigned school: visible. Own row for the
    // unassigned school: still hidden. Another trainer's row: hidden.
    expect(store.readCached('absensi').map(a => a.id)).toEqual(['abs-1'])
  })

  it('G3b: assignment-only trainer sees sppPayments rows for the assigned school', async () => {
    seedAssignmentOnlyTrainer()
    localStorage.setItem('afterschola_v4_sppPayments', JSON.stringify([
      { id: 'spp-1', siswaId: 'sw-1', sekolahId: 'sch-A', periode: '2026-09', nominal: 150000 },
      { id: 'spp-2', siswaId: 'sw-2', sekolahId: 'sch-B', periode: '2026-09', nominal: 150000 },
    ]))
    setIdentity(trainerIdentity)
    const store = await freshStore()
    expect(store.readCached('sppPayments').map(p => p.id)).toEqual(['spp-1'])
  })

  it('T2.A.1 cross-record wipe: read(siswa) trusts server scope after read(trainer) own-only overwrite', async () => {
    // Instructor-hosted asistenIds link (cross-record shape): the
    // assignment lives on trn-ins, not on the viewer's own record.
    // Server authorize.php:153-155 returns own-record-only for
    // entity=trainer, but server-filters entity=siswa via DB
    // assignments — the client must not re-filter that remote list
    // against its freshly-wiped local trainer cache (F-T2-1/D-T2-1).
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
            asistenId: null,
            asistenIds: ['trn-self'],
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
    setIdentity(trainerIdentity)
    const store = await freshStore()
    // Sanity: pre-sync client scope resolves the cross-record link.
    expect(store.readCached('siswa').map(s => s.id)).toEqual(['sw-1'])
    globalThis.fetch = async (url) => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => {
        const u = String(url)
        // Server own-only scope for trainer (authorize.php:153-155).
        if (u.includes('entity=trainer')) {
          return [{ id: 'trn-self', nama: 'Asisten Sim', sekolahIds: [], penugasanPengajar: [] }]
        }
        // Server-filtered siswa: DB assignment scope keeps sch-A row.
        if (u.includes('entity=siswa')) {
          return [{ id: 'sw-1', nama: 'Siswa A', sekolahId: 'sch-A' }]
        }
        return []
      },
    })
    await store.read('trainer')
    const siswa = await store.read('siswa')
    expect(siswa.map(s => s.id)).toEqual(['sw-1'])
  })

  it('T2.A.1 hydrateServerData fetches trainer before the remaining entities', async () => {
    setIdentity(trainerIdentity)
    const store = await freshStore()
    const order = []
    globalThis.fetch = async (url) => {
      order.push(String(url))
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => [],
      }
    }
    await store.hydrateServerData()
    expect(order.length).toBeGreaterThan(0)
    expect(order[0]).toContain('entity=trainer')
  })

  it('DC.C.1 union: trainer in asistenIds[1] only sees the assigned school students', async () => {
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
            asistenId: null,
            asistenIds: ['trn-self'],
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
    setIdentity(trainerIdentity)
    const store = await freshStore()
    expect(store.readCached('siswa').map(s => s.id)).toEqual(['sw-1'])
    expect(store.trainerHasAnyActiveAssignmentToSekolahClient('trn-self', 'sch-A')).toBe(true)
  })
})
