import { normalizeRole } from './role.js'
import { apiRequest } from './api.js'

const STORE_KEY = 'afterschola_v4'
const STORE_EVENT = 'afterschola_v4_changed'

// Append-only ledgers, synced in a batch via /api/sync.php (M3.3). A
// background queue-and-flush pattern is safe for these because inserts
// are the only operation — there's no update/delete to lose track of.
const LEDGER_KEYS = new Set(['absensi', 'sppPayments', 'honorPayments'])

// Everything server-readable via the generic /api/read.php?entity=...
// (M3.3) — the 3 ledgers above, plus the 4 full-CRUD entities M3.4 built
// dedicated write endpoints for. 'settings'/'invoices' aren't included:
// no server endpoint exists for them yet.
const READABLE_SERVER_KEYS = new Set([
  'absensi', 'sppPayments', 'honorPayments',
  'sekolah', 'trainer', 'siswa', 'cabang',
])

// Dedicated write endpoints from M3.4 — full CRUD (action: create/update/
// delete), NOT append-only, so they go through writeRemote() below
// (direct call, immediate error feedback) rather than the ledger queue.
const WRITE_ENDPOINTS = {
  siswa: '/api/siswa.php',
  sekolah: '/api/sekolah.php',
  trainer: '/api/trainer.php',
  cabang: '/api/cabang.php',
}

function notifyStoreChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(STORE_EVENT))
}

const UI_STATE_KEY = `${STORE_KEY}_ui`

function readUiRoleState() {
  try {
    const json = localStorage.getItem(UI_STATE_KEY)
    return json ? JSON.parse(json) : {}
  } catch {
    return {}
  }
}

function schoolIdsForBranch(cabangId) {
  return new Set(readCollection('sekolah').filter(s => s.cabangId === cabangId).map(s => s.id))
}

function trainerBranchIds(trainer) {
  const schools = readCollection('sekolah')
  return [...new Set((trainer?.sekolahIds || [])
    .map(id => schools.find(s => s.id === id)?.cabangId)
    .filter(Boolean))]
}

export function getRoleContext() {
  const ui = readUiRoleState()
  const role = normalizeRole(ui.role)
  if (!role) return { role: null, trainerId: null, cabangId: null }
  if (role === 'superadmin') return { role, trainerId: null, cabangId: null }

  const branches = readCollection('cabang')
  if (role === 'admin_cabang') {
    const cabangId = typeof ui.cabangId === 'string' && branches.some(c => c.id === ui.cabangId)
      ? ui.cabangId
      : null
    return { role: cabangId ? role : null, trainerId: null, cabangId }
  }

  if (!ui.trainerId) return { role: null, trainerId: null, cabangId: null }
  const trainer = readCollection('trainer').find(t => t.id === ui.trainerId)
  const branchIds = trainerBranchIds(trainer)
  const cabangId = typeof ui.cabangId === 'string' && branchIds.includes(ui.cabangId)
    ? ui.cabangId
    : branchIds.length === 1 ? branchIds[0] : null
  return { role, trainerId: ui.trainerId, cabangId }
}

function isWithinScope(key, record, ctx) {
  if (!record || ctx.role === 'superadmin') return true

  if (ctx.role === 'admin_cabang') {
    if (!ctx.cabangId) return false
    const schoolIds = schoolIdsForBranch(ctx.cabangId)
    const studentIds = new Set(readCollection('siswa').filter(s => schoolIds.has(s.sekolahId)).map(s => s.id))
    const trainerIds = new Set(readCollection('trainer').filter(t => (t.sekolahIds || []).some(id => schoolIds.has(id))).map(t => t.id))
    switch (key) {
      case 'cabang': return record.id === ctx.cabangId
      case 'sekolah': return record.cabangId === ctx.cabangId
      case 'trainer': return trainerIds.has(record.id) || record.cabangId === ctx.cabangId
      case 'siswa': return studentIds.has(record.id) || schoolIds.has(record.sekolahId) || record.cabangId === ctx.cabangId
      case 'absensi': return schoolIds.has(record.sekolahId) || record.cabangId === ctx.cabangId
      case 'sppPayments': return studentIds.has(record.siswaId) || record.cabangId === ctx.cabangId
      case 'honorPayments': return trainerIds.has(record.trainerId) || record.cabangId === ctx.cabangId
      case 'invoices': return schoolIds.has(record.sekolahId) || record.cabangId === ctx.cabangId
      default: return false
    }
  }

  if (ctx.role === 'trainer') {
    if (!ctx.trainerId) return false
    const trainer = readCollection('trainer').find(t => t.id === ctx.trainerId)
    const schoolIds = new Set(trainer?.sekolahIds || [])
    switch (key) {
      case 'sekolah': return schoolIds.has(record.id)
      case 'trainer': return record.id === ctx.trainerId
      case 'absensi': return record.trainerId === ctx.trainerId && schoolIds.has(record.sekolahId)
      case 'siswa': return schoolIds.has(record.sekolahId)
      case 'honorPayments': return record.trainerId === ctx.trainerId
      case 'invoices': return false
      default: return false
    }
  }

  return false
}

export function getKeys() {
  return {
    sekolah: `${STORE_KEY}_sekolah`,
    trainer: `${STORE_KEY}_trainer`,
    siswa: `${STORE_KEY}_siswa`,
    absensi: `${STORE_KEY}_absensi`,
    honorPayments: `${STORE_KEY}_honorPayments`,
    sppPayments: `${STORE_KEY}_sppPayments`,
    invoices: `${STORE_KEY}_invoices`,
    settings: `${STORE_KEY}_settings`,
    cabang: `${STORE_KEY}_cabang`,
  }
}

function readCollection(key) {
  const json = localStorage.getItem(getKeys()[key])
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function readRaw(key) {
  return readCollection(key)
}

export function writeRaw(key, records) {
  localStorage.setItem(getKeys()[key], JSON.stringify(records))
}

export function getMigrationState() {
  try {
    const json = localStorage.getItem(getKeys().settings)
    const settings = json ? JSON.parse(json) : {}
    return settings?.migrations || {}
  } catch {
    return {}
  }
}

export function setMigrationState(migrations) {
  const current = getSettings()
  localStorage.setItem(getKeys().settings, JSON.stringify({ ...current, migrations }))
}

export function readCached(key) {
  const parsed = readCollection(key)
  const ctx = getRoleContext()
  return ctx.role && ctx.role !== 'superadmin' ? parsed.filter(r => isWithinScope(key, r, ctx)) : parsed
}

// UNVERIFIED ASSUMPTION (carried over from before this file was handed to
// me, not something I introduced): read.php is assumed to accept
// ?entity=<key> and answer with a bare JSON array. Never confirmed against
// the actual read.php source — if the real shape differs, every read()
// call below (old and new) fails closed to readCached() silently, with no
// visible error. Get read.php's source and cross-check before relying on
// this in production.
export async function read(key) {
  if (!READABLE_SERVER_KEYS.has(key)) return readCached(key)
  try {
    const remote = await apiRequest(`/api/read.php?entity=${encodeURIComponent(key)}`, { method: 'GET' })
    if (!Array.isArray(remote)) throw new Error(`read ${key}: invalid response`)
    writeRaw(key, remote)
    notifyStoreChanged()
    return readCached(key)
  } catch {
    // Offline, expired session (401 already handled by api.js's
    // interceptor — auth state is reset by the time we get here), or a
    // server error: fall back to whatever's in the local cache rather
    // than surfacing a hard failure for a read.
    return readCached(key)
  }
}

export function subscribeStore(listener) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(STORE_EVENT, listener)
  return () => window.removeEventListener(STORE_EVENT, listener)
}

export async function hydrateServerData() {
  await Promise.all([...READABLE_SERVER_KEYS].map(key => read(key)))
}

export function write(key, records) {
  const ctx = getRoleContext()
  if (!Array.isArray(records)) return
  if (!ctx.role || ctx.role === 'superadmin') {
    writeRaw(key, records)
    notifyStoreChanged()
    return
  }
  const scoped = new Map(records.filter(record => isWithinScope(key, record, ctx)).map(record => [record.id, record]))
  const merged = readRaw(key).map(record => scoped.get(record.id) || record)
  const existingIds = new Set(merged.map(record => record.id))
  records.filter(record => isWithinScope(key, record, ctx) && !existingIds.has(record.id)).forEach(record => merged.push(record))
  writeRaw(key, merged)
  notifyStoreChanged()
}

// Local-only write, unchanged in behavior from before this microtask.
// Still synchronous by design (see note below) — existing callers
// (TrainerList, BranchManager, StudentList, ...) call this expecting an
// immediate return, inside useState initializers and render logic.
// queueSync() below only fires for LEDGER_KEYS, exactly as before; for
// the 4 new full-CRUD entities this remains purely local until M4.3
// rewires those call sites to use writeRemote() instead (or in addition —
// that coordination is M4.3's decision to make, not resolved here, to
// avoid the same record getting submitted through two different paths).
export function upsert(key, record) {
  const ctx = getRoleContext()
  if (!ctx.role || !isWithinScope(key, record, ctx)) return
  const records = readRaw(key)
  const idx = records.findIndex(r => r.id === record.id)
  let saved
  if (idx >= 0) {
    records[idx] = { ...records[idx], ...record }
    saved = records[idx]
  } else {
    records.push(record)
    saved = record
  }
  writeRaw(key, records)
  notifyStoreChanged()
  queueSync(key, saved)
}

// ============================================
// DIRECT CRUD — M3.4 full-CRUD entities (siswa/sekolah/trainer/cabang)
// ============================================
// Unlike the ledger queue below, this calls the server immediately and
// throws ApiError on failure (401/403/409/422) for the caller to handle —
// matches M4.1's VERIFY line ("403 shows feedback", "409 remains
// pending/conflicted") much better than a silent background retry would
// for mutable master data. Nothing calls this yet; wiring real feature
// components (TrainerList.jsx, BranchManager.jsx, ...) to use it instead
// of the old local-only upsert() is M4.3's job, not this file's.
export async function writeRemote(key, action, record) {
  const url = WRITE_ENDPOINTS[key]
  if (!url) throw new Error(`writeRemote: tidak ada endpoint untuk "${key}"`)

  const result = await apiRequest(url, {
    method: 'POST',
    body: { ...record, action },
  })

  // Server is authoritative (M3.1-M3.4) — merge its response (e.g.
  // server-derived cabangId, bumped version) into the local cache so
  // readCached() reflects the true saved state, not just the optimistic
  // payload that was sent.
  if (action === 'delete') {
    writeRaw(key, readRaw(key).filter(r => r.id !== record.id))
  } else {
    const merged = { ...record, ...result }
    const records = readRaw(key)
    const idx = records.findIndex(r => r.id === merged.id)
    if (idx >= 0) records[idx] = { ...records[idx], ...merged }
    else records.push(merged)
    writeRaw(key, records)
  }
  notifyStoreChanged()
  return result
}

// ============================================
// LEDGER SYNC LAYER (absensi / sppPayments / honorPayments only)
// ============================================
// read()/write()/upsert() above stay fully synchronous for existing
// callers; this section queues ledger writes for background push via
// /api/sync.php, and flushes on demand (e.g. a "Sinkronisasi" button).

const SYNC_LOG_KEY = `${STORE_KEY}_syncLog`

function readSyncLog() {
  try {
    const json = localStorage.getItem(SYNC_LOG_KEY)
    const parsed = json ? JSON.parse(json) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeSyncLog(entries) {
  localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(entries))
  notifyStoreChanged()
}

// Queues a record for push to its PHP endpoint. Silently no-ops for keys
// without one so upsert() can call this unconditionally without callers
// needing to know which keys sync.
function queueSync(key, record) {
  if (!LEDGER_KEYS.has(key) || !record?.id) return
  const log = readSyncLog()
  const next = log.filter(e => !(e.key === key && e.id === record.id))
  next.push({ key, id: record.id, record, queuedAt: Date.now() })
  writeSyncLog(next)
}

export function getSyncStatus() {
  const log = readSyncLog()
  return { pending: log.length, entries: log }
}

// Pushes every queued entry to /api/sync.php in one batch. sync.php
// always answers 200 with a per-entry breakdown ({synced, alreadyApplied,
// failed}) — a whole-request 409 never happens (confirmed in M3.3:
// duplicates land in `alreadyApplied`, not a request-level status code).
// Anything not explicitly listed in `failed` is off the queue, whether it
// was newly synced or already present server-side.
export async function syncPending() {
  const log = readSyncLog()
  if (log.length === 0) return { synced: 0, pending: 0 }
  try {
    const result = await apiRequest('/api/sync.php', {
      method: 'POST',
      body: { entries: log },
    })
    const failed = new Set((result.failed || []).map(item => item.id))
    const remaining = log.filter(entry => failed.has(entry.id))
    writeSyncLog(remaining)
    return { synced: log.length - remaining.length, pending: remaining.length }
  } catch {
    // Network failure, 401 (interceptor already reset auth state), or an
    // unexpected error — leave the queue exactly as it was; nothing here
    // was confirmed synced. A flaky connection degrades to "still
    // pending", never silent data loss.
    return { synced: 0, pending: log.length }
  }
}

// Best-effort background refresh of the local cache from the server for
// any READABLE_SERVER_KEYS entity. Never blocks or replaces read() — a
// failed/offline pull just leaves the existing localStorage cache in
// place. Fixed from the previous version, which referenced an
// undefined `SYNC_ENDPOINTS` and would throw a ReferenceError on every
// call; now reuses the same /api/read.php path as read() itself.
export async function pullRemote(key) {
  if (!READABLE_SERVER_KEYS.has(key)) return false
  try {
    const remote = await apiRequest(`/api/read.php?entity=${encodeURIComponent(key)}`, { method: 'GET' })
    if (!Array.isArray(remote)) return false
    const local = readCached(key)
    const localIds = new Set(local.map(r => r.id))
    const merged = local.concat(remote.filter(r => !localIds.has(r.id)))
    write(key, merged)
    return true
  } catch {
    return false
  }
}

// ============================================
// SETTINGS (settings: { logoUrl, title })
// ============================================
// settings is a single object (not an array) under its own v4 key.
// No server endpoint exists for this yet (M3.4 built siswa/sekolah/
// trainer/cabang only) — stays localStorage-only for now.

export function getSettings() {
  try {
    const json = localStorage.getItem(getKeys().settings)
    const parsed = json ? JSON.parse(json) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function setSettings(partial) {
  const current = getSettings()
  localStorage.setItem(getKeys().settings, JSON.stringify({ ...current, ...partial }))
}

// ============================================
// PERSISTED UI STATE (M4.3, row #15)
// ============================================

export function getUiState() {
  try {
    const json = localStorage.getItem(UI_STATE_KEY)
    return json ? JSON.parse(json) : {}
  } catch {
    return {}
  }
}

export function setUiState(partial) {
  const current = getUiState()
  localStorage.setItem(UI_STATE_KEY, JSON.stringify({ ...current, ...partial }))
}

// ============================================
// PERIOD CONTEXT (M1.1, persisted per M4.3)
// ============================================
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { periodeKey, periodeFromDate, calYear, defaultAcademicYear, defaultMonth } from './constants'

const PeriodContext = createContext(null)
const BranchContext = createContext(null)

export function PeriodProvider({ children }) {
  const saved = getUiState()
  const [selectedYear, setSelectedYearState] = useState(saved.selectedYear ?? defaultAcademicYear())
  const [selectedMonth, setSelectedMonthState] = useState(saved.selectedMonth ?? defaultMonth())

  const setSelectedYear = useCallback((year) => {
    setSelectedYearState(year)
    setUiState({ selectedYear: year })
  }, [])

  const setSelectedMonth = useCallback((month) => {
    setSelectedMonthState(month)
    setUiState({ selectedMonth: month })
  }, [])

  const getPeriodeKey = useCallback(
    () => periodeKey(selectedMonth, selectedYear),
    [selectedMonth, selectedYear]
  )

  const value = {
    selectedYear,
    setSelectedYear,
    selectedMonth,
    setSelectedMonth,
    periodeKey: getPeriodeKey,
    periodeFromDate,
    calYear,
  }

  return React.createElement(PeriodContext.Provider, { value }, children)
}

export function usePeriod() {
  const ctx = useContext(PeriodContext)
  if (!ctx) throw new Error('usePeriod harus dipakai di dalam <PeriodProvider>')
  return ctx
}

export function BranchProvider({ children }) {
  const [branches, setBranches] = useState(() => readCached('cabang'))
  const [selectedCabangId, setSelectedCabangIdState] = useState(() => getUiState().selectedCabangId || '')
  const refresh = useCallback(() => {
    setBranches(readCached('cabang'))
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeStore(refresh)
    refresh()
    return unsubscribe
  }, [refresh])

  const setSelectedCabangId = useCallback((id) => {
    setSelectedCabangIdState(id)
    setUiState({ selectedCabangId: id })
  }, [])

  const value = { branches, selectedCabangId, setSelectedCabangId }
  return React.createElement(BranchContext.Provider, { value }, children)
}

export function useBranch() {
  const ctx = useContext(BranchContext)
  if (!ctx) throw new Error('useBranch harus dipakai di dalam <BranchProvider>')
  return ctx
}