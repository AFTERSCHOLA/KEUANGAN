import { MONTHS, MONTH_KEYS, academicYearLabel } from '../lib/constants.js'

/**
 * Period selector for the page header. Compact horizontal chip group.
 * Uses the same period state as the sidebar used to.
 */
export default function PeriodFilter({ period }) {
  if (!period) return null
  const yearOptions = (() => {
    const base = period.selectedYear
    const years = new Set()
    for (let y = base - 1; y <= base + 4; y++) years.add(y)
    return Array.from(years).sort((a, b) => a - b)
  })()

  const baseSelect =
    'rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600'

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-slate-400">Periode:</span>
      <select
        aria-label="Tahun ajaran"
        value={period.selectedYear}
        onChange={(e) => period.setSelectedYear(Number(e.target.value))}
        className={baseSelect}
      >
        {yearOptions.map((y) => (
          <option key={y} value={y}>
            {academicYearLabel(y)}
          </option>
        ))}
      </select>
      <select
        aria-label="Bulan"
        value={period.selectedMonth}
        onChange={(e) => period.setSelectedMonth(Number(e.target.value))}
        className={baseSelect}
      >
        {MONTHS.map((name, i) => (
          <option key={name} value={Number(MONTH_KEYS[i])}>
            {name}
          </option>
        ))}
      </select>
    </div>
  )
}