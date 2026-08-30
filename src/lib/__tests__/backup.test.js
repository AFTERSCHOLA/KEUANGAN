import { beforeEach, describe, expect, it, vi } from 'vitest'

// M-AUTH.3: the store now denies readCached()/write() to anonymous
// callers. Backup export/restore are superadmin-only operations in the
// shell, so the tests set a superadmin identity via the auth module
// stub. Production code never calls these functions while anonymous;
// backup access is already gated by role per the audit findings.
const superadminIdentity = { id: 'usr-pusat', role: 'superadmin', cabangId: null, trainerId: null, active: true, mustChangePassword: false }

vi.mock('../auth.js', () => ({
  getSafeIdentityContext: () => globalThis.__BACKUP_IDENTITY__ || null,
}))

import { getKeys } from '../store.js'
import {
  BACKUP_VERSION,
  exportBackup,
  readBackupFile,
  restoreBackup,
  validateBackupShape,
} from '../backup.js'

const collections = ['cabang', 'sekolah', 'trainer', 'siswa', 'absensi', 'honorPayments', 'sppPayments', 'invoices']

function validData() {
  return {
    cabang: [{ id: 'branch-1', nama: 'Pusat', kode: 'PST' }],
    sekolah: [{ id: 'school-1', nama: 'SD Pusat' }],
    trainer: [{ id: 'trainer-1', nama: 'Budi' }],
    siswa: [{ id: 'student-1', nama: 'Ayu' }],
    absensi: [],
    honorPayments: [],
    sppPayments: [],
    invoices: [],
    settings: { title: 'Afterschola' },
  }
}

function validBackup() {
  return { version: BACKUP_VERSION, exportedAt: '2026-08-20T00:00:00.000Z', data: validData() }
}

beforeEach(() => {
  const values = new Map()
  globalThis.localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
  }
  // Default: tests run as superadmin. Per-test override possible via
  // globalThis.__BACKUP_IDENTITY__ = null to verify the new anonymous
  // short-circuit if needed.
  globalThis.__BACKUP_IDENTITY__ = superadminIdentity
})

describe('backup helpers', () => {
  it('accepts the current complete backup shape', () => {
    const result = validateBackupShape(validBackup())

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(BACKUP_VERSION).toBe(2)
  })

  it('rejects malformed top-level and entity fields', () => {
    expect(validateBackupShape(null).valid).toBe(false)
    expect(validateBackupShape({ version: '2' }).errors).toContain('Field "exportedAt" hilang atau bukan string.')
    expect(validateBackupShape({ version: 2, exportedAt: 'now', data: {} }).errors).toHaveLength(9)
    expect(validateBackupShape({ ...validBackup(), data: { ...validData(), siswa: [{ nama: 'Tanpa ID' }] } }).valid).toBe(false)
  })

  it('exports all current entities through the store contract', () => {
    const keys = getKeys()
    for (const key of collections) localStorage.setItem(keys[key], JSON.stringify(validData()[key]))
    localStorage.setItem(keys.settings, JSON.stringify(validData().settings))

    const result = exportBackup()

    expect(result.version).toBe(BACKUP_VERSION)
    expect(result.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.data.cabang).toEqual(validData().cabang)
    expect(result.data.sppPayments).toEqual([])
    expect(result.data.invoices).toEqual([])
  })

  it('restores entities and settings after validating shape', () => {
    const backup = validBackup()
    restoreBackup(backup)
    const keys = getKeys()

    expect(JSON.parse(localStorage.getItem(keys.cabang))).toEqual(backup.data.cabang)
    expect(JSON.parse(localStorage.getItem(keys.sekolah))).toEqual(backup.data.sekolah)
    expect(JSON.parse(localStorage.getItem(keys.sppPayments))).toEqual([])
    expect(JSON.parse(localStorage.getItem(keys.invoices))).toEqual([])
    expect(JSON.parse(localStorage.getItem(keys.settings))).toEqual(backup.data.settings)
    expect(() => restoreBackup({ version: 2 })).toThrow('Backup tidak valid')
  })

  it('reports invalid JSON and validates parsed file contents', async () => {
    class MockFileReader {
      readAsText(file) {
        queueMicrotask(() => {
          this.result = file.contents
          this.onload()
        })
      }
    }
    globalThis.FileReader = MockFileReader

    const invalid = await readBackupFile({ contents: '{broken' })
    const valid = await readBackupFile({ contents: JSON.stringify(validBackup()) })

    expect(invalid.valid).toBe(false)
    expect(invalid.errors).toEqual(['File bukan JSON yang valid.'])
    expect(valid.valid).toBe(true)
    expect(valid.parsed.data.cabang).toHaveLength(1)
    vi.restoreAllMocks()
  })
})
