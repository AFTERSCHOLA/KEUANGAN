import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  readCached,
  subscribeStore,
  getRoleContext,
  getUiState,
  setUiState,
  useBranch,
  trainerHasAnyActiveAssignmentToSekolahClient,
} from '../lib/store.js'
import { filterEntitiesByBranch } from '../lib/branchScope.js'
import { remindersForTrainer } from '../lib/reminders.js'
import { localDateString } from '../lib/constants.js'

// Branch-linkage pre-filter for the admin/superadmin lane:
// filterEntitiesByBranch narrows `trainer` by sekolahIds[] only, so a
// trainer linked purely via penugasanPengajar would drop out. Keep every
// trainer touching a scoped school through either link; the helper itself
// still gates on aktif + penugasanInvolvesTrainer.
function trainersTouchingSchools(trainers, schoolIds) {
  return trainers.filter(t => {
    if (!t || !t.id) return false
    if (Array.isArray(t.sekolahIds) && t.sekolahIds.some(id => schoolIds.has(id))) return true
    const rows = Array.isArray(t.penugasanPengajar) ? t.penugasanPengajar : []
    return rows.some(a => a && schoolIds.has(a.sekolahId))
  })
}

function emptyReminders() {
  return { today: [], tomorrow: [], counts: { todayUndone: 0, tomorrow: 0, total: 0 } }
}

// Admin/superadmin lane: union per-trainer reminders across the scoped
// trainer set. `done` is OR across trainers (anyone's absensi marks the
// school Selesai); tomorrow entries dedupe by school.
function aggregateForTrainers(trainers, sekolah, absensi, absensiPengajar, nowLocal) {
  const todayMap = new Map()
  const tomorrowMap = new Map()
  for (const t of trainers) {
    if (!t || !t.id) continue
    const r = remindersForTrainer({ trainerId: t.id, sekolah, trainer: t, absensi, absensiPengajar, nowLocal })
    for (const e of r.today) {
      const prev = todayMap.get(e.sekolahId)
      todayMap.set(e.sekolahId, prev ? { ...e, nama: prev.nama, waktu: prev.waktu, done: prev.done || e.done } : e)
    }
    for (const e of r.tomorrow) {
      if (!tomorrowMap.has(e.sekolahId)) tomorrowMap.set(e.sekolahId, e)
    }
  }
  const today = [...todayMap.values()]
  const tomorrow = [...tomorrowMap.values()]
  const todayUndone = today.filter(e => !e.done).length
  return { today, tomorrow, counts: { todayUndone, tomorrow: tomorrow.length, total: todayUndone + tomorrow.length } }
}

function computeReminders(roleCtx, selectedCabangId) {
  const nowLocal = new Date()
  const sekolah = readCached('sekolah')
  const trainerRows = readCached('trainer')
  const absensi = readCached('absensi')
  const absensiPengajar = readCached('absensiPengajar')
  if (roleCtx.role === 'trainer' && roleCtx.trainerId) {
    const trainer = trainerRows.find(t => t.id === roleCtx.trainerId) || null
    // Filter to own scope BEFORE calling the helper (union sekolahIds +
    // active penugasan, mirroring TrainerDashboard.jsx:70-78).
    const own = sekolah.filter(s =>
      (Array.isArray(trainer?.sekolahIds) && trainer.sekolahIds.includes(s.id)) ||
      trainerHasAnyActiveAssignmentToSekolahClient(roleCtx.trainerId, s.id)
    )
    return remindersForTrainer({ trainerId: roleCtx.trainerId, sekolah: own, trainer, absensi, absensiPengajar, nowLocal })
  }
  if (roleCtx.role === 'admin_cabang' || roleCtx.role === 'superadmin') {
    const scopeId = roleCtx.role === 'admin_cabang' ? roleCtx.cabangId : (selectedCabangId || '')
    const entities = filterEntitiesByBranch({
      cabang: readCached('cabang'),
      sekolah,
      siswa: readCached('siswa'),
      trainer: trainerRows,
      absensi,
      absensiPengajar: readCached('absensiPengajar'),
      honorPayments: readCached('honorPayments'),
      sppPayments: readCached('sppPayments'),
      invoices: readCached('invoices'),
    }, scopeId)
    // trainerRows is already role-scoped via readCached; narrow to
    // branch-linked trainers (either link kind) when a branch is selected.
    const schoolIds = new Set(entities.sekolah.map(s => s.id))
    const trainers = scopeId ? trainersTouchingSchools(trainerRows, schoolIds) : trainerRows
    const agg = aggregateForTrainers(trainers, entities.sekolah, entities.absensi, entities.absensiPengajar, nowLocal)
    // H-1 reminders are trainer-only: admins keep today's monitoring,
    // tomorrow stays empty so the bell count excludes Besok.
    return { today: agg.today, tomorrow: [], counts: { todayUndone: agg.counts.todayUndone, tomorrow: 0, total: agg.counts.todayUndone } }
  }
  return emptyReminders()
}

/**
 * In-app H-1/H-day notification bell. Reads the store internally;
 * `onOpenJadwal(ctx)` fires when the user clicks a dated entry or
 * "Lihat Jadwal", with `{iso, view:'harian'}` date context.
 */
export default function NotificationBell({ onOpenJadwal }) {
  const [open, setOpen] = useState(false)
  // Tick + subscribeStore so a pre-hydrate mount re-renders when the sync
  // lands (mirrors TrainerDashboard.jsx:20-22).
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick(t => t + 1), [])
  useEffect(() => subscribeStore(bump), [bump])
  const wrapperRef = useRef(null)
  const { selectedCabangId } = useBranch()

  // Escape/mousedown-outside close mirrors AccountMenu.jsx:19-33.
  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const roleCtx = getRoleContext()
  const reminders = useMemo(
    () => computeReminders(roleCtx, selectedCabangId),
    [tick, roleCtx.role, roleCtx.trainerId, roleCtx.cabangId, selectedCabangId]
  )
  const nowLocal = new Date()
  const todayISO = localDateString(nowLocal)
  const tomorrowISO = localDateString(new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate() + 1))
  // lastSeenReminders controls highlight emphasis only, NEVER the count.
  const hasNew = reminders.counts.total > 0 && getUiState().lastSeenReminders !== todayISO
  const total = reminders.counts.total

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) setUiState({ lastSeenReminders: todayISO })
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Notifikasi"
        className={`relative p-2 rounded-full transition focus:outline-none focus:ring-2 focus:ring-yellow-300 ${hasNew ? 'text-amber-500 hover:text-amber-600' : 'text-slate-500 hover:text-slate-700'}`}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-rose-600 text-white text-[11px] font-bold flex items-center justify-center">
            {total}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notifikasi"
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white shadow-2xl border border-slate-100 overflow-hidden z-50 animate-fadeIn"
        >
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-bold text-slate-800">Jadwal Hari Ini</p>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {reminders.today.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400">Tidak ada sekolah terjadwal hari ini</p>
            ) : (
              reminders.today.map(e => (
                <button
                  key={e.sekolahId}
                  type="button"
                  onClick={() => { setOpen(false); onOpenJadwal?.({ iso: todayISO, view: 'harian' }) }}
                  className="w-full text-left flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-50 transition"
                >
                  <span className="min-w-0 block">
                    <p className="text-sm font-bold text-slate-800 truncate">{e.nama}</p>
                    {e.waktu ? <p className="text-xs text-slate-500">{e.waktu}</p> : null}
                  </span>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${e.done ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {e.done ? 'Selesai' : 'Belum Diisi'}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="px-4 py-3 border-y border-slate-100 bg-slate-50">
            <p className="text-sm font-bold text-slate-800">Jadwal Sekolah Besok</p>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {reminders.tomorrow.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400">Tidak ada sekolah terjadwal besok</p>
            ) : (
              reminders.tomorrow.map(e => (
                <button
                  key={e.sekolahId}
                  type="button"
                  onClick={() => { setOpen(false); onOpenJadwal?.({ iso: tomorrowISO, view: 'harian' }) }}
                  className="w-full text-left flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-50 transition"
                >
                  <span className="min-w-0 block">
                    <p className="text-sm font-bold text-slate-800 truncate">{e.nama}</p>
                    {e.waktu ? <p className="text-xs text-slate-500">{e.waktu}</p> : null}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="p-2">
            <button
              type="button"
              onClick={() => { setOpen(false); onOpenJadwal?.({ iso: todayISO, view: 'harian' }) }}
              className="w-full px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 rounded-lg transition"
            >
              Lihat Jadwal
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
