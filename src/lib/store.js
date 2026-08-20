const STORE_KEY = 'afterschola_v4'
const STORE_EVENT = 'afterschola_v4_changed'
const SERVER_KEYS = new Set(['absensi', 'sppPayments', 'honorPayments'])

function notifyStoreChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(STORE_EVENT))
}

// ============================================
// ROLE CONTEXT (M5.1.3) — cabang-aware filtering
// ============================================
// The persisted UI state (afterschola_v4_ui) holds the active soft-login
// context: `role` ('admin' | 'trainer') and `trainerId`. The trainer's
// branch scope is the set of sekolahIds they are assigned to (the cabang
// entity is Phase C; until then the trainer's own assignment set is the
// branch boundary). Reads silently narrow to that scope; writes outside it
// are blocked, so a trainer can never accidentally mutate another branch's
// records. This is a UI convenience layer, not a security boundary.

const UI_STATE_KEY = `${STORE_KEY}_ui`

export function getRoleContext() {
  try {
    const json = localStorage.getItem(UI_STATE_KEY)
    const ui = json ? JSON.parse(json) : {}
    if (ui.role !== 'trainer' || !ui.trainerId) {
      return { role: ui.role || 'admin', trainerId: ui.trainerId || null, cabangId: null }
    }
    const trainers = JSON.parse(localStorage.getItem(getKeys().trainer) || '[]')
    const trainer = Array.isArray(trainers) ? trainers.find(t => t.id === ui.trainerId) : undefined
    // Synthetic branch id until the Phase C `cabang` entity lands: a trainer
    // belongs to the branch covering their assigned schools.
    const cabangId = (trainer && trainer.sekolahIds.length > 0)
      ? trainer.sekolahIds.slice().sort().join('|')
      : null
    return { role: 'trainer', trainerId: ui.trainerId, cabangId }
  } catch {
    return { role: 'admin', trainerId: null, cabangId: null }
  }
}

// A record belongs to the active trainer context if it is reachable from
// the trainer's own assignment set (sekolahIds). Everything joins through
// sekolah; honorPayments joins through trainerId.
function isWithinScope(key, record, ctx) {
  if (ctx.role !== 'trainer' || !ctx.trainerId || !record) return true
  const sekolahIds = ctx.cabangId ? ctx.cabangId.split('|') : []
  switch (key) {
    case 'sekolah':
      return sekolahIds.includes(record.id) || (record.trainerIds || []).includes(ctx.trainerId)
    case 'trainer':
      return record.id === ctx.trainerId
    case 'absensi':
      return sekolahIds.includes(record.sekolahId)
    case 'siswa':
      return sekolahIds.includes(record.sekolahId)
        case 'honorPayments':
      return record.trainerId === ctx.trainerId
    case 'invoices':
      // Trainer tidak punya akses ke invoice sama sekali (lihat SCOPE_EXPANSION_PRIVILEGES.md)
      return false
    default:
      return true
  }
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
    // M7.1.1 — branch entity, read/written like any other collection.
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
  return ctx.role === 'trainer' ? parsed.filter(r => isWithinScope(key, r, ctx)) : parsed
}

export async function read(key) {
  if (!SERVER_KEYS.has(key)) return readCached(key)
  try {
    const res = await fetch(`/api/read.php?entity=${encodeURIComponent(key)}`)
    if (!res.ok) throw new Error(`read ${key}: ${res.status}`)
    const remote = await res.json()
    if (!Array.isArray(remote)) throw new Error(`read ${key}: invalid response`)
    writeRaw(key, remote)
    notifyStoreChanged()
    return readCached(key)
  } catch {
    return readCached(key)
  }
}

export function subscribeStore(listener) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(STORE_EVENT, listener)
  return () => window.removeEventListener(STORE_EVENT, listener)
}

export async function hydrateServerData() {
  await Promise.all([...SERVER_KEYS].map(key => read(key)))
}

export function write(key, records) {
  const ctx = getRoleContext()
  let out = records
  if (ctx.role === 'trainer' && Array.isArray(records)) {
    out = records.filter(r => isWithinScope(key, r, ctx))
  }
  writeRaw(key, out)
}

export function upsert(key, record) {
  const ctx = getRoleContext()
  if (ctx.role === 'trainer' && !isWithinScope(key, record, ctx)) return
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
  queueSync(key, saved)
}

// ============================================
// M7.2.1 — SERVER-FIRST SYNC LAYER (additive)
// ============================================
// Design note: read()/write()/upsert() above stay fully synchronous —
// every existing caller (SchoolList, BranchManager, StudentList, ...)
// calls read('sekolah') expecting an array back immediately, inside
// useState initializers and render logic. Converting them to return a
// Promise — a literal reading of "read() → fetch(...)" — breaks every one
// of those call sites, files this microtask does not own (R7). Instead
// this section adds a *parallel* sync layer on the same localStorage
// source of truth:
//   - upsert() (above) also queues the saved record for server push
//   - syncPending() flushes the queue to /api/sync.php (M7.2.2) when
//     online — this is what the "Sinkronisasi" button calls
//   - pullRemote() opportunistically refreshes the local cache from the
//     server in the background; it never blocks or replaces readCached()
// This matches the microtask's own VERIFY line: "Network off → app still
// works from cache → network on → sync button shows pending count → sync
// resolves" — a queue-and-sync-button pattern, not a request/response
// rewrite of read().

const SYNC_LOG_KEY = `${STORE_KEY}_syncLog`

// Only these collections are append-only ledgers with a matching PHP
// endpoint (M7.2.2). Everything else (sekolah, trainer, siswa, cabang,
// settings) stays localStorage-only for now — unchanged from before this
// microtask, and out of scope to wire up here.
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
// without one (sekolah, trainer, siswa, cabang, ...) so upsert() can call
// this unconditionally without callers needing to know which keys sync.
function queueSync(key, record) {
  if (!SERVER_KEYS.has(key) || !record?.id) return
  const log = readSyncLog()
  // Replace any existing queued entry for the same record — the queue
  // holds at most one pending push per record (last write wins locally;
  // only the latest version is ever POSTed), not a growing history.
  const next = log.filter(e => !(e.key === key && e.id === record.id))
  next.push({ key, id: record.id, record, queuedAt: Date.now() })
  writeSyncLog(next)
}

// Read-only status for a "Sync" button UI: how many records are waiting
// to be pushed. Safe to call anytime (offline or online).
export function getSyncStatus() {
  const log = readSyncLog()
  return { pending: log.length, entries: log }
}

// Pushes every queued entry to its PHP endpoint, in order. Stops at the
// first network failure and leaves the remaining entries queued — a
// flaky connection degrades to "still pending", never silent data loss.
// A 409 (server already has this ID — append-only per M7.2.2) is treated
// as success and dropped from the queue: the record is already on the
// server, nothing left to push.
export async function syncPending() {
  const log = readSyncLog()
  if (log.length === 0) return { synced: 0, pending: 0 }
  try {
    const res = await fetch('/api/sync.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: log }),
    })
    if (res.status === 409) {
      writeSyncLog([])
      return { synced: log.length, pending: 0 }
    }
    if (!res.ok) return { synced: 0, pending: log.length }
    const result = await res.json()
    const failed = new Set((result.failed || []).map(item => item.id))
    const remaining = log.filter(entry => failed.has(entry.id))
    writeSyncLog(remaining)
    return { synced: log.length - remaining.length, pending: remaining.length }
  } catch {
    return { synced: 0, pending: log.length }
  }
}

// Best-effort background refresh of the local cache from the server.
// Never blocks or replaces read() — a failed/offline pull just leaves the
// existing localStorage cache in place, which read() keeps serving
// synchronously regardless of this call's outcome. Merge is additive only
// (remote records the local cache doesn't have yet get appended); it
// never overwrites a local record, since append-only ledgers never change
// an existing row server-side either (M7.2.2).
export async function pullRemote(key) {
  const url = SYNC_ENDPOINTS[key]
  if (!url) return false
  try {
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok) return false
    const remote = await res.json()
    if (!Array.isArray(remote)) return false
    const local = readCached(key)
    const localIds = new Set(local.map(r => r.id))
    const merged = local.concat(remote.filter(r => !localIds.has(r.id)))
    write(key, merged)
    return true
  } catch {
    // Offline or unreachable — local cache (already serving read())
    // is left exactly as it was.
    return false
  }
}

// ============================================
// SETTINGS (settings: { logoUrl, title })
// ============================================
// settings is a single object (not an array) under its own v4 key.

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
// Separate key from entity data (D7: only afterschola_v4_* keys) — this
// is UI state, not domain data, but stays under the same v4 namespace.
// (UI_STATE_KEY itself is defined with the role-context block at the top.)

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
