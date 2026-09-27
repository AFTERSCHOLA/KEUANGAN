import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { newPenugasanRow, validateRowDates, penugasanInvolvesTrainer } from '../penugasan.js'

// CS.A.1 (F-CS1; D-CS1) — slot-pick auto-create revision.
// Client legs pin the picked-triple vocabulary contract (parity with
// server/validation/entities.php PS.A.1 gates); PHP legs pin the
// cover-aware overlap of server/lib/assignments.php through a deterministic
// bridge (pure functions only, no DB). No pick, no row; cover rows never
// conflict with their origin.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const PHP_CASE_RUNNER = [
  "require 'server/lib/assignments.php';",
  "$c = json_decode(getenv('CS_CASE'), true);",
  "$sp = array_key_exists('slotPicks', $c) ? $c['slotPicks'] : null;",
  "$co = isset($c['coverOf']) ? $c['coverOf'] : null;",
  "$rows = missingAssignmentLinks($c['existing'], 'trn-x', array('skl-1'), '2026-09-26', $sp, $co);",
  "echo json_encode(array_values(array_map(function ($r) { unset($r['id']); return $r; }, $rows)));",
].join(' ')

function phpMissingLinks(caseObj) {
  let out
  try {
    out = execFileSync('php', ['-r', PHP_CASE_RUNNER], {
      cwd: repoRoot,
      env: { ...process.env, CS_CASE: JSON.stringify(caseObj) },
      encoding: 'utf8',
    })
  } catch (error) {
    throw new Error(
      'CS.A.1 overlap leg blocked: php CLI unavailable — install PHP to run the assignments.php bridge (taste #56 blocker). Cause: ' +
        (error?.message || String(error)),
    )
  }
  return JSON.parse(out)
}

const VOCAB = [
  { dayOfWeek: 'Rabu', time: '14:15', endTime: '15:15' },
  { dayOfWeek: 'Rabu', time: '16:00', endTime: '17:00' },
  { dayOfWeek: 'Kamis', time: '10:00', endTime: '11:00' },
]

function baseRow() {
  return {
    sekolahId: 'skl-1',
    trainerId: 'trn-x',
    periodeMulai: '2026-09-26',
    sekolahJadwalList: VOCAB,
  }
}

describe('CS.A.1 slot-pick auto-create (COVER_SLOT)', () => {
  it('picked Rabu 14:15-15:15 accepted; newPenugasanRow carries the triple', () => {
    const err = validateRowDates({ ...baseRow(), hari: 'Rabu', jamMulai: '14:15', jamSelesai: '15:15' })
    expect(err).toBeNull()
    const row = newPenugasanRow({ sekolahId: 'skl-1', trainerId: 'trn-x', hari: 'Rabu', jamMulai: '14:15', jamSelesai: '15:15' })
    expect(row).toMatchObject({ hari: 'Rabu', jamMulai: '14:15', jamSelesai: '15:15' })
    const rows = phpMissingLinks({
      existing: [],
      slotPicks: { 'skl-1': [{ hari: 'Rabu', jamMulai: '14:15', jamSelesai: '15:15' }] },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sekolahId: 'skl-1', trainerId: 'trn-x', hari: 'Rabu', jamMulai: '14:15', jamSelesai: '15:15', aktif: true })
  })

  it('out-of-vocabulary time rejected with pinned copy', () => {
    expect(
      validateRowDates({ ...baseRow(), hari: 'Rabu', jamMulai: '14:15', jamSelesai: '16:00' }),
    ).toBe('Hari, jam mulai, dan jam selesai harus merujuk pada jadwal sekolah yang dipilih.')
  })

  it('legacy row without triple accepted as unscoped (Semua slot)', () => {
    expect(validateRowDates({ sekolahId: 'skl-1', trainerId: 'trn-x', periodeMulai: '2026-09-26' })).toBeNull()
    const row = newPenugasanRow({ sekolahId: 'skl-1', trainerId: 'trn-x' })
    expect(row.hari).toBeNull()
    expect(row.jamMulai).toBeNull()
    expect(row.jamSelesai).toBeNull()
    const rows = phpMissingLinks({ existing: [] })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sekolahId: 'skl-1', aktif: true })
    expect(rows[0].hari ?? null).toBeNull()
  })

  it('no pick, no row: empty picks create nothing', () => {
    expect(phpMissingLinks({ existing: [], slotPicks: { 'skl-1': [] } })).toEqual([])
    expect(phpMissingLinks({ existing: [], slotPicks: {} })).toEqual([])
  })

  it('overlap helper skips when an overlapping active row exists', () => {
    const existing = [
      { id: 'pgs-old', sekolahId: 'skl-1', trainerId: 'trn-x', asistenId: null, periodeMulai: '2026-01-01', periodeSelesai: null, aktif: true },
    ]
    expect(phpMissingLinks({ existing })).toEqual([])
    expect(
      phpMissingLinks({
        existing,
        slotPicks: { 'skl-1': [{ hari: 'Rabu', jamMulai: '14:15', jamSelesai: '15:15' }] },
      }),
    ).toEqual([])
  })

  it('overlap helper ignores the cover origin pair (coverOf), but blocks without the link', () => {
    const origin = { id: 'pgs-origin', sekolahId: 'skl-1', trainerId: 'trn-y', asistenId: null, periodeMulai: '2026-01-01', periodeSelesai: null, aktif: true }
    const linked = phpMissingLinks({
      existing: [origin],
      slotPicks: { 'skl-1': [null] },
      coverOf: 'pgs-origin',
    })
    expect(linked).toHaveLength(1)
    expect(linked[0]).toMatchObject({ coverOf: 'pgs-origin', hari: null })
    expect(
      phpMissingLinks({ existing: [origin], slotPicks: { 'skl-1': [null] } }),
    ).toEqual([])
  })

  it('DC.C.1 union: trainerId, legacy asistenId, and asistenIds positions all match', () => {
    const row = {
      sekolahId: 'skl-1', trainerId: 'trn-i', asistenId: 'trn-a0',
      asistenIds: ['trn-a1', 'trn-a2'], periodeMulai: '2026-01-01', aktif: true,
    }
    expect(penugasanInvolvesTrainer(row, 'trn-i')).toBe(true)
    expect(penugasanInvolvesTrainer(row, 'trn-a0')).toBe(true)
    expect(penugasanInvolvesTrainer(row, 'trn-a1')).toBe(true)
    expect(penugasanInvolvesTrainer(row, 'trn-a2')).toBe(true)
    expect(penugasanInvolvesTrainer(row, 'trn-stranger')).toBe(false)
    expect(penugasanInvolvesTrainer(row, '')).toBe(false)
    expect(penugasanInvolvesTrainer(row, null)).toBe(false)
  })

  it('DC.C.1 union: legacy rows without asistenIds match exactly as before', () => {
    const legacy = { sekolahId: 'skl-1', trainerId: 'trn-i', asistenId: null, periodeMulai: '2026-01-01', aktif: true }
    expect(penugasanInvolvesTrainer(legacy, 'trn-i')).toBe(true)
    expect(penugasanInvolvesTrainer(legacy, 'trn-a0')).toBe(false)
    expect(penugasanInvolvesTrainer(null, 'trn-i')).toBe(false)
  })

  it('same scoped triple skips; different scoped triple creates', () => {
    const scoped = {
      id: 'pgs-a', sekolahId: 'skl-1', trainerId: 'trn-x', asistenId: null, coverOf: null,
      hari: 'Rabu', jamMulai: '14:15', jamSelesai: '15:15', periodeMulai: '2026-01-01', periodeSelesai: null, aktif: true,
    }
    expect(
      phpMissingLinks({
        existing: [scoped],
        slotPicks: { 'skl-1': [{ hari: 'Rabu', jamMulai: '14:15', jamSelesai: '15:15' }] },
      }),
    ).toEqual([])
    const other = phpMissingLinks({
      existing: [scoped],
      slotPicks: { 'skl-1': [{ hari: 'Rabu', jamMulai: '16:00', jamSelesai: '17:00' }] },
    })
    expect(other).toHaveLength(1)
    expect(other[0]).toMatchObject({ hari: 'Rabu', jamMulai: '16:00', jamSelesai: '17:00' })
  })
})
