const STORE_KEY = 'afterschola_v4'

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
    settings: `${STORE_KEY}_settings`,
  }
}

export function read(key) {
  const keys = getKeys()
  const json = localStorage.getItem(keys[key])
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    const ctx = getRoleContext()
    return ctx.role === 'trainer' ? parsed.filter(r => isWithinScope(key, r, ctx)) : parsed
  } catch {
    return []
  }
}

export function write(key, records) {
  const keys = getKeys()
  const ctx = getRoleContext()
  let out = records
  if (ctx.role === 'trainer' && Array.isArray(records)) {
    out = records.filter(r => isWithinScope(key, r, ctx))
  }
  localStorage.setItem(keys[key], JSON.stringify(out))
}

export function upsert(key, record) {
  const ctx = getRoleContext()
  if (ctx.role === 'trainer' && !isWithinScope(key, record, ctx)) return
  const records = read(key)
  const idx = records.findIndex(r => r.id === record.id)
  if (idx >= 0) {
    records[idx] = { ...records[idx], ...record }
  } else {
    records.push(record)
  }
  write(key, records)
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
import React, { createContext, useContext, useState, useCallback } from 'react'
import { periodeKey, periodeFromDate, calYear, defaultAcademicYear, defaultMonth } from './constants'

const PeriodContext = createContext(null)

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