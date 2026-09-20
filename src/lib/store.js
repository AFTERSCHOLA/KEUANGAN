import { normalizeRole } from './role.js'
import { getSafeIdentityContext } from './auth.js'
import { apiRequest, ApiError } from './api.js'

const STORE_KEY = 'afterschola_v4'
const STORE_EVENT = 'afterschola_v4_changed'

// Append-only ledgers, synced in a batch via /api/sync.php (M3.3). A
// background queue-and-flush pattern is safe for these because inserts
// are the only operation — there's no update/delete to lose track of.
const LEDGER_KEYS = new Set(['absensi', 'sppPayments', 'honorPayments'])

// Everything server-readable via the generic /api/read.php?entity=...
// (M3.3) — the 3 ledgers above, plus the 4 full-CRUD entities that have
// dedicated write endpoints, plus 'invoices' (SB.C.2).
//
// SB.C.2 — 'invoices' added. read.php already supported this entity
// since M3.3 (per the original comment here); what was missing was the
// client ever asking for it. Invoices are still NOT written through the
// generic write() adapter below — creation only happens via
// /api/invoices-generate.php (see src/lib/invoices.js
// generateInvoiceForSekolah()), per D-SB10's single-canonical-path
// decision. 'settings' still has no client write path.
const READABLE_SERVER_KEYS = new Set([
  'absensi', 'sppPayments', 'honorPayments',
  'sekolah', 'trainer', 'siswa', 'cabang',
  'invoices',
])

function notifyStoreChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(STORE_EVENT))
}

const UI_STATE_KEY = `${STORE_KEY}_ui`

// M-AUTH.3: role/cabang/trainer context now comes exclusively from the
// authenticated server identity (getSafeIdentityContext). The old
// readUiRoleState() helper — which read role claims from
// `afterschola_v4_ui` without any server check — is removed. The
// `afterschola_v4_ui` key is still used for non-sensitive UI preferences
// (selected period, sidebar collapse, branch filter) but no longer holds
// identity claims.

function schoolIdsForBranch(cabangId) {
  return new Set(readCollection('sekolah').filter(s => s.cabangId === cabangId).map(s => s.id))
}

export function getRoleContext() {
  // M-AUTH.3: role/scope must come from the authenticated server identity,
  // not from localStorage. Anything else is no longer trusted as a security
  // boundary. When there's no currentUser (anonymous, expired session, or a
  // pre-auth bootstrap), the context is null and every guarded call below
  // treats it as "no access".
  const identity = getSafeIdentityContext()
  if (!identity || identity.active === false) {
    return { role: null, trainerId: null, cabangId: null }
  }
  const role = normalizeRole(identity.role)
  if (!role) return { role: null, trainerId: null, cabangId: null }
  if (role === 'superadmin') return { role, trainerId: null, cabangId: null }
  if (role === 'admin_cabang') {
    const cabangId = typeof identity.cabangId === 'string' && identity.cabangId !== ''
      ? identity.cabangId
      : null
    return { role: cabangId ? role : null, trainerId: null, cabangId }
  }
  if (role === 'trainer') {
    const trainerId = typeof identity.trainerId === 'string' && identity.trainerId !== ''
      ? identity.trainerId
      : null
    return { role: trainerId ? role : null, trainerId, cabangId: null }
  }
  return { role: null, trainerId: null, cabangId: null }
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
    // M7.1.1 — branch entity, read/written like any other collection.
    cabang: `${STORE_KEY}_cabang`,
    // USER_PROVISIONING.md D8 — `users` is server-authoritative and only
    // surfaced via the management forms (BranchManager / TrainerList). We
    // don't need a local mirror: the dialog reads the password straight
    // from the response, and there's no "user list" view to keep in sync.
    users: `${STORE_KEY}_users`,
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
  // M-AUTH.3: anonymous callers (no authenticated server identity) get
  // an empty list for any entity. Previously this returned whatever
  // localStorage happened to hold — which leaked the last logged-in
  // user's records to anyone with a stale browser profile, and let a
  // forged `afterschola_v4_ui.role` claim drive isWithinScope() below.
  const ctx = getRoleContext()
  if (!ctx.role) return []
  const parsed = readCollection(key)
  return ctx.role !== 'superadmin' ? parsed.filter(r => isWithinScope(key, r, ctx)) : parsed
}

export async function read(key) {
  // M-AUTH.3: anonymous callers don't get to read protected entities,
  // not even from local cache. There's no server authority backing the
  // request, so any value returned would be unauthenticated disclosure.
  const ctx = getRoleContext()
  if (!ctx.role) return []
  if (!READABLE_SERVER_KEYS.has(key)) return readCached(key)
  try {
    const remote = await apiRequest(`/api/read.php?entity=${encodeURIComponent(key)}`, { method: 'GET' })
if (!Array.isArray(remote)) throw new Error(`read ${key}: invalid response`)

// Server tetap menjadi sumber data utama.
    // Record yang masih pending sync SELALU menang atas versi remote —
    // masuk antrian berarti edit lokal ini belum terkonfirmasi ke-sync
    // (queueSync() cuma nyimpen 1 entry terbaru per id). Versi remote bisa
    // aja (a) belum ada sama sekali (record baru yang belum sempet
    // ke-sync — kasus asli SB.B.5), atau (b) ADA tapi basi (edit ke
    // record yang udah pernah ke-sync, tapi update-nya belum ke-flush) —
    // dua-duanya gak boleh ketimpa cuma karena servernya "punya sesuatu"
    // dengan ID itu. AttendanceForm.jsx mengonfirmasi edit-ulang absensi
    // itu alur nyata (editingRecord prop, id dipertahankan saat upsert),
    // jadi kasus (b) ini bukan teori — beneran bisa kejadian.
    const pending = pendingRecordsForKey(key)
    const remoteById = new Map(remote.map(record => [record.id, record]))

    for (const record of pending) {
      remoteById.set(record.id, record)
    }

    writeRaw(key, [...remoteById.values()])
    notifyStoreChanged()
    return readCached(key)

  } catch (error) {
    // 401 means the session is gone (api.js's unauthorized handler has
    // already cleared currentUser). Wipe the protected cache so a
    // stale browser profile doesn't keep showing the previous user's
    // records on the next reload. Per the production plan: cache
    // ownership is bound to the authenticated identity; without one
    // there's nothing to keep.
    if (error instanceof ApiError && error.status === 401) {
      writeRaw(key, [])
      notifyStoreChanged()
      return []
    }
    // Anything else — network failure, 5xx — leaves the user offline
    // with whatever they already had; that's the existing local-first
    // behavior the shell relies on for the sync button. Either way,
    // we do NOT surface the previous user's data to a now-anonymous
    // caller (readCached() will return [] for them via the no-role
    // short-circuit above).
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
  // M-AF5.4 client-side companion to the server migration: clear any
  // legacy `foto` value that may have been cached into localStorage
  // before the server-side purge ran for the current user. Safe to call
  // every hydrate; the per-version gate makes it a no-op on repeat.
  migrateSiswaFoto()
}

/**
 * M-AF5.4 — drop the legacy `foto` field from any cached `siswa` record.
 *
 * Mirrors the server-side `UPDATE siswa SET payload = JSON_SET(payload,
 * '$.foto', NULL) WHERE JSON_EXTRACT(payload, '$.foto') IS NOT NULL`
 * migration (server/migrations/2026-09-05-siswa-foto-purge.sql) for the
 * client localStorage cache. The server is authoritative, but cached
 * records written before the server purge will still carry `foto` until
 * `read('siswa')` overwrites them — and even then, a brief window between
 * hydrate-read and read-back can render the placeholder avatar from
 * stale data.
 *
 * Per taste #35 (idempotent, collision-safe, reference-preserving):
 *   - per-version gate via getMigrationState() makes repeat calls a no-op
 *   - only `record.foto` is touched; every other key is preserved as-is
 *   - running twice on the same cache leaves the same cache state
 *
 * Per taste #50 (privacy-as-removal): the field is being deleted, not
 * archived — once purged the key is gone forever (no "undo" button).
 */
export function migrateSiswaFoto() {
  const state = getMigrationState()
  if (state.siswaFotoPurgedAt) return
  const records = readRaw('siswa')
  if (!Array.isArray(records) || records.length === 0) {
    // Mark done even when there were no siswa rows — the cache is empty
    // either way and we don't want to keep paying the read cost on every
    // hydrate. Idempotent: a future cache write won't re-trigger it.
    setMigrationState({ ...state, siswaFotoPurgedAt: Date.now() })
    return
  }
  const hadFoto = records.some(r => r && Object.prototype.hasOwnProperty.call(r, 'foto'))
  if (hadFoto) {
    const purged = records.map(r => {
      if (!r || !Object.prototype.hasOwnProperty.call(r, 'foto')) return r
      const { foto: _foto, ...rest } = r
      return rest
    })
    writeRaw('siswa', purged)
    notifyStoreChanged()
  }
  setMigrationState({ ...state, siswaFotoPurgedAt: Date.now() })
}

export function write(key, records) {
  // M-AUTH.3: anonymous callers cannot mutate any collection. The old
  // superadmin short-circuit (any record accepted) is preserved so the
  // production login flow still works once the identity is established.
  const ctx = getRoleContext()
  if (!Array.isArray(records)) return
  if (!ctx.role) return
  if (ctx.role === 'superadmin') {
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
// the 4 full-CRUD entities this remains purely local until real feature
// components are rewired to call writeRemote() instead (or in addition).
//
// M-AUTH.3: anonymous callers (no role context) and out-of-scope records
// are now both no-ops, so an empty identity cannot create rows.
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
// M4.1 — WRITE ADAPTER UNTUK MASTER-DATA ENTITY
// ============================================
// Beda dari queueSync()/syncPending() di bawah (ledger append-only:
// absensi, sppPayments, honorPayments) — ini untuk entity yang BISA
// diedit (trainer, siswa, cabang, sekolah) lewat endpoint dedicated
// masing-masing.
const WRITE_ENDPOINTS = {
  trainer: '/api/trainer.php',
  siswa: '/api/siswa.php',
  cabang: '/api/cabang.php',
  sekolah: '/api/sekolah.php',
  // USER_PROVISIONING.md D3/D8 — Branch Admin creates Trainer (record + login)
  // in one call through /api/users.php. Falls back to /api/trainer.php for
  // trainers without login accounts (D6 substitute-trainer case).
  users: '/api/users.php',
  // SB.C.2 — registered ONLY so deleteRemote('invoices', id) has an
  // endpoint to call. writeRemote('invoices', ...) (create/update) is
  // intentionally NEVER called by any UI: invoice creation is exclusively
  // through /api/invoices-generate.php (see src/lib/invoices.js
  // generateInvoiceForSekolah()), per D-SB10's single-canonical-path
  // decision. Calling writeRemote('invoices', ...) directly would bypass
  // the generator's grouping/sequence/carry-over logic — don't add a
  // call site for it.
  invoices: '/api/invoices.php',
}

// MULTI_ACCOUNT_SYNC M-MAS1.1 — single owner of the per-entity `cabangId`
// policy. Each branch mirrors the server-side rule so callers don't need to
// know whether a given endpoint rejects body-supplied cabangId outright
// (sekolah/trainer/users for admin_cabang, siswa for any role) or accepts it
// (superadmin-supplied cabangId for sekolah/users, client-supplied for the
// three ledgers).
export function prepareWritePayload(key, record, ctx) {
  if (record == null || typeof record !== 'object') return record
  const role = ctx?.role ?? null
  const copy = { ...record }

  switch (key) {
    case 'cabang':
      return copy

    case 'sekolah':
      if (role === 'admin_cabang') delete copy.cabangId
      return copy

    case 'trainer':
      // trainer.php forbids cabangId in the body for EVERY role, not just
      // admin_cabang — for admin_cabang because it's always forced from
      // their own session, and for superadmin because moving a trainer
      // between branches isn't allowed through this endpoint at all (the
      // existing branch is preserved server-side on update; WA thread
      // 1/9/2026 policy decision). This is the opposite of sekolah.php,
      // where superadmin MUST supply cabangId explicitly — the two
      // endpoints genuinely differ per role here, not a shared rule.
      delete copy.cabangId
      return copy

    case 'siswa':
      delete copy.cabangId
      return copy

    case 'users':
      if (role === 'admin_cabang') delete copy.cabangId
      return copy

    case 'absensi':
    case 'sppPayments':
    case 'honorPayments':
      return copy

    default:
      return copy
  }
}

// Mengirim satu record ke server. TIDAK throw untuk 409/403 — keduanya
// adalah hasil bisnis yang wajar (bukan bug), jadi dikembalikan sebagai
// status terstruktur supaya pemanggil (UI) bisa menampilkan pesan yang
// tepat tanpa try/catch berlapis:
//   - { status: 'ok', id, version }                    → tersimpan
//   - { status: 'conflict', currentVersion, current }  → record berubah
//     di server sejak terakhir dibaca; TETAP di-treat "pending/conflicted",
//     bukan ditimpa diam-diam (belum pernah terjadi di server sampai
//     M5.3 — endpoint sekarang selalu increment version tanpa cek stale,
//     jadi cabang ini forward-compatible, bukan aktif dipakai)
//   - { status: 'forbidden', message }                  → authorize() menolak
// Error lain (mis. 500, network) tetap di-throw sebagai ApiError biasa.
//
// PENTING: semua endpoint (trainer/siswa/cabang/sekolah/invoices .php)
// cuma nerima POST, dan create/update/delete dibedain lewat field `action`
// di body — bukan lewat HTTP method PUT/DELETE (dikonfirmasi lewat
// endpoint.protection.php, 201 checks, Gate 3). "Update apa belum"
// ditentukan dari ADA-TIDAKNYA record ini di local store, bukan dari
// record.version — payload JSON di server nggak pernah nyimpen `version`
// di dalamnya (itu kolom SQL terpisah, cuma muncul di response), jadi
// record hasil read()/pullRemote() (bukan dari writeRemote() sebelumnya)
// nggak akan punya field version dan bakal salah kedeteksi "create" kalau
// dicek dari situ.
export async function writeRemote(key, record) {
  const url = WRITE_ENDPOINTS[key]
  if (!url) throw new Error(`writeRemote: entitas "${key}" belum punya endpoint server`)

  const ctx = getRoleContext()
  const sanitized = prepareWritePayload(key, record, ctx)

// record.id being absent means the ID is server-generated (e.g. users.php's
// createUser()), not client-pregenerated (trainer/siswa/sekolah/cabang via
// generateId()) — never treat this as "update" by matching against an
// undefined id, since getKeys() has no 'users' entry and readRaw('users')
// would otherwise collide on the shared literal localStorage key
// "undefined" with any other unregistered key.
const isUpdate = record.id != null && readRaw(key).some(r => r.id === record.id)

  try {
    const result = await apiRequest(url, {
      method: 'POST',
      body: isUpdate ? { ...sanitized, action: 'update' } : { ...sanitized, action: 'create' },
    })
    // Server is authoritative — merge its response (e.g. server-derived
    // cabangId, bumped version) into the local cache so readCached()
    // reflects the true saved state, not just the optimistic payload
    // that was sent.
    const merged = { ...record, ...result }
    const records = readRaw(key)
    const idx = records.findIndex(r => r.id === merged.id)
    if (idx >= 0) records[idx] = { ...records[idx], ...merged }
    else records.push(merged)
    writeRaw(key, records)
    notifyStoreChanged()
    // Return the full server body so callers can read response-only fields
    // (e.g. /api/users.php returns initialPassword once at creation time).
    // Backward-compatible: existing callers read .status/.id/.version.
    return { status: 'ok', id: result.id, version: result.version, body: result }
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return {
        status: 'conflict',
        currentVersion: error.body?.currentVersion ?? null,
        current: error.body?.current ?? null,
      }
    }
    if (error instanceof ApiError && error.status === 403) {
      return { status: 'forbidden', message: error.message }
    }
    throw error
  }
}

export async function deleteRemote(key, id) {
  const url = WRITE_ENDPOINTS[key]
  if (!url) throw new Error(`deleteRemote: entitas "${key}" belum punya endpoint server`)

  try {
    await apiRequest(url, { method: 'POST', body: { id, action: 'delete' } })
    writeRaw(key, readRaw(key).filter(r => r.id !== id))
    notifyStoreChanged()
    return { status: 'ok', id }
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return { status: 'forbidden', message: error.message }
    }
    // INV.1 (D-INV1): the invoice-has-payments 422 is a business refusal,
    // not a bug — surface it structurally like 403 so the caller renders
    // the pinned guard copy instead of the generic catch-all. Scoped to
    // the exact guard message so other 422s (e.g. 'Record membutuhkan id',
    // 'Invoice tidak ditemukan') still throw.
    if (key === 'invoices' && error instanceof ApiError && error.status === 422 && error.body?.error === 'Invoice sudah memiliki pembayaran dan tidak dapat dihapus') {
      return { status: 'guarded', message: error.message }
    }
    throw error
  }
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

function pendingRecordsForKey(key) {
  return readSyncLog()
    .filter(entry => entry.key === key && entry.record && entry.id)
    .map(entry => entry.record)
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
    const failedIds = new Set((result.failed || []).map(item => item.id))
    const failedDetail = new Map((result.failed || []).map(item => [item.id, item]))
    // M-AF5.5 (F-11 diagnostic): every entry the server explicitly lists
    // in `failed` stays in the queue, but now also carries a `failedAt`
    // marker so callers / tests can tell it was inspected-and-rejected
    // by the server (vs. a fresh entry that hasn't synced yet). 200-OK
    // responses only ever contain entries we want off the queue.
    const remaining = log
      .filter(entry => failedIds.has(entry.id))
      .map(entry => {
        const detail = failedDetail.get(entry.id)
        return {
          ...entry,
          failedAt: Date.now(),
          failedStatus: detail?.status ?? null,
          failedError: detail?.error ?? 'Server menolak entri',
        }
      })
    writeSyncLog(remaining)
    return { synced: log.length - remaining.length, pending: remaining.length }
  } catch (error) {
    // M-AF5.5 (F-11 diagnostic): a 4xx server response used to leave
    // the queue silently intact — the entry would survive but a test or
    // a future reviewer couldn't distinguish "never tried" from
    // "server rejected". Tag surviving entries with a marker so the
    // failed-state is observable, then keep them in the queue so they
    // get retried on the next sync. A 401 (interceptor already reset
    // auth state) is still treated as a transient failure, not data loss.
    if (error instanceof ApiError) {
      const remaining = log.map(entry => ({
        ...entry,
        failedAt: Date.now(),
        failedStatus: error.status ?? null,
        failedError: error.message ?? 'Permintaan gagal',
      }))
      writeSyncLog(remaining)
      return { synced: 0, pending: remaining.length }
    }
    // Network failure or an unexpected error — leave the queue exactly
    // as it was; nothing here was confirmed synced. A flaky connection
    // degrades to "still pending", never silent data loss.
    return { synced: 0, pending: log.length }
  }
}

// Best-effort background refresh of the local cache from the server for
// any READABLE_SERVER_KEYS entity. Never blocks or replaces read() — a
// failed/offline pull just leaves the existing localStorage cache in
// place. Reuses the same /api/read.php path as read() itself.
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
// No server endpoint exists for this yet — stays localStorage-only for now.

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