import { useMemo, useEffect, useState, useCallback } from 'react'
import { readCached, usePeriod, subscribeStore, read } from '../../lib/store.js'
import { buildTrainerMatrix, formatMatrixCell } from '../../lib/trainerAttendance.js'
import { exportRekapMatrixCSV, exportRekapPengajarCSV } from '../../lib/csv.js'
import { requestExportDoc } from '../../lib/exportDoc.js'
import PrintButton from '../../components/PrintButton.jsx'

// TA.C.2 (F-TA4, F-TA5; D-TA15; R-TA5, R-TA9, R-TA10) — rekap matriks
// bulanan sekolah × tanggal. Mirrors the TrainerAttendanceAdmin.jsx
// card + table idiom (bg-white rounded-2xl shadow-sm border, slate-50
// thead, overflow-x-auto) — do not invent a new pattern.
//
// R-TA5: the matrix is a derived view built from `absensiPengajar`
// records, never stored. Scope comes free from readCached(): admin
// cabang only receives own-cabang rows (server-enforced), superadmin
// receives all. Cell text: `Nama (I/A)` + optional ` — status,
// keterangan, catatan` (BUG6: admin correction notes visible).
//
// Task-3 — month-grid navigation (PenugasanTimetable kalender idiom).
const HARI_SINGKAT = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

function labelBulan(bulanKey) {
  const [y, m] = String(bulanKey).split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
}

export default function TrainerAttendanceRecap({ filterSekolahId = '' }) {
  const { periodeKey } = usePeriod()
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick(t => t + 1), [])
  useEffect(() => subscribeStore(bump), [bump])

  // Task-3 — local month, defaulted from the global periode ONCE:
  // later global periode changes elsewhere never yank the Rekap month.
  // The matrix memo keys on `bulan`, so table + both CSVs + doc filter
  // all follow the displayed month.
  const [bulan, setBulan] = useState(() => periodeKey())
  // In-place date drill: clicking a grid day filters the matrix table
  // to that single date column (x or re-click clears). Month shifts
  // always clear it — the date belongs to the old month.
  const [tanggalFilter, setTanggalFilter] = useState('')

  function geserBulan(delta) {
    setTanggalFilter('')
    setBulan(b => {
      const [y, m] = String(b).split('-').map(Number)
      const d = new Date(y, m - 1 + delta, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const absensiPengajar = useMemo(() => readCached('absensiPengajar'), [tick])

  useEffect(() => {
  read('absensiPengajar').then(() => setTick(t => t + 1))
}, [])

  const sekolah = useMemo(() => readCached('sekolah'), [tick])
  const trainer = useMemo(() => readCached('trainer'), [tick])

  const matrix = useMemo(
    () => buildTrainerMatrix({ absensiPengajar, sekolah, trainer, periode: bulan }),
    [absensiPengajar, sekolah, trainer, bulan],
  )

  const rows = useMemo(
    () => matrix.rows.filter(r => !filterSekolahId || r.sekolahId === filterSekolahId),
    [matrix, filterSekolahId],
  )

  // Task-3 — per-day entries across the scope-filtered rows feed the
  // grid dots + counts (record counts from cached rows, never names —
  // names already live in the table cells).
  const entriHarian = useMemo(() => {
    const map = {}
    rows.forEach(r => {
      matrix.dates.forEach(d => {
        const list = r.cells[d] || []
        if (list.length > 0) map[d] = (map[d] || []).concat(list)
      })
    })
    return map
  }, [rows, matrix])

  // Task-3 — Monday-first leading blanks (PenugasanTimetable idiom).
  const calendarLeading = (() => {
    const [y, m] = String(bulan).split('-').map(Number)
    return (new Date(y, m - 1, 1).getDay() + 6) % 7
  })()

  // In-place drill column: full month, or the single drilled date.
  const tanggalTampil = tanggalFilter !== '' ? [tanggalFilter] : matrix.dates

  // AP.C.3 (D-AP5) — export payload mirrors the visible cells exactly
  // (same matrix order + same formatMatrixCell text); scope filtered
  // upstream, so the file can never contain rows the table hides.
  const displayRows = useMemo(() => {
    const out = []
    rows.forEach(r => {
      matrix.dates.forEach(d => {
        ;(r.cells[d] || []).forEach(entry => {
          out.push({
            sekolah: r.nama,
            tanggal: d,
            nama: entry.nama,
            peran: entry.label,
            status: entry.status || '',
            keterangan: entry.keterangan || '',
            // BUG6: admin correction notes get their own export column
            // (teks already mirrors them via formatMatrixCell).
            catatan: entry.catatan || '',
            teks: formatMatrixCell(entry),
          })
        })
      })
    })
    return out
  }, [rows, matrix])

  function handleExportCSV() {
    exportRekapPengajarCSV(displayRows, bulan)
  }

  // Task-2 — matrix-shape CSV from the same matrix memo the table renders
  // (scope-filtered rows: never more rows than visible). Flat export above
  // stays untouched.
  function handleExportMatrixCSV() {
    exportRekapMatrixCSV({ periode: matrix.periode, dates: matrix.dates, rows }, bulan)
  }

  // EX.1 — server-owned document (same visible scope: periode + optional
  // school filter travel as filters, rows never leave the server).
  // Existing Cetak/CSV buttons untouched; failures land in the local
  // error line below (R-IP2: parent owns the explanation).
  const [docError, setDocError] = useState('')
  async function handleExportDoc() {
    setDocError('')
    try {
      await requestExportDoc('rekap-pengajar', {
        periode: bulan,
        ...(filterSekolahId ? { sekolahId: filterSekolahId } : {}),
      })
    } catch (e) {
      setDocError(e?.message || 'Gagal membuka dokumen')
    }
  }

  function cellText(entry) {
    // AP.C.2 — single owner in lib/trainerAttendance.js (unit-pinned).
    return formatMatrixCell(entry)
  }

  return (
    <div className="space-y-4 printable-report">
      <div className="bg-white p-4 rounded-2xl shadow-sm border flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800">Rekap Absensi Pengajar</h3>
          <p className="text-xs text-slate-500">
            Periode <b>{bulan}</b> — {rows.length} sekolah
          </p>
        </div>
        <div className="flex items-end gap-2 no-print">
          <button
            onClick={handleExportDoc}
            className="rounded-xl bg-sky-700 text-white text-sm font-semibold px-4 py-2.5 hover:bg-sky-800 transition-colors"
          >
            Unduh Dokumen
          </button>
          <button
            onClick={handleExportCSV}
            className="rounded-xl bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 hover:bg-emerald-700 transition-colors"
          >
            Unduh CSV
          </button>
          <button
            onClick={handleExportMatrixCSV}
            className="rounded-xl bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 hover:bg-emerald-700 transition-colors"
          >
            Unduh CSV Matriks
          </button>
          <PrintButton />
        </div>
      </div>
      {docError !== '' && (
        <p role="alert" className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2">
          {docError}
        </p>
      )}

      {/* Task-3 — month-grid navigation (PenugasanTimetable kalender idiom:
          Monday-first leading blanks, min-h-20 day cells, +N lagi
          overflow, selected-day highlight). Navigation chrome → no-print
          so the Task-1 document/print stays clean. */}
      <div data-testid="rekap-calendar" className="bg-white rounded-2xl shadow-sm overflow-hidden border p-4 no-print">
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => geserBulan(-1)}
            className="rounded-lg bg-slate-100 text-slate-600 text-xs font-bold px-3 py-2 hover:bg-slate-200 transition"
          >
            Bulan lalu
          </button>
          <p className="text-sm font-bold text-slate-800">Bulan: <b>{labelBulan(bulan)}</b></p>
          <button
            type="button"
            onClick={() => geserBulan(1)}
            className="rounded-lg bg-slate-100 text-slate-600 text-xs font-bold px-3 py-2 hover:bg-slate-200 transition"
          >
            Bulan depan
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
          {HARI_SINGKAT.map(d => <div key={d} className="py-2">{d.slice(0, 3)}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: calendarLeading }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-20 rounded-lg bg-slate-50/50" />
          ))}
          {matrix.dates.map(iso => {
            const dayEntries = entriHarian[iso] || []
            const shown = dayEntries.slice(0, 3)
            const aktif = tanggalFilter === iso
            return (
              <button
                key={iso}
                type="button"
                data-testid="rekap-hari"
                data-tanggal={iso}
                onClick={() => setTanggalFilter(t => (t === iso ? '' : iso))}
                className={`min-h-20 rounded-lg border p-1.5 text-left align-top transition hover:border-blue-400 ${aktif ? 'border-blue-500 bg-blue-50/50' : 'border-slate-100 bg-white'}`}
              >
                <span className="text-xs font-extrabold text-slate-500">{Number(iso.slice(8, 10))}</span>
                {dayEntries.length > 0 && (
                  <span className="mt-1 block">
                    <span className="block rounded bg-slate-100 px-1 py-0.5 text-[11px] font-bold text-slate-600">{dayEntries.length} record</span>
                    <span className="mt-1 block">
                      {shown.map((e, idx) => (
                        <span key={`${e.trainerId}-${idx}`} title={cellText(e)} className="mr-0.5 inline-block h-2 w-2 rounded-full bg-emerald-500" />
                      ))}
                      {dayEntries.length > 3 && (
                        <span className="px-1 text-[10px] font-bold text-blue-600">+{dayEntries.length - 3} lagi</span>
                      )}
                    </span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {tanggalFilter !== '' && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-600">Tanggal: <b>{tanggalFilter}</b></span>
            <button
              type="button"
              onClick={() => setTanggalFilter('')}
              aria-label="Hapus filter tanggal"
              className="rounded-lg bg-slate-100 px-2 py-1 font-bold text-slate-500 hover:bg-slate-200 transition"
            >
              ×
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="py-4 px-6 sticky left-0 bg-slate-50">Sekolah</th>
                {tanggalTampil.map(d => (
                  <th key={d} title={d} className="py-4 px-3 text-center min-w-10">
                    {Number(d.slice(8, 10))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {rows.map(r => (
                <tr key={r.sekolahId} className="hover:bg-slate-50/50 transition align-top">
                  <td className="py-4 px-6 font-bold text-slate-800 sticky left-0 bg-white">{r.nama}</td>
                  {tanggalTampil.map(d => (
                    <td key={d} className="py-2 px-3 text-[11px] text-slate-600 min-w-10">
                      {(r.cells[d] || []).map((entry, i) => (
                        <div key={i} className="whitespace-nowrap font-semibold" title={entry.catatan || undefined}>
                          {cellText(entry)}
                        </div>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={tanggalTampil.length + 1} className="py-12 text-center text-slate-400">
                    Belum ada absensi tenaga pengajar untuk periode ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
