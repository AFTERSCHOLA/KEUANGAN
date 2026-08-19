import { useState } from 'react'
import { read, usePeriod } from '../../lib/store.js'
import { formatRupiah } from '../../lib/format.js'
import { financialData } from '../../lib/finance.js'
import { shiftPeriode, monthLabel, MONTH_KEYS, periodeKey } from '../../lib/constants.js'
import PrintButton from '../../components/PrintButton.jsx'
import {
  exportSekolahCSV,
  exportSiswaCSV,
  exportTrainerCSV,
  exportAbsensiCSV,
  exportPembayaranCSV,
  exportRingkasanCSV,
} from '../../lib/csv.js'

function deltaAbs(current, prev) {
  return current - prev
}

function deltaPct(current, prev) {
  if (prev === 0) return null
  return ((current - prev) / Math.abs(prev)) * 100
}

function DeltaCell({ current, prev }) {
  const abs = deltaAbs(current, prev)
  const pct = deltaPct(current, prev)
  const positive = abs > 0
  const negative = abs < 0
  const tone = positive ? 'text-emerald-600' : negative ? 'text-rose-600' : 'text-slate-400'
  const sign = positive ? '+' : ''
  return (
    <td className={`py-3 px-4 text-right font-bold ${tone}`}>
      <div>{sign}{formatRupiah(abs)}</div>
      <div className="text-[10px] font-semibold opacity-70">
        {pct === null ? '—' : `${sign}${pct.toFixed(1)}%`}
      </div>
    </td>
  )
}

function periodeLabel(p) {
  const [y, m] = p.split('-')
  return `${monthLabel(m)} ${y}`
}

/**
 * M6.3.2 — Bangun daftar periode "YYYY-MM" berturut-turut dari start s.d.
 * end (inklusif). Format YYYY-MM urut secara leksikografis, jadi string
 * compare aman dipakai untuk deteksi arah/selesai.
 */
function periodsBetween(start, end) {
  const [a, b] = start <= end ? [start, end] : [end, start]
  const periods = []
  let cur = a
  let guard = 0
  while (guard < 120) {
    periods.push(cur)
    if (cur === b) break
    cur = shiftPeriode(cur, 1)
    guard++
  }
  return periods
}

const REPORT_MODES = [
  { id: 'tunggal', label: 'Periode Tunggal' },
  { id: 'rentang', label: 'Rentang Kustom' },
  { id: 'semester', label: 'Semester' },
  { id: 'tahunAjaran', label: 'Tahun Ajaran' },
]

const RANGE_ROWS = [
  { label: 'Pemasukan SPP', key: 'pemasukanSpp', tag: 'Kas' },
  { label: 'Honor Dibayar', key: 'totalHonorDibayar', tag: 'Kas' },
  { label: 'Laba / Rugi', key: 'labaRugi', tag: 'Kas' },
  { label: 'Potensi SPP', key: 'potensiSpp', tag: 'Memo' },
  { label: 'SPP Belum Tertagih', key: 'belumTertagih', tag: 'Memo' },
  { label: 'Beban Honor', key: 'totalBebanHonor', tag: 'Memo' },
  { label: 'Sisa Kewajiban', key: 'sisaKewajiban', tag: 'Memo' },
]

export default function FinanceReport() {
  const period = usePeriod()
  const sekolah = read('sekolah')
  const siswa = read('siswa')
  const trainer = read('trainer')
  const absensi = read('absensi')
  const honorPayments = read('honorPayments')
  const sppPayments = read('sppPayments')

  const periode = period.periodeKey()
  const periodePrevBulan = shiftPeriode(periode, -1)
  const periodePrevTahun = shiftPeriode(periode, -12)

  const data = financialData({ sekolah, siswa, trainer, absensi, honorPayments, sppPayments, periode })
  const dataPrevBulan = financialData({ sekolah, siswa, trainer, absensi, honorPayments, sppPayments, periode: periodePrevBulan })
  const dataPrevTahun = financialData({ sekolah, siswa, trainer, absensi, honorPayments, sppPayments, periode: periodePrevTahun })

  const comparisonRows = [
    { label: 'Potensi SPP', key: 'potensiSpp', tag: 'Memo' },
    { label: 'Pemasukan SPP', key: 'pemasukanSpp', tag: 'Kas' },
    { label: 'SPP Belum Tertagih', key: 'belumTertagih', tag: 'Memo' },
    { label: 'Beban Honor', key: 'totalBebanHonor', tag: 'Memo' },
    { label: 'Honor Dibayar', key: 'totalHonorDibayar', tag: 'Kas' },
    { label: 'Sisa Kewajiban', key: 'sisaKewajiban', tag: 'Memo' },
    { label: 'Laba / Rugi', key: 'labaRugi', tag: 'Kas' },
  ]

  const [reportMode, setReportMode] = useState('tunggal')
  const [semester, setSemester] = useState('ganjil')
  const [rangeStart, setRangeStart] = useState(periode)
  const [rangeEnd, setRangeEnd] = useState(periode)

  let rangePeriods = []
  if (reportMode === 'rentang') {
    rangePeriods = periodsBetween(rangeStart, rangeEnd)
  } else if (reportMode === 'semester') {
    const keys = semester === 'ganjil' ? MONTH_KEYS.slice(0, 6) : MONTH_KEYS.slice(6, 12)
    rangePeriods = keys.map(mk => periodeKey(Number(mk), period.selectedYear))
  } else if (reportMode === 'tahunAjaran') {
    rangePeriods = MONTH_KEYS.map(mk => periodeKey(Number(mk), period.selectedYear))
  }

  const rangeDataByPeriode = Object.fromEntries(
    rangePeriods.map(p => [p, financialData({ sekolah, siswa, trainer, absensi, honorPayments, sppPayments, periode: p })])
  )
  const rangeTotals = Object.fromEntries(
    RANGE_ROWS.map(row => [row.key, rangePeriods.reduce((sum, p) => sum + rangeDataByPeriode[p][row.key], 0)])
  )

  return (
    <div className="space-y-6 animate-fadeIn printable-report">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Laporan Keuangan Laba Rugi</h2>
          <p className="text-xs text-slate-500">Rangkuman finansial berjalan</p>
        </div>
        <PrintButton />
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border no-print">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs font-bold text-slate-500 mr-1">Mode Laporan:</span>
          {REPORT_MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setReportMode(m.id)}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-full transition ${
                reportMode === m.id ? 'bg-yellow-400 text-slate-900 shadow-sm' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {reportMode === 'rentang' && (
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Dari</label>
              <input type="month" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="rounded-lg border p-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Sampai</label>
              <input type="month" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="rounded-lg border p-2 text-sm" />
            </div>
          </div>
        )}

        {reportMode === 'semester' && (
          <div className="flex gap-2">
            <button
              onClick={() => setSemester('ganjil')}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-full transition ${semester === 'ganjil' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}
            >
              Ganjil (Jul–Des)
            </button>
            <button
              onClick={() => setSemester('genap')}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-full transition ${semester === 'genap' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}
            >
              Genap (Jan–Jun)
            </button>
          </div>
        )}
      </div>

      {reportMode !== 'tunggal' && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
          <div className="p-5 border-b">
            <h3 className="font-bold text-slate-800 text-base">
              Laporan {REPORT_MODES.find(m => m.id === reportMode)?.label}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {rangePeriods.length > 0 ? `${periodeLabel(rangePeriods[0])} — ${periodeLabel(rangePeriods[rangePeriods.length - 1])}` : 'Rentang belum valid'}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4 sticky left-0 bg-slate-50">Pos</th>
                  {rangePeriods.map(p => (
                    <th key={p} className="py-3 px-4 text-right whitespace-nowrap">{periodeLabel(p)}</th>
                  ))}
                  <th className="py-3 px-4 text-right bg-slate-100">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y text-sm">
                {RANGE_ROWS.map(row => (
                  <tr key={row.key} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-semibold text-slate-700 sticky left-0 bg-white">
                      {row.label}
                      <span className={`ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${row.tag === 'Kas' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                        {row.tag}
                      </span>
                    </td>
                    {rangePeriods.map(p => (
                      <td key={p} className="py-3 px-4 text-right font-medium text-slate-600 whitespace-nowrap">
                        {formatRupiah(rangeDataByPeriode[p][row.key])}
                      </td>
                    ))}
                    <td className="py-3 px-4 text-right font-extrabold text-slate-900 bg-slate-50">
                      {formatRupiah(rangeTotals[row.key])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 pb-4 text-[11px] text-slate-400">
            *"SPP Belum Tertagih" &amp; "Sisa Kewajiban" adalah jumlah dari saldo per-bulan (bukan saldo berjalan/kumulatif).
          </p>
        </div>
      )}

      {reportMode === 'tunggal' && (
        <>
          <div className="bg-gradient-to-br from-blue-900 to-slate-950 text-white rounded-2xl p-6 shadow-md grid grid-cols-2 md:grid-cols-4 gap-4 animate-scaleIn">
            <div className="space-y-1">
              <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Potensi SPP <span className="normal-case font-normal text-blue-200">(memo)</span></p>
              <h3 className="text-2xl font-extrabold text-yellow-300">{formatRupiah(data.potensiSpp)}</h3>
              <p className="text-[10px] text-blue-200">Total Tagihan SPP</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Pemasukan SPP <span className="normal-case font-normal text-blue-200">(kas)</span></p>
              <h3 className="text-2xl font-extrabold text-emerald-400">{formatRupiah(data.pemasukanSpp)}</h3>
              <p className="text-[10px] text-blue-200">Realisasi SPP Lunas</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">SPP Belum Tertagih <span className="normal-case font-normal text-blue-200">(memo)</span></p>
              <h3 className="text-2xl font-extrabold text-yellow-300">{formatRupiah(data.belumTertagih)}</h3>
              <p className="text-[10px] text-blue-200">Potensi − Pemasukan</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Beban Honor <span className="normal-case font-normal text-blue-200">(memo)</span></p>
              <h3 className="text-2xl font-extrabold text-yellow-300">{formatRupiah(data.totalBebanHonor)}</h3>
              <p className="text-[10px] text-blue-200">Akrual Kehadiran Sesi</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Honor Dibayar <span className="normal-case font-normal text-blue-200">(kas)</span></p>
              <h3 className="text-2xl font-extrabold text-emerald-400">{formatRupiah(data.totalHonorDibayar)}</h3>
              <p className="text-[10px] text-blue-200">Realisasi Kas Keluar</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Sisa Kewajiban <span className="normal-case font-normal text-blue-200">(memo)</span></p>
              <h3 className="text-2xl font-extrabold text-yellow-300">{formatRupiah(data.sisaKewajiban)}</h3>
              <p className="text-[10px] text-blue-200">Beban − Dibayar</p>
            </div>
            <div className="space-y-1 border-t md:border-t-0 md:border-l border-blue-800 pt-4 md:pt-0 md:pl-4">
              <p className="text-xs font-bold text-yellow-300 uppercase tracking-wider">Laba / Rugi <span className="normal-case font-normal text-blue-200">(kas)</span></p>
              <h3 className={`text-2xl font-extrabold ${data.labaRugi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatRupiah(data.labaRugi)}
              </h3>
              <p className="text-[10px] text-blue-200">Pemasukan − Kas Keluar</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
            <div className="p-5 border-b">
              <h3 className="font-bold text-slate-800 text-base">Perbandingan Periode</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {periodeLabel(periode)} vs {periodeLabel(periodePrevBulan)} (bulan lalu) vs {periodeLabel(periodePrevTahun)} (tahun ajaran lalu)
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Pos</th>
                    <th className="py-3 px-4 text-right">{periodeLabel(periode)}</th>
                    <th className="py-3 px-4 text-right">{periodeLabel(periodePrevBulan)}</th>
                    <th className="py-3 px-4 text-right">Δ vs Bulan Lalu</th>
                    <th className="py-3 px-4 text-right">{periodeLabel(periodePrevTahun)}</th>
                    <th className="py-3 px-4 text-right">Δ vs Tahun Lalu</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-sm">
                  {comparisonRows.map(row => {
                    const current = data[row.key]
                    const prevBulan = dataPrevBulan[row.key]
                    const prevTahun = dataPrevTahun[row.key]
                    return (
                      <tr key={row.key} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-semibold text-slate-700">
                          {row.label}
                          <span className={`ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${row.tag === 'Kas' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                            {row.tag}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">{formatRupiah(current)}</td>
                        <td className="py-3 px-4 text-right font-medium text-slate-500">{formatRupiah(prevBulan)}</td>
                        <DeltaCell current={current} prev={prevBulan} />
                        <td className="py-3 px-4 text-right font-medium text-slate-500">{formatRupiah(prevTahun)}</td>
                        <DeltaCell current={current} prev={prevTahun} />
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap no-print">
            <span className="text-xs text-slate-500 font-semibold mr-1">Export:</span>
            <button onClick={() => exportSekolahCSV(sekolah, trainer, periode)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors">Sekolah</button>
            <button onClick={() => exportSiswaCSV(siswa, periode)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors">Siswa</button>
            <button onClick={() => exportTrainerCSV(data.trainerFinance, periode)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors">Trainer</button>
            <button onClick={() => exportAbsensiCSV(absensi, sekolah, periode)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors">Absensi</button>
            <button onClick={() => exportPembayaranCSV(honorPayments, trainer, periode)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors">Pembayaran</button>
            <button onClick={() => exportRingkasanCSV(data, periode)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors">Ringkasan</button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
            <div className="p-5 border-b">
              <h3 className="font-bold text-slate-800 text-base">Rincian Finansial Sekolah Mitra</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                    <th className="py-4 px-6">Sekolah Mitra</th>
                    <th className="py-4 px-6 text-right">Potensi SPP</th>
                    <th className="py-4 px-6 text-right">SPP Realisasi</th>
                    <th className="py-4 px-6">Trainer</th>
                    <th className="py-4 px-6 text-center">Kehadiran Mengajar</th>
                    <th className="py-4 px-6 text-right">Beban Honor</th>
                    <th className="py-4 px-6 text-right">Telah Dibayar</th>
                    <th className="py-4 px-6 text-right">Sisa Kewajiban</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-sm">
                  {data.sekolahFinance.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-12 text-center text-slate-400">
                        Belum ada data sekolah mitra.
                      </td>
                    </tr>
                  ) : (
                    data.sekolahFinance.map(sch => (
                      <tr key={sch.id} className="hover:bg-slate-50/50">
                        <td className="py-4 px-6">
                          <p className="font-bold text-slate-800">{sch.nama}</p>
                          <p className="text-xs text-slate-400">{sch.siswaCount} siswa</p>
                        </td>
                        <td className="py-4 px-6 text-right font-medium text-slate-500">{formatRupiah(sch.targetSpp)}</td>
                        <td className="py-4 px-6 text-right font-bold text-blue-600">{formatRupiah(sch.realisasiSpp)}</td>
                        <td className="py-4 px-6 font-semibold text-slate-700">{sch.trainerNama}</td>
                        <td className="py-4 px-6 text-center font-semibold text-slate-700">{sch.trainerKehadiran} Sesi</td>
                        <td className="py-4 px-6 text-right font-bold text-slate-800">{formatRupiah(sch.bebanHonor)}</td>
                        <td className="py-4 px-6 text-right font-bold text-emerald-600">—</td>
                        <td className="py-4 px-6 text-right font-extrabold text-rose-600">—</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {data.sekolahFinance.length > 0 && (
              <p className="px-6 pb-4 text-[11px] text-slate-400">
                *Kolom "Telah Dibayar" &amp; "Sisa Kewajiban" dihitung per trainer (ledger honorPayments tidak berelasi langsung ke sekolah) — lihat tab Data Pembayaran untuk rincian per trainer.
              </p>
            )}
          </div>

          {data.trainerFinance.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
              <div className="p-5 border-b">
                <h3 className="font-bold text-slate-800 text-base">Rincian Honor per Trainer</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                      <th className="py-4 px-6">Trainer</th>
                      <th className="py-4 px-6 text-center">Sesi Hadir</th>
                      <th className="py-4 px-6 text-right">Beban Honor</th>
                      <th className="py-4 px-6 text-right">Telah Dibayar</th>
                      <th className="py-4 px-6 text-right">Sisa Kewajiban</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-sm">
                    {data.trainerFinance.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/50">
                        <td className="py-4 px-6 font-bold text-slate-800">{t.nama}</td>
                        <td className="py-4 px-6 text-center font-semibold text-slate-700">{t.hadirSesi} Sesi</td>
                        <td className="py-4 px-6 text-right font-bold text-slate-800">{formatRupiah(t.bebanHonor)}</td>
                        <td className="py-4 px-6 text-right font-bold text-emerald-600">{formatRupiah(t.dibayar)}</td>
                        <td className={`py-4 px-6 text-right font-extrabold ${t.sisaHonor > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                          {formatRupiah(t.sisaHonor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}