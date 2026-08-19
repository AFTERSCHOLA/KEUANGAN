import { read, usePeriod } from '../../lib/store.js'
import { formatRupiah } from '../../lib/format.js'
import { MONTHS, MONTH_KEYS, periodeKey } from '../../lib/constants.js'
import { financialData } from '../../lib/finance.js'
import ExecutiveSummary from '../reports/ExecutiveSummary.jsx'

// M4.2 — Overview graphs (Person 5). Pure SVG/CSS, no chart library.
// R4: every number here comes out of finance.js's financialData(); this
// file only formats and draws, it never multiplies sesi × tarif itself.

const CHART_W = 640
const CHART_H = 220

export default function OverviewCards() {
  const period = usePeriod()
  const entities = {
    sekolah: read('sekolah'),
    siswa: read('siswa'),
    trainer: read('trainer'),
    absensi: read('absensi'),
    honorPayments: read('honorPayments'),
  }

  const noData = entities.sekolah.length === 0 && entities.siswa.length === 0 && entities.trainer.length === 0

  const currentPeriode = period.periodeKey()
  const current = financialData({ ...entities, periode: currentPeriode })

  const monthly = MONTHS.map((label, i) => {
    const monthNum = Number(MONTH_KEYS[i])
    const periode = periodeKey(monthNum, period.selectedYear)
    const fd = financialData({ ...entities, periode })
    return { label, periode, ...fd }
  })

  const selectedIdx = MONTH_KEYS.indexOf(String(period.selectedMonth).padStart(2, '0'))
  let running = 0
  const cashPosition = monthly.slice(0, selectedIdx + 1).map(m => {
    running += m.labaRugi
    return { label: m.label, value: running }
  })

  const collectionRate = current.potensiSpp > 0 ? current.pemasukanSpp / current.potensiSpp : 0

  if (noData) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="bg-white p-4 rounded-2xl shadow-sm border">
          <h2 className="text-xl font-bold text-slate-800">Overview</h2>
          <p className="text-xs text-slate-500">Ringkasan operasional & keuangan</p>
        </div>
        <div className="bg-white rounded-2xl p-10 shadow-sm border text-center">
          <p className="text-slate-400 text-sm">
            Belum ada data sekolah, siswa, atau trainer. Grafik akan muncul setelah data mulai diisi.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-white p-4 rounded-2xl shadow-sm border">
        <h2 className="text-xl font-bold text-slate-800">Overview</h2>
        <p className="text-xs text-slate-500">Ringkasan operasional & keuangan — {MONTHS[selectedIdx]} {period.selectedYear}/{period.selectedYear + 1}</p>
      </div>

      {/* M6.3.3 — Executive Summary: Laba/Rugi + kolektibilitas + red flags */}
      <ExecutiveSummary />

      {/* Summary cards — cash rows vs memo rows visually distinct (D1) */}
      <div className="bg-gradient-to-br from-blue-900 to-slate-950 text-white rounded-2xl p-6 shadow-md grid grid-cols-1 md:grid-cols-4 gap-4 animate-scaleIn">
        <div className="space-y-1">
          <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Pemasukan SPP</p>
          <h3 className="text-2xl font-extrabold text-white">{formatRupiah(current.pemasukanSpp)}</h3>
          <p className="text-[10px] text-blue-200">Realisasi kas masuk</p>
        </div>
        <div className="space-y-1 opacity-80">
          <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Beban Honor <span className="normal-case font-normal">(memo)</span></p>
          <h3 className="text-2xl font-extrabold text-yellow-300">{formatRupiah(current.totalBebanHonor)}</h3>
          <p className="text-[10px] text-blue-200">Akrual kehadiran sesi</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Honor Dibayar</p>
          <h3 className="text-2xl font-extrabold text-emerald-400">{formatRupiah(current.totalHonorDibayar)}</h3>
          <p className="text-[10px] text-blue-200">Realisasi kas keluar</p>
        </div>
        <div className="space-y-1 border-t md:border-t-0 md:border-l border-blue-800 pt-4 md:pt-0 md:pl-4">
          <p className="text-xs font-bold text-yellow-300 uppercase tracking-wider">Laba / Rugi Bersih</p>
          <h3 className={`text-2xl font-extrabold ${current.labaRugi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatRupiah(current.labaRugi)}
          </h3>
          <p className="text-[10px] text-blue-200">Pemasukan − Dibayar (cash basis)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border p-5">
          <h3 className="font-bold text-slate-800 text-sm mb-1">Tren Bulanan — Tahun Ajaran {period.selectedYear}/{period.selectedYear + 1}</h3>
          <p className="text-xs text-slate-400 mb-4">Pemasukan vs Dibayar (kas) dibanding Beban Honor (memo)</p>
          <MonthlyTrendChart data={monthly} />
          <Legend items={[
            { color: 'bg-blue-600', label: 'Pemasukan SPP' },
            { color: 'bg-emerald-500', label: 'Honor Dibayar' },
            { color: 'bg-yellow-400', label: 'Beban Honor (memo)' },
          ]} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-5 flex flex-col items-center">
          <h3 className="font-bold text-slate-800 text-sm mb-1 self-start">Tingkat Penagihan SPP</h3>
          <p className="text-xs text-slate-400 mb-4 self-start">Realisasi dibanding potensi bulan berjalan</p>
          <DonutChart rate={collectionRate} />
          <p className="mt-3 text-xs text-slate-500 text-center">
            {formatRupiah(current.pemasukanSpp)} dari {formatRupiah(current.potensiSpp)} potensi
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border p-5">
          <h3 className="font-bold text-slate-800 text-sm mb-1">Realisasi SPP per Sekolah</h3>
          <p className="text-xs text-slate-400 mb-4">Bulan berjalan, dibanding target</p>
          {current.sekolahFinance.length === 0 ? (
            <EmptyChartState text="Belum ada sekolah mitra." />
          ) : (
            <PerSchoolBars data={current.sekolahFinance} />
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-5">
          <h3 className="font-bold text-slate-800 text-sm mb-1">Posisi Kas Kumulatif</h3>
          <p className="text-xs text-slate-400 mb-4">Laba/Rugi berjalan dari Juli s.d. {MONTHS[selectedIdx]}</p>
          {cashPosition.length < 2 ? (
            <EmptyChartState text="Butuh minimal 2 bulan berjalan untuk menampilkan tren." />
          ) : (
            <CashPositionLine data={cashPosition} />
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyChartState({ text }) {
  return (
    <div className="h-40 flex items-center justify-center text-xs text-slate-400 text-center px-6">
      {text}
    </div>
  )
}

function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-4 mt-3">
      {items.map(it => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-full ${it.color}`} />
          <span className="text-[11px] font-semibold text-slate-500">{it.label}</span>
        </div>
      ))}
    </div>
  )
}

function MonthlyTrendChart({ data }) {
  const padding = { top: 10, right: 10, bottom: 24, left: 10 }
  const innerW = CHART_W - padding.left - padding.right
  const innerH = CHART_H - padding.top - padding.bottom
  const groupW = innerW / data.length
  const barW = Math.max(3, groupW / 4.5)

  const maxVal = Math.max(1, ...data.flatMap(m => [m.pemasukanSpp, m.totalHonorDibayar, m.totalBebanHonor]))

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-56" preserveAspectRatio="xMidYMid meet">
      <line x1={padding.left} y1={CHART_H - padding.bottom} x2={CHART_W - padding.right} y2={CHART_H - padding.bottom} stroke="#e2e8f0" strokeWidth="1" />
      {data.map((m, i) => {
        const gx = padding.left + i * groupW
        const bars = [
          { val: m.pemasukanSpp, color: '#2563eb' },
          { val: m.totalHonorDibayar, color: '#10b981' },
          { val: m.totalBebanHonor, color: '#facc15' },
        ]
        return (
          <g key={m.periode}>
            {bars.map((b, bi) => {
              const h = (b.val / maxVal) * innerH
              const x = gx + bi * (barW + 2) + (groupW - (barW + 2) * 3) / 2
              const y = CHART_H - padding.bottom - h
              return <rect key={bi} x={x} y={y} width={barW} height={h} fill={b.color} rx="1.5" />
            })}
            <text
              x={gx + groupW / 2}
              y={CHART_H - 8}
              textAnchor="middle"
              fontSize="8"
              fill="#94a3b8"
              fontWeight="700"
            >
              {m.label.slice(0, 3)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function DonutChart({ rate }) {
  const size = 160
  const stroke = 18
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, rate))
  const dash = c * pct

  const color = pct >= 0.8 ? '#10b981' : pct >= 0.5 ? '#facc15' : '#e11d48'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${c - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="800" fill="#1e293b">
        {Math.round(pct * 100)}%
      </text>
    </svg>
  )
}

function PerSchoolBars({ data }) {
  const rowH = 34
  const height = data.length * rowH + 10
  const maxVal = Math.max(1, ...data.map(s => s.targetSpp))
  const labelW = 120
  const barAreaW = CHART_W - labelW - 70

  return (
    <svg viewBox={`0 0 ${CHART_W} ${height}`} className="w-full" style={{ height: `${height}px` }}>
      {data.map((s, i) => {
        const y = i * rowH + 8
        const targetW = (s.targetSpp / maxVal) * barAreaW
        const realisasiW = (s.realisasiSpp / maxVal) * barAreaW
        return (
          <g key={s.id}>
            <text x={0} y={y + 14} fontSize="10" fontWeight="700" fill="#334155">
              {s.nama.length > 18 ? s.nama.slice(0, 18) + '…' : s.nama}
            </text>
            <rect x={labelW} y={y} width={targetW} height="16" fill="#f1f5f9" rx="4" />
            <rect x={labelW} y={y} width={realisasiW} height="16" fill="#2563eb" rx="4" />
            <text x={labelW + barAreaW + 8} y={y + 12} fontSize="9" fontWeight="700" fill="#475569">
              {Math.round(maxVal > 0 ? (s.realisasiSpp / (s.targetSpp || 1)) * 100 : 0)}%
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function CashPositionLine({ data }) {
  const padding = { top: 16, right: 16, bottom: 24, left: 16 }
  const innerW = CHART_W - padding.left - padding.right
  const innerH = CHART_H - padding.top - padding.bottom

  const values = data.map(d => d.value)
  const minVal = Math.min(0, ...values)
  const maxVal = Math.max(1, ...values)
  const range = maxVal - minVal || 1

  const stepX = innerW / Math.max(1, data.length - 1)
  const points = data.map((d, i) => {
    const x = padding.left + i * stepX
    const y = padding.top + innerH - ((d.value - minVal) / range) * innerH
    return { x, y, ...d }
  })

  const zeroY = padding.top + innerH - ((0 - minVal) / range) * innerH
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const lastPositive = points[points.length - 1].value >= 0

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-56" preserveAspectRatio="xMidYMid meet">
      <line x1={padding.left} y1={zeroY} x2={CHART_W - padding.right} y2={zeroY} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 3" />
      <path d={pathD} fill="none" stroke={lastPositive ? '#10b981' : '#e11d48'} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill={p.value >= 0 ? '#10b981' : '#e11d48'} />
          <text x={p.x} y={CHART_H - 6} textAnchor="middle" fontSize="8" fontWeight="700" fill="#94a3b8">
            {p.label.slice(0, 3)}
          </text>
        </g>
      ))}
    </svg>
  )
}