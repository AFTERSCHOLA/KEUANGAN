import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PENUGASAN_OVERLAP_ERROR } from '../penugasan.js'

// DB.A.1 (F-DB1/F-DB2; D-DB1–D-DB3, D-DB5–D-DB6) — cross-host occupant guard.
// PHP legs pin server/lib/assignments.php findCrossHostConflict() through a
// deterministic bridge (pure function, no DB) mirroring the
// penugasan-slot.test.js BUG7 pattern. Client legs (findCrossHostPair)
// land in DB.A.2; this file holds the server predicate only.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const PHP_CROSS_RUNNER = [
  "require 'server/lib/assignments.php';",
  "$c = json_decode(getenv('DBX_CASE'), true);",
  "echo json_encode(findCrossHostConflict($c['newRows'], $c['foreignRows']));",
].join(' ')

function phpCrossHost(newRows, foreignRows) {
  let out
  try {
    out = execFileSync('php', ['-r', PHP_CROSS_RUNNER], {
      cwd: repoRoot,
      env: { ...process.env, DBX_CASE: JSON.stringify({ newRows, foreignRows }) },
      encoding: 'utf8',
    })
  } catch (error) {
    throw new Error(
      'DB.A.1 overlap leg blocked: php CLI unavailable — install PHP to run the assignments.php bridge (taste #56 blocker). Cause: ' +
        (error?.message || String(error)),
    )
  }
  return JSON.parse(out)
}

const SLOT = { hari: 'Rabu', jamMulai: '14:15', jamSelesai: '15:15' }

function row(over = {}) {
  return {
    id: 'pgs-new-1',
    sekolahId: 'skl-1',
    trainerId: 'trn-a',
    asistenId: null,
    asistenIds: null,
    coverOf: null,
    hari: SLOT.hari,
    jamMulai: SLOT.jamMulai,
    jamSelesai: SLOT.jamSelesai,
    periodeMulai: '2026-09-01',
    periodeSelesai: null,
    aktif: true,
    ...over,
  }
}

describe('DB.A.1 cross-host occupant guard (server predicate)', () => {
  it('same person instructor-here + assistant-there, same school+slot+dates -> pinned copy', () => {
    const foreign = [row({ id: 'pgs-foreign-1', trainerId: 'trn-b', asistenId: 'trn-a' })]
    const err = phpCrossHost([row()], foreign)
    expect(err).toBe(PENUGASAN_OVERLAP_ERROR)
  })

  it('same person via second assistant (asistenIds[1]) -> pinned copy', () => {
    const foreign = [row({ id: 'pgs-foreign-2', trainerId: 'trn-b', asistenIds: ['trn-a'] })]
    expect(phpCrossHost([row()], foreign)).toBe(PENUGASAN_OVERLAP_ERROR)
  })

  it('distinct people, same school+slot -> null (occupant reading, not slot-capacity)', () => {
    const foreign = [row({ id: 'pgs-foreign-3', trainerId: 'trn-b', asistenId: 'trn-c' })]
    expect(phpCrossHost([row()], foreign)).toBeNull()
  })

  it('cover-linked cross-host pair never blocks, either direction', () => {
    const origin = row({ id: 'pgs-origin-1', trainerId: 'trn-b' })
    const cover = row({ id: 'pgs-cover-1', trainerId: 'trn-a', coverOf: 'pgs-origin-1' })
    expect(phpCrossHost([cover], [origin])).toBeNull()
    expect(phpCrossHost([origin], [cover])).toBeNull()
  })

  it('same person, disjoint date ranges -> null', () => {
    const foreign = [row({ id: 'pgs-foreign-4', trainerId: 'trn-b', asistenId: 'trn-a', periodeMulai: '2026-01-01', periodeSelesai: '2026-06-30' })]
    expect(phpCrossHost([row({ periodeMulai: '2026-09-01' })], foreign)).toBeNull()
  })

  it('same person, one side inactive -> null', () => {
    const foreign = [row({ id: 'pgs-foreign-5', trainerId: 'trn-b', asistenId: 'trn-a', aktif: false })]
    expect(phpCrossHost([row()], foreign)).toBeNull()
  })

  it('same person, different school -> null (P2 cross-school stays deferred per DOUBLE_BOOKING_PLAN.md §10)', () => {
    const foreign = [row({ id: 'pgs-foreign-6', sekolahId: 'skl-2', trainerId: 'trn-b', asistenId: 'trn-a' })]
    expect(phpCrossHost([row()], foreign)).toBeNull()
  })

  it('unscoped foreign row fans out over a scoped new row -> pinned copy', () => {
    const foreign = [row({ id: 'pgs-foreign-7', trainerId: 'trn-b', asistenId: 'trn-a', hari: null, jamMulai: null, jamSelesai: null })]
    expect(phpCrossHost([row()], foreign)).toBe(PENUGASAN_OVERLAP_ERROR)
  })

  it('different slot scope, same person -> null', () => {
    const foreign = [row({ id: 'pgs-foreign-8', trainerId: 'trn-b', asistenId: 'trn-a', jamMulai: '16:00', jamSelesai: '17:00' })]
    expect(phpCrossHost([row()], foreign)).toBeNull()
  })

  it('same-id pair (edit path) never blocks', () => {
    const foreign = [row({ id: 'pgs-new-1', trainerId: 'trn-b', asistenId: 'trn-a' })]
    expect(phpCrossHost([row()], foreign)).toBeNull()
  })

  it('rows with no attributable occupant never block', () => {
    const foreign = [row({ id: 'pgs-foreign-9', trainerId: null, asistenId: null })]
    expect(phpCrossHost([row({ trainerId: null })], foreign)).toBeNull()
  })

  it('empty foreign set -> null', () => {
    expect(phpCrossHost([row()], [])).toBeNull()
  })
})
