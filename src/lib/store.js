import { normalizeRole } from './role.js'
import { getSafeIdentityContext } from './auth.js'
import { apiRequest, ApiError } from './api.js'
import { penugasanInvolvesTrainer } from './penugasan.js'

const STORE_KEY = 'afterschola_v4'
const STORE_EVENT = 'afterschola_v4_changed'
// T2.A.1 fix — privacy-safe server-scope snapshot for the trainer role:
// only schoolIds (no trainer records, no student data), keyed by trainerId.
const TRAINER_SCOPE_KEY = `${STORE_KEY}_trainerScope`

// DC.B.3 (D-DC1) — ledgers write direct (writeRemote / apiRequest custom
// actions). No queue, no batch flush; the queue-and-flush pattern is gone.

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
  'absensi', 'absensiPengajar', 'sppPayments', 'honorPayments',
  'sekolah', 'trainer', 'siswa', 'cabang',
  'invoices',
  // CS.B.2 (D-CS5) — external assistants sync like other master data.
  'eksternal',
  // Slice 1 Raport (2026-10-03) — raport semester per siswa.
  'raport',
])

function notifyStoreChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(STORE_EVENT))
}

const UI_STATE_KEY = `${STORE_KEY}_ui`

function schoolIdsForBranch(cabangId) {
  return new Set(readCollection('sekolah').filter(s => s.cabangId === cabangId).map(s => s.id))
}

// Slice 1 Raport (2026-10-03) — raport scopes by its siswa's school
// (server: read.php sppPayments-style hop via siswaId). Prefer the live
// siswa row; fall back to the locked snapshot sekolahId on the record.
function sekolahIdForRaport(record) {
  if (!record || typeof record !== 'object') return undefined
  const viaSiswa = readCollection('siswa').find(s => s && s.id === record.siswaId)
  const hop = viaSiswa && typeof viaSiswa.sekolahId === 'string' ? viaSiswa.sekolahId : ''
  if (hop !== '') return hop
  return typeof record.sekolahId === 'string' ? record.sekolahId : undefined
}

export function getRoleContext() {
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

function trainerHasActiveAssignmentClient(trainerId, sekolahId, tanggal) {
  const trainers = readCollection('trainer')
  for (const t of trainers) {
    const assignments = Array.isArray(t.penugasanPengajar) ? t.penugasanPengajar : []
    for (const a of assignments) {
      if (!a || a.sekolahId !== sekolahId) continue
      // DC.C.1 union — legacy asistenId counts as position 0, asistenIds
      // adds positions 1-2. Mirrors penugasanInvolvesTrainer() so client
      // scope agrees with the server write gate (authorize.php).
      const matchesTrainer = penugasanInvolvesTrainer(a, trainerId)
      if (!matchesTrainer) continue
      if (a.aktif !== true) continue
      if (!a.periodeMulai || tanggal < a.periodeMulai) continue
      if (a.periodeSelesai != null && tanggal > a.periodeSelesai) continue
      return true
    }
  }
  return false
}

export function trainerHasAnyActiveAssignmentToSekolahClient(trainerId, sekolahId) {
  const trainers = readCollection('trainer')
  for (const t of trainers) {
    const assignments = Array.isArray(t.penugasanPengajar) ? t.penugasanPengajar : []
    for (const a of assignments) {
      if (!a || a.sekolahId !== sekolahId) continue
      // DC.C.1 union — same owner as above (penugasanInvolvesTrainer).
      const matchesTrainer = penugasanInvolvesTrainer(a, trainerId)
      if (!matchesTrainer) continue
      if (a.aktif !== true) continue
      return true
    }
  }
  return false
}

// T2.A.1 fix — server-scope snapshot (trainer role only). The server
// read lane (read.php DB assignments + authorize.php) is authoritative,
// but read('trainer') is own-record-only, so a trainer-first hydrate
// wipes the cross-record assignment rows the local scan needs. Persist
// the schools the server just authorized for this trainer and OR them
// into isWithinScope alongside the local-assignment scan. Additive only:
// missing/corrupt/foreign-trainer snapshot reads as empty (legacy).
// Staleness is bounded by hydrate-on-login + read-on-mount refreshes.
function trainerSnapshotSchoolIdsFor(ctx) {
  try {
    if (!ctx || ctx.role !== 'trainer' || !ctx.trainerId) return new Set()
    const json = localStorage.getItem(TRAINER_SCOPE_KEY)
    if (!json) return new Set()
    const parsed = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Set()
    if (parsed.trainerId !== ctx.trainerId) return new Set()
    if (!Array.isArray(parsed.schoolIds)) return new Set()
    return new Set(parsed.schoolIds.filter(id => typeof id === 'string' && id !== ''))
  } catch {
    return new Set()
  }
}

function persistTrainerScopeSnapshot(ctx, key, remote) {
  try {
    if (!ctx || ctx.role !== 'trainer' || !ctx.trainerId) return
    if (!Array.isArray(remote) || remote.length === 0) return
    const observed = new Set()
    for (const r of remote) {
      if (!r || typeof r !== 'object') continue
      // Where the _sekolahTrainerIds enrichment is present, only trust
      // rows that actually list this trainer (future-proof; the server
      // currently strips the enrichment, so absent means trusted —
      // the list was already server-filtered for this trainer).
      if (Array.isArray(r._sekolahTrainerIds) && !r._sekolahTrainerIds.includes(ctx.trainerId)) continue
      if (key === 'sekolah') {
        if (typeof r.id === 'string' && r.id !== '') observed.add(r.id)
      } else if (key === 'siswa' || key === 'sppPayments' || key === 'eksternal' || key === 'absensi' || key === 'raport') {
        if (typeof r.sekolahId === 'string' && r.sekolahId !== '') {
          observed.add(r.sekolahId)
        } else if ((key === 'sppPayments' || key === 'raport') && typeof r.siswaId === 'string' && r.siswaId !== '') {
          // sppPayments/raport rows scoped via the siswa hop may carry
          // only siswaId: resolve through the local siswa cache (already
          // server-synced for this trainer by hydrate order).
          const sw = readCollection('siswa').find(s => s && s.id === r.siswaId)
          if (sw && typeof sw.sekolahId === 'string' && sw.sekolahId !== '') observed.add(sw.sekolahId)
        }
      } else {
        continue
      }
    }
    if (observed.size === 0) return
    let existing = new Set()
    try {
      const raw = localStorage.getItem(TRAINER_SCOPE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          && parsed.trainerId === ctx.trainerId && Array.isArray(parsed.schoolIds)) {
          for (const id of parsed.schoolIds) {
            if (typeof id === 'string' && id !== '') existing.add(id)
          }
        }
        // Trainer switch: start fresh (never union across trainers).
      }
    } catch {
      existing = new Set()
    }
    for (const id of observed) existing.add(id)
    const merged = [...existing].slice(0, 500)
    localStorage.setItem(TRAINER_SCOPE_KEY, JSON.stringify({ trainerId: ctx.trainerId, schoolIds: merged, updatedAt: Date.now() }))
  } catch {
    // Best-effort: snapshot must never break the sync path.
  }
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
      case 'absensiPengajar': return schoolIds.has(record.sekolahId) || record.cabangId === ctx.cabangId
      // CS.B.2 (D-CS5) — externals scope by their sekolahId, siswa-style.
      case 'eksternal': return schoolIds.has(record.sekolahId) || record.cabangId === ctx.cabangId
      // Slice 1 Raport — branch-scoped, siswa-style: via the raport's
      // siswa (student hop, then the siswa's school, then direct cabang).
      case 'raport': return studentIds.has(record.siswaId) || schoolIds.has(sekolahIdForRaport(record)) || record.cabangId === ctx.cabangId
      default: return false
    }
  }

  if (ctx.role === 'trainer') {
    if (!ctx.trainerId) return false
    const trainer = readCollection('trainer').find(t => t.id === ctx.trainerId)
    const schoolIds = new Set(trainer?.sekolahIds || [])
    // T2.A.1 fix — OR the server-scope snapshot alongside the local
    // scan so post-wipe readCached keeps server-authorized rows (Data
    // Siswa renders via readCached). Missing snapshot reads as legacy.
    const snapshotIds = trainerSnapshotSchoolIdsFor(ctx)
    const studentIds = new Set(readCollection('siswa').filter(s => schoolIds.has(s.sekolahId) || snapshotIds.has(s.sekolahId)).map(s => s.id))
    switch (key) {
      case 'sekolah': return schoolIds.has(record.id) || snapshotIds.has(record.id) || trainerHasAnyActiveAssignmentToSekolahClient(ctx.trainerId, record.id)
      case 'trainer': return record.id === ctx.trainerId
      case 'absensi': return record.trainerId === ctx.trainerId && (schoolIds.has(record.sekolahId) || snapshotIds.has(record.sekolahId) || trainerHasAnyActiveAssignmentToSekolahClient(ctx.trainerId, record.sekolahId))
      case 'siswa': return schoolIds.has(record.sekolahId) || snapshotIds.has(record.sekolahId) || trainerHasAnyActiveAssignmentToSekolahClient(ctx.trainerId, record.sekolahId)
      case 'sppPayments': return studentIds.has(record.siswaId) || schoolIds.has(record.sekolahId) || snapshotIds.has(record.sekolahId) || trainerHasAnyActiveAssignmentToSekolahClient(ctx.trainerId, record.sekolahId)
      case 'honorPayments': return record.trainerId === ctx.trainerId
      case 'invoices': return false
      // BUG2 (D-BUG2) — read scope is ownership-only, matching the server
      // authorize read lane (trainerOwnsRecord, no assignment-date gate):
      // history must survive deleted/deactivated/edited assignments. The
      // assignment gate stays on the WRITE path (authorize.php).
      case 'absensiPengajar': return record.trainerId === ctx.trainerId
      // CS.B.2 (D-CS5) — trainers read externals in assigned schools
      // (reference-only for the attendance picker).
      case 'eksternal': return schoolIds.has(record.sekolahId) || snapshotIds.has(record.sekolahId) || trainerHasAnyActiveAssignmentToSekolahClient(ctx.trainerId, record.sekolahId)
      // Slice 1 Raport — scope via the raport's siswa's school (the
      // record carries no trainerId): siswa hop, legacy links, server
      // snapshot, then live assignment — mirroring the siswa case above.
      case 'raport': {
        const rptSekolahId = sekolahIdForRaport(record)
        return studentIds.has(record.siswaId) || schoolIds.has(rptSekolahId) || snapshotIds.has(rptSekolahId) || trainerHasAnyActiveAssignmentToSekolahClient(ctx.trainerId, rptSekolahId)
      }
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
    users: `${STORE_KEY}_users`,
    eksternal: `${STORE_KEY}_eksternal`,
    // Lane-2 e2e#1 fix: absensiPengajar was readable (READABLE_SERVER_KEYS)
    // but had no key here, so every read/write serialized under a literal
    // "undefined" localStorage key (Boot's no-foreign-keys assertion).
    // Stale "undefined" rows in old browsers are inert — login hydrate
    // repopulates this key from the server.
    absensiPengajar: `${STORE_KEY}_absensiPengajar`,
    // Slice 1 Raport (2026-10-03) — raport semester per siswa.
    raport: `${STORE_KEY}_raport`,
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

export function clearSessionCache() {
  for (const key of READABLE_SERVER_KEYS) {
    localStorage.removeItem(getKeys()[key])
  }
  try { localStorage.removeItem(TRAINER_SCOPE_KEY) } catch { /* inert */ }

  notifyStoreChanged()
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
  const ctx = getRoleContext()
  if (!ctx.role) return []
  const parsed = readCollection(key)
  return ctx.role !== 'superadmin' ? parsed.filter(r => isWithinScope(key, r, ctx)) : parsed
}

export async function read(key) {
  const ctx = getRoleContext()
  if (!ctx.role) return []

  if (!READABLE_SERVER_KEYS.has(key)) return readCached(key)

  try {
    const remote = await apiRequest(
      `/api/read.php?entity=${encodeURIComponent(key)}`,
      { method: 'GET' }
    )

    if (!Array.isArray(remote)) {
      throw new Error(`read ${key}: invalid response`)
    }

    // DC.B.3 (D-DC1) — no pending overlay: every write is direct, so
    // the server list is the whole truth.
    const merged = [...remote]

    writeRaw(key, merged)
    notifyStoreChanged()

    // D-T2-1 (F-T2-1 fix) — trainer role trusts the server-filtered
    // remote array directly: the server scope (authorize.php + read.php
    // DB assignments) is authoritative, and re-filtering here against
    // the possibly-stale local trainer cache drops cross-record rows
    // (read('trainer') is own-record-only).
    // T2.A.1 fix — persist the privacy-safe schoolIds snapshot from
    // this server-authorized batch so post-wipe readCached (the Data
    // Siswa render path) keeps the rows. No trainer-record merge
    // (own-only privacy preserved). No privilege change.
    if (ctx.role === 'trainer') {
      persistTrainerScopeSnapshot(ctx, key, merged)
      return merged
    }

    return merged.filter(record => isWithinScope(key, record, ctx))
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      writeRaw(key, [])
      notifyStoreChanged()
      return []
    }

    return readCached(key)
  }
}

export function subscribeStore(listener) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(STORE_EVENT, listener)
  return () => window.removeEventListener(STORE_EVENT, listener)
}

export async function hydrateServerData() {
  // D-T2-1 (F-T2-1 fix) — trainer row first so the remaining reads land
  // on a fresh trainer cache; trainer-role read() trusts server scope.
  await read('trainer')
  await Promise.all([...READABLE_SERVER_KEYS].filter(key => key !== 'trainer').map(key => read(key)))
  migrateSiswaFoto()
}

export function migrateSiswaFoto() {
  const state = getMigrationState()
  if (state.siswaFotoPurgedAt) return
  const records = readRaw('siswa')
  if (!Array.isArray(records) || records.length === 0) {
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
}

// ============================================
// M4.1 — WRITE ADAPTER UNTUK MASTER-DATA ENTITY
// ============================================
// TA.B.4 — 'absensiPengajar' registered so correctLedgerEntry()
// (already generic, unchanged) can POST corrections to
// /api/absensiPengajar.php's new 'correct' action.
const WRITE_ENDPOINTS = {
  trainer: '/api/trainer.php',
  siswa: '/api/siswa.php',
  cabang: '/api/cabang.php',
  sekolah: '/api/sekolah.php',
  users: '/api/users.php',
  invoices: '/api/invoices.php',
  honorPayments: '/api/honorPayments.php',
  // DC.B.1/DC.B.2 (D-DC1) — queue dropped: every ledger writer goes
  // direct through writeRemote (create) or apiRequest custom actions
  // (absensi update/verify/certify, honorPayments append — see endpoints).
  absensi: '/api/absensi.php',
  sppPayments: '/api/sppPayments.php',
  // CS.B.2 (D-CS5) — external-person master-data writes.
  eksternal: '/api/eksternal.php',
  // TA.B.2 fix — self-submit absensi tenaga pengajar langsung sync,
  // bukan lewat antrian manual (queueSync/syncPending). Sebelumnya
  // upsert() cuma nge-queue lokal; kalau belum di-flush manual, admin
  // yang nyoba koreksi record itu dari sesi lain dapet 422 "Record
  // asli tidak ditemukan" karena beneran belum ada di database.
  // Korelasinya jadi konsisten juga sama correctLedgerEntry() yang
  // MEMANG udah langsung POST (bukan queue) buat koreksi entity ini.
  absensiPengajar: '/api/absensiPengajar.php',
  // Slice 1 Raport (2026-10-03) — raport semester per siswa.
  raport: '/api/raport.php',
}

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

    // CS.B.2 (D-CS5) — same cabangId authority as sekolah: admin_cabang
    // never sends it (server forces from session), superadmin explicit.
    case 'eksternal':
      if (role === 'admin_cabang') delete copy.cabangId
      return copy

    case 'trainer':
      delete copy.cabangId
      return copy

    case 'siswa':
      delete copy.cabangId
      return copy

    // Slice 1 Raport — Task 3 handoff (binding): raport.php 422s a
    // client-sent cabangId for admin_cabang AND trainer (the branch is
    // derived server-side from siswaId → sekolah.cabang_id); superadmin
    // create states it explicitly (sekolah/eksternal pattern).
    // _sekolahTrainerIds is a read.php server enrichment, never a client
    // claim — strip it so a read-then-write roundtrip cannot forward a
    // forged key into authorize/storage (server strips it too).
    case 'raport':
      if (role === 'admin_cabang' || role === 'trainer') delete copy.cabangId
      delete copy._sekolahTrainerIds
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

export async function writeRemote(key, record, extraBody = null) {
  const url = WRITE_ENDPOINTS[key]
  if (!url) throw new Error(`writeRemote: entitas "${key}" belum punya endpoint server`)

  const ctx = getRoleContext()
  const sanitized = prepareWritePayload(key, record, ctx)
  const extra = extraBody != null && typeof extraBody === 'object' ? extraBody : {}

  const isUpdate = record.id != null && readRaw(key).some(r => r.id === record.id)

  try {
    const result = await apiRequest(url, {
      method: 'POST',
      // CS.A.2 — extra body keys (e.g. slotPicks) ride to the server only;
      // the local cache merge below uses `record` + server echo, so extras
      // never pollute stored payloads (Part 2 R8).
      body: isUpdate ? { ...sanitized, ...extra, action: 'update' } : { ...sanitized, ...extra, action: 'create' },
    })
    const merged = { ...record, ...result }
    const records = readRaw(key)
    const idx = records.findIndex(r => r.id === merged.id)
    if (idx >= 0) records[idx] = { ...records[idx], ...merged }
    else records.push(merged)
    writeRaw(key, records)
    notifyStoreChanged()
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
    if (key === 'invoices' && error instanceof ApiError && error.status === 422 && error.body?.error === 'Invoice sudah memiliki pembayaran dan tidak dapat dihapus') {
      return { status: 'guarded', message: error.message }
    }
    throw error
  }
}

export async function correctLedgerEntry(key, originalRecord, correctionRecord) {
  const url = WRITE_ENDPOINTS[key]
  if (!url) throw new Error(`correctLedgerEntry: entitas "${key}" belum punya endpoint server`)

  try {
    const result = await apiRequest(url, {
      method: 'POST',
      body: { record: correctionRecord, correctionOf: originalRecord.id, action: 'correct' },
    })
    const records = readRaw(key)
records.push({ ...correctionRecord, correctionOf: originalRecord.id, ...result })
writeRaw(key, records)
    notifyStoreChanged()
    return { status: 'ok', id: result.id }
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return { status: 'forbidden', message: error.message }
    }
    throw error
  }
}

// DC.B.3 (D-DC1) — queue removed: the LEDGER SYNC LAYER
// (queueSync/syncPending/sync-log) is deleted. Every ledger writer posts
// direct (writeRemote / apiRequest custom actions); the server
// /api/sync.php endpoint is retained legacy-only for old cached clients.


export async function pullRemote(key) {
  if (!READABLE_SERVER_KEYS.has(key)) return false

  try {
    const remote = await apiRequest(
      `/api/read.php?entity=${encodeURIComponent(key)}`,
      { method: 'GET' }
    )

    if (!Array.isArray(remote)) return false

    // DC.B.3-fix (D-DC1 follow-up): no pending overlay — the sync-log
    // helpers are deleted, so overlaying would throw (caught below as a
    // silent false, leaving stale cache). Server list is the whole truth.
    writeRaw(key, [...remote])
    notifyStoreChanged()

    return true
  } catch {
    return false
  }
}

// ============================================
// SETTINGS (settings: { logoUrl, title })
// ============================================

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