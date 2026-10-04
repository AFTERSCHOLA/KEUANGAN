import { useMemo, useState, useEffect, useCallback } from 'react'
import { apiRequest } from '../../lib/api.js'
import { readCached, getRoleContext, subscribeStore, getUiState, setUiState } from '../../lib/store.js'
import { localDateString } from '../../lib/constants.js'
import { buildDailyTimetable, dayNameForTanggal, penugasanInvolvesTrainer, coverMarksForRows } from '../../lib/penugasan.js'
import { exportJadwalPenugasanCSV } from '../../lib/csv.js'
import PrintButton from '../../components/PrintButton.jsx'

// Slice 3 — helper tanggal lokal (tanpa UTC shift, meniru localDateString).
// Semua view (Harian/Mingguan/Kalender) reuse buildDailyTimetable per
// tanggal; tidak ada join/agregasi baru.
function parseISODate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mondayOfWeekISO(iso) {
  const d = parseISODate(iso)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return formatISODate(d)
}

function addDaysISO(iso, n) {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + n)
  return formatISODate(d)
}

function monthLabel(iso) {
  const [y, m] = String(iso).split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
}

const WEEKDAY_SHORT = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

// PG.B.1 (F-PG2; D-PG4, D-PG5, D-PG7, D-PG8) — date-driven daily timetable.
// Read-only derived view over trainer.penugasanPengajar[] ×
// sekolah.jadwalList[]; no writes here. Table idiom mirrors
// TrainerAttendanceAdmin.jsx:153-210, classNames verbatim; date input
// mirrors TrainerAttendanceForm.jsx:52-56 (default today, change
// re-derives). Past/future dates resolve against current state
// (no snapshots, matrix analog D-TA16).
export default function PenugasanTimetable() {
  const ctx = getRoleContext()
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick(t => t + 1), [])
  useEffect(() => subscribeStore(bump), [bump])

  // P3 — bell deep-link anchor: App.setActiveTab('jadwalPenugasan',
  // {iso}) persists jadwalTanggal in uiState; the kalenderNonce remount
  // re-reads it here. Invalid/missing falls back to today (safeTanggal
  // guards the cleared-input "" case below). Reuses openDayInHarian
  // for in-view day jumps; no new route/id.
  const [tanggal, setTanggal] = useState(() => {
    const s = getUiState().jadwalTanggal
    return /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : localDateString()
  })

  // Slice 3 — Harian/Mingguan/Kalender. Persisted seperti overviewMode
  // Slice 2; default Harian bila unset/tak dikenal.
  const [view, setViewState] = useState(() => {
    const v = getUiState().jadwalView
    return v === 'mingguan' || v === 'kalender' ? v : 'harian'
  })
  function setView(v) {
    setViewState(v)
    setUiState({ jadwalView: v })
  }

  // readCached is already role-scoped; trainer rows are narrowed to self
  // below (R-TA6: personal scope), admins keep the scoped set as-is.
  const sekolah = useMemo(() => readCached('sekolah'), [tick])
  const trainers = useMemo(() => readCached('trainer'), [tick])
  // T2.D.2-final (F-T2-11; D-T2-7) — externals read reference-only (same
  // idiom as PenugasanManager/EksternalManager; no login for externals,
  // no new keys). Without this the D.2 external ids below resolve
  // trainer-only and render `Trainer tidak ditemukan` / `Memuat...`.
  const eksternal = useMemo(() => readCached('eksternal'), [tick])
  const trainerById = useMemo(() => new Map(trainers.map(t => [t.id, t])), [trainers])
  const eksternalById = useMemo(() => new Map((eksternal || []).map(e => [e && e.id, e])), [eksternal])

  // State tambahan buat nama trainer lintas-cabang yang di-resolve dari server
  const [crossScopeNames, setCrossScopeNames] = useState({}) // { [id]: nama }
  const [lookupAttempted, setLookupAttempted] = useState({})

  const rows = useMemo(() => {
    const all = buildDailyTimetable({ trainers, sekolah, tanggal })
    if (ctx.role === 'trainer' && ctx.trainerId) {
      // DC.C.2 — union scope: a 2nd assistant sees their own sessions.
      return all.filter(r => penugasanInvolvesTrainer(r, ctx.trainerId))
    }
    return all
  }, [trainers, sekolah, tanggal, ctx.role, ctx.trainerId])

  // Slice 3 — jangkar aman untuk derivasi minggu/bulan: input date
  // yang dikosongkan menghasilkan "" (Invalid Date bila di-parse) —
  // fallback ke hari ini agar Mingguan/Kalender tidak crash.
  const safeTanggal = /^\d{4}-\d{2}-\d{2}$/.test(tanggal) ? tanggal : localDateString()

  // Slice 3 — tanggal-tanggal yang terlihat per view. Harian: jangkar
  // saja; Mingguan: Senin–Minggu pada minggu jangkar; Kalender: semua
  // hari pada bulan jangkar.
  const visibleDates = useMemo(() => {
    if (view === 'mingguan') {
      const monday = mondayOfWeekISO(safeTanggal)
      return [0, 1, 2, 3, 4, 5, 6].map(i => addDaysISO(monday, i))
    }
    if (view === 'kalender') {
      const [y, m] = String(safeTanggal).split('-').map(Number)
      const count = new Date(y, m, 0).getDate()
      const out = []
      for (let d = 1; d <= count; d++) {
        out.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
      }
      return out
    }
    return [tanggal]
  }, [view, tanggal, safeTanggal])

  // Slice 3 — join yang sama per tanggal terlihat (scope trainer ikut,
  // meniru filter `rows` di atas). Keyed by iso agar Mingguan/Kalender
  // tidak menghitung ulang join Harian.
  const rowsByDate = useMemo(() => {
    const map = {}
    for (const iso of visibleDates) {
      if (iso === tanggal) {
        map[iso] = rows
        continue
      }
      const all = buildDailyTimetable({ trainers, sekolah, tanggal: iso })
      map[iso] = (ctx.role === 'trainer' && ctx.trainerId)
        ? all.filter(r => penugasanInvolvesTrainer(r, ctx.trainerId))
        : all
    }
    return map
  }, [visibleDates, rows, trainers, sekolah, ctx.role, ctx.trainerId])

  // Slice 3 — cover marks per hari (semantik cover harian, sama seperti
  // tampilan Harian sebelum slice ini).
  const marksByDate = useMemo(() => {
    const map = {}
    for (const iso of visibleDates) map[iso] = coverMarksForRows(rowsByDate[iso] || [])
    return map
  }, [visibleDates, rowsByDate])

  const allVisibleRows = useMemo(
    () => visibleDates.flatMap(iso => rowsByDate[iso] || []),
    [visibleDates, rowsByDate]
  )

  useEffect(() => {
  const missingIds = [...new Set(
    allVisibleRows
      // DC.C.2 — resolve 2nd-assistant names too.
      .flatMap(r => [r.trainerId, r.asistenId, ...(Array.isArray(r.asistenIds) ? r.asistenIds : [])])
      .filter(id =>
        id &&
        !trainerById.has(id) &&
        // T2.D.2-final — externals resolve from the local cache (never a
        // trainer-name lookup; mirrors PenugasanManager).
        !eksternalById.has(id) &&
        !crossScopeNames[id] &&
        !lookupAttempted[id]
      )
  )]

  if (missingIds.length === 0) return

  setLookupAttempted(prev => {
    const next = { ...prev }
    missingIds.forEach(id => {
      next[id] = true
    })
    return next
  })

  apiRequest(
    `/api/trainer-name-lookup.php?ids=${missingIds.join(',')}`,
    { method: 'GET' }
  )
    .then(results => {
      const next = { ...crossScopeNames }

      results.forEach(r => {
        next[r.id] = r.nama
      })

      setCrossScopeNames(next)
    })
    .catch(() => {})
}, [allVisibleRows, trainerById, eksternalById, crossScopeNames, lookupAttempted])

  const hari = dayNameForTanggal(tanggal)

  // BUG8 (D-BUG8) — cover marks shared by the table and the CSV export.
  // Slice 3: tampilan Harian memakai marks tanggal jangkar; Mingguan
  // memakai marks per hari dari marksByDate.
  const coverMarks = marksByDate[tanggal] || { isCoverRow: () => false, coveredBy: () => [] }
  // T2.D.2-final (F-T2-11; D-T2-7) — external label mirrors the manager
  // picker union: same cached record, pinned ` (Eksternal)` suffix
  // (PLAN §4). Reference-only; host/trainer resolution is untouched.
  function eksternalLabel(id) {
    const nama = eksternalById.get(id)?.nama
    return nama ? `${nama} (Eksternal)` : undefined
  }
  function trainerName(id) {
    return trainerById.get(id)?.nama || eksternalLabel(id) || crossScopeNames[id] || 'Trainer tidak ditemukan'
  }
  // DC.C.2 union display mirrors the manager table; the fallback stays
  // per-surface (`Memuat...` in cells, `Trainer tidak ditemukan` in CSV).
  function asistenName(id, fallback) {
    return trainerById.get(id)?.nama || eksternalLabel(id) || crossScopeNames[id] || fallback
  }
  function trainerCellText(r, marks = coverMarks) {
    const base = trainerName(r.trainerId)
    if (marks.isCoverRow(r)) return `${base} (Pengganti)`
    const subs = marks.coveredBy(r)
    if (subs.length > 0) return `${base} (Digantikan oleh ${subs.map(trainerName).join(', ')})`
    return base
  }

  // Slice 3 — satu baris sesi, dipakai Harian dan Mingguan (marks
  // per hari diteruskan pemanggil).
  function renderSessionRow(r, marks, key) {
    return (
      <tr key={key} className="hover:bg-slate-50/50 transition">
        <td className="py-4 px-6 font-bold text-slate-800">{r.sekolahNama}</td>
        <td className="py-4 px-6 font-semibold text-slate-600">
          {trainerCellText(r, marks)}
          {marks.isCoverRow(r) && (
            <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Pengganti</span>
          )}
          {marks.coveredBy(r).length > 0 && (
            <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Digantikan</span>
          )}
        </td>
        <td className="py-4 px-6 font-semibold text-slate-600">{[r.asistenId, ...(Array.isArray(r.asistenIds) ? r.asistenIds : [])].filter(Boolean).length ? [r.asistenId, ...(Array.isArray(r.asistenIds) ? r.asistenIds : [])].filter(Boolean).map(id => asistenName(id, 'Memuat...')).join(', ') : '—'}</td>
        <td className="py-4 px-6 font-semibold text-slate-600">{r.waktu}</td>
      </tr>
    )
  }

  // PG.C.1 (D-PG6, D-PG7) — export payload mirrors the visible table
  // exactly (same filtered array + same name resolution); scope filtered
  // upstream, so the file can never contain rows the table hides.
  // P2 — shared row builder so Harian and visible-view exports resolve
  // names identically (trainer cover marks passed per-day by callers).
  function buildDisplayRow(r, marks) {
    return {
    sekolah: r.sekolahNama,
    trainer: trainerCellText(r, marks),
    // DC.C.2 — union display mirrors the manager table.
    asisten: [r.asistenId, ...(Array.isArray(r.asistenIds) ? r.asistenIds : [])].filter(Boolean).length
      ? [r.asistenId, ...(Array.isArray(r.asistenIds) ? r.asistenIds : [])].filter(Boolean).map(id => asistenName(id, 'Trainer tidak ditemukan')).join(', ')
      : '—',
    waktu: r.waktu,
    }
  }

  const displayRows = useMemo(() => rows.map(r => buildDisplayRow(r, coverMarks)),
    [rows, trainerById, eksternalById, crossScopeNames, coverMarks])

  // P2 — CSV parity for the visible view: Harian exports the anchor day;
  // Mingguan/Kalender flatten the visible dates with per-row Tanggal so
  // the file matches the stacked tbody dates / kalender cells (csv.js
  // prefers r.tanggal over the filename label).
  const displayRowsForView = useMemo(() => {
    if (view === 'harian') return displayRows
    return visibleDates.flatMap(iso => (rowsByDate[iso] || []).map(r => ({
      ...buildDisplayRow(r, marksByDate[iso]),
      tanggal: iso,
    })))
  }, [view, displayRows, visibleDates, rowsByDate, marksByDate, trainerById, eksternalById, crossScopeNames, coverMarks])

  // Slice 3 — rentang minggu jangkar (dipakai subtitle + label file CSV).
  const weekStart = mondayOfWeekISO(safeTanggal)
  const weekEnd = addDaysISO(weekStart, 6)

  function handleExportCSV() {
    // P2 — filename label per view.
    const label = view === 'mingguan'
      ? `${weekStart}_s.d._${weekEnd}`
      : view === 'kalender'
        ? safeTanggal.slice(0, 7)
        : tanggal
    exportJadwalPenugasanCSV(displayRowsForView, label)
  }

  // Slice 3 — label ringkas per view untuk header.
  const viewSubtitle = view === 'mingguan'
    ? <>Minggu: <b>{weekStart}</b> s.d. <b>{weekEnd}</b></>
    : view === 'kalender'
      ? <>Bulan: <b>{monthLabel(safeTanggal)}</b></>
      : <>Tanggal: <b>{tanggal}</b>{hari ? ` · ${hari}` : ''}</>

  // Slice 3 — Kalender: sel kosong pembuka agar tanggal 1 jatuh di
  // kolom hari yang benar (Senin-first).
  const calendarLeading = (() => {
    if (view !== 'kalender') return 0
    const [y, m] = String(safeTanggal).split('-').map(Number)
    return (new Date(y, m - 1, 1).getDay() + 6) % 7
  })()

  function openDayInHarian(iso) {
    setTanggal(iso)
    setView('harian')
  }

  return (
    // PG.C.2 (D-PG6): printable-report root + no-print toolbar (print.css).
    // Title + Tanggal + table print; picker + export/print buttons don't.
    <div className="space-y-6 animate-fadeIn printable-report">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Jadwal Penugasan</h2>
          <p className="text-xs text-slate-500">{viewSubtitle}</p>
        </div>
        <div className="flex items-end gap-2 no-print">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Tampilan</label>
            <div role="group" aria-label="Tampilan jadwal" className="flex mt-1 rounded-lg border overflow-hidden">
              {[['harian', 'Harian'], ['mingguan', 'Mingguan'], ['kalender', 'Kalender']].map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={`text-sm font-semibold px-4 py-2.5 transition-colors ${view === v ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Tanggal</label>
            <input
              type="date"
              value={tanggal}
              onChange={e => setTanggal(e.target.value)}
              className="block mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            onClick={handleExportCSV}
            className="rounded-xl bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 hover:bg-emerald-700 transition-colors"
          >
            Unduh CSV
          </button>
          <PrintButton />
        </div>
      </div>

      {view === 'kalender' ? (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border p-4">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
            {WEEKDAY_SHORT.map(d => <div key={d} className="py-2">{d.slice(0, 3)}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: calendarLeading }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-20 rounded-lg bg-slate-50/50" />
            ))}
            {visibleDates.map(iso => {
              const dayRows = rowsByDate[iso] || []
              const shown = dayRows.slice(0, 3)
              return (
                <button
                  key={iso}
                  type="button"
                  data-testid="kalender-hari"
                  data-tanggal={iso}
                  onClick={() => openDayInHarian(iso)}
                  className={`min-h-20 rounded-lg border p-1.5 text-left align-top transition hover:border-blue-400 ${iso === tanggal ? 'border-blue-500 bg-blue-50/50' : 'border-slate-100 bg-white'}`}
                >
                  <span className="text-xs font-extrabold text-slate-500">{Number(iso.slice(8, 10))}</span>
                  <span className="mt-1 space-y-1 block">
                    {shown.map((r, idx) => (
                      <span key={`${r.assignmentId || r.trainerId}-${r.sekolahId}-${idx}`} className="block truncate text-[11px] font-semibold text-slate-600 bg-slate-100 rounded px-1 py-0.5">
                        {r.waktu} {r.sekolahNama}
                      </span>
                    ))}
                    {dayRows.length > 3 && (
                      <span className="block text-[10px] font-bold text-blue-600 px-1">+{dayRows.length - 3} lagi</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <th className="py-4 px-6">Sekolah</th>
                  <th className="py-4 px-6">Trainer</th>
                  <th className="py-4 px-6">Asisten</th>
                  <th className="py-4 px-6">Waktu</th>
                </tr>
              </thead>
              {view === 'mingguan' ? (
                <>
                  {visibleDates.map(iso => {
                    const dayRows = rowsByDate[iso] || []
                    const dayName = dayNameForTanggal(iso)
                    return (
                      <tbody key={iso} data-tanggal={iso} className="divide-y text-sm">
                        <tr className="bg-slate-50/70">
                          <td colSpan={4} className="py-2.5 px-6 text-xs font-extrabold uppercase tracking-wider text-slate-500">
                            {dayName || ''} · {iso}
                          </td>
                        </tr>
                        {dayRows.map((r, idx) => renderSessionRow(r, marksByDate[iso], `${iso}-${r.assignmentId || r.trainerId}-${r.sekolahId}-${r.waktu}-${idx}`))}
                        {dayRows.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-slate-400">
                              Tidak ada sesi pada {iso}.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    )
                  })}
                </>
              ) : (
                <tbody className="divide-y text-sm">
                  {rows.map((r, idx) => renderSessionRow(r, coverMarks, `${r.assignmentId || r.trainerId}-${r.sekolahId}-${r.waktu}-${idx}`))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400">
                        {/* T2.C.1 (D-T2-4) — empty-state names what was viewed (tanggal + hari), copy-only. */}
                        Tidak ada sesi pada {tanggal}{hari ? ` (${hari})` : ''}.
                      </td>
                    </tr>
                  )}
                </tbody>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
