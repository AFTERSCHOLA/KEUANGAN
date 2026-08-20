// lib/backup.js — Person 4 (M3.1)
// Contract-only: reads/writes go exclusively through store.js (R2).
// This IS the D8 future cloud-import format — keep shape stable.

import { readCached, write, getKeys } from './store'

export const BACKUP_VERSION = 2

const ENTITY_KEYS = ['sekolah', 'trainer', 'siswa', 'absensi', 'honorPayments', 'settings']

/**
 * Build the backup object from current localStorage state.
 * settings is stored as a single object (not an array) in store.js's own
 * key, so we read it directly via getKeys() rather than readCached() (which
 * always returns an array).
 */
function collectData() {
  const keys = getKeys()
  const settingsJson = localStorage.getItem(keys.settings)
  let settings = {}
  try {
    settings = settingsJson ? JSON.parse(settingsJson) : {}
  } catch {
    settings = {}
  }

  return {
    sekolah: readCached('sekolah'),
    trainer: readCached('trainer'),
    siswa: readCached('siswa'),
    absensi: readCached('absensi'),
    honorPayments: readCached('honorPayments'),
    settings,
  }
}

/**
 * Export a backup object: { version, exportedAt, data }.
 * Pure function — does not touch the DOM. Caller decides how to
 * turn this into a downloadable file (see downloadBackup below).
 */
export function exportBackup() {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: collectData(),
  }
}

/**
 * Trigger a browser download of the backup as a JSON file.
 * Filename: afterschola-backup_YYYY-MM-DD.json
 */
export function downloadBackup() {
  const backup = exportBackup()
  const json = JSON.stringify(backup, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const dateStr = new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = url
  a.download = `afterschola-backup_${dateStr}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return backup
}

/**
 * Shape-validate a parsed backup object.
 * Returns { valid: true } or { valid: false, errors: string[] }.
 * Deliberately strict but not pedantic about record internals —
 * we validate top-level shape + that entity arrays are arrays.
 * Individual record shape drift is not this function's job (that's
 * what factories in constants.js are for on the write side).
 */
export function validateBackupShape(obj) {
  const errors = []

  if (!obj || typeof obj !== 'object') {
    return { valid: false, errors: ['File bukan objek JSON yang valid.'] }
  }
  if (typeof obj.version !== 'number') {
    errors.push('Field "version" hilang atau bukan angka.')
  }
  if (typeof obj.exportedAt !== 'string') {
    errors.push('Field "exportedAt" hilang atau bukan string.')
  }
  if (!obj.data || typeof obj.data !== 'object') {
    errors.push('Field "data" hilang atau bukan objek.')
    return { valid: false, errors }
  }

  for (const key of ENTITY_KEYS) {
    if (!(key in obj.data)) {
      errors.push(`"data.${key}" tidak ditemukan.`)
      continue
    }
    if (key === 'settings') {
      if (typeof obj.data.settings !== 'object' || Array.isArray(obj.data.settings)) {
        errors.push('"data.settings" harus berupa objek.')
      }
    } else if (!Array.isArray(obj.data[key])) {
      errors.push(`"data.${key}" harus berupa array.`)
    }
  }

  // Referential sanity (soft check, non-fatal): ids should exist and be unique.
  if (Array.isArray(obj.data.siswa)) {
    const badSiswa = obj.data.siswa.filter(s => !s || typeof s.id !== 'string')
    if (badSiswa.length > 0) errors.push('Beberapa record siswa tidak punya "id" yang valid.')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Overwrite all localStorage entity keys with the backup's data.
 * Caller is responsible for getting user confirmation first — this
 * function does not prompt, it just performs the write (R2: contract only).
 * Throws if the shape is invalid — call validateBackupShape() first.
 */
export function restoreBackup(obj) {
  const check = validateBackupShape(obj)
  if (!check.valid) {
    throw new Error('Backup tidak valid: ' + check.errors.join(' '))
  }

  const { data } = obj
  write('sekolah', data.sekolah)
  write('trainer', data.trainer)
  write('siswa', data.siswa)
  write('absensi', data.absensi)
  write('honorPayments', data.honorPayments)

  const keys = getKeys()
  localStorage.setItem(keys.settings, JSON.stringify(data.settings || {}))
}

/**
 * Read a File (from an <input type="file"> picker) and parse+validate it.
 * Returns a Promise<{ valid, errors, parsed }>.
 * Does NOT restore — caller shows a confirm dialog with the result first,
 * then calls restoreBackup(parsed) on confirm.
 */
export function readBackupFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      let parsed = null
      try {
        parsed = JSON.parse(reader.result)
      } catch {
        resolve({ valid: false, errors: ['File bukan JSON yang valid.'], parsed: null })
        return
      }
      const check = validateBackupShape(parsed)
      resolve({ valid: check.valid, errors: check.errors, parsed })
    }
    reader.onerror = () => {
      resolve({ valid: false, errors: ['Gagal membaca file.'], parsed: null })
    }
    reader.readAsText(file)
  })
}