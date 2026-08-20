import { readCached, usePeriod } from '../../lib/store.js'
import { formatRupiah } from '../../lib/format.js'
import { elapsedPeriods, sppPaidForPeriode } from '../../lib/tunggakan.js'

/**
 * M6.3.1 — Aging report. Setiap siswa yang nunggak diklasifikasi berdasarkan
 * usia bulan TERTUA yang belum dibayar (bukan per-bulan terpisah): seluruh
 * saldo tunggakannya (jumlah bulan × SPP) masuk satu kolom sesuai usia utang
 * tertuanya — konvensi standar aging report.
 * distance 0 = bulan berjalan, 1 = 1 bulan lalu, 2+ = 2 bulan lalu atau lebih.
 */
function computeAging(sekolah, siswa, elapsed, sppPayments) {
  const lastIdx = elapsed.length - 1

  return sekolah.map(sch => {
    const buckets = { bulanIni: 0, satuBulan: 0, duaBulanPlus: 0 }
    const siswaSekolah = siswa.filter(s => s.sekolahId === sch.id && s.status !== 'Trial')

    siswaSekolah.forEach(s => {
      const unpaidIdx = elapsed
        .map((e, i) => ({ i, paid: sppPaidForPeriode(s, e.periode, sppPayments, sch.spp) }))
        .filter(x => !x.paid)
        .map(x => x.i)

      if (unpaidIdx.length === 0) return

      const oldestIdx = Math.min(...unpaidIdx)
      const distance = lastIdx - oldestIdx
      const totalTunggakan = unpaidIdx.length * sch.spp

      if (distance <= 0) buckets.bulanIni += totalTunggakan
      else if (distance === 1) buckets.satuBulan += totalTunggakan
      else buckets.duaBulanPlus += totalTunggakan
    })

    const total = buckets.bulanIni + buckets.satuBulan + buckets.duaBulanPlus
    return { id: sch.id, nama: sch.nama, ...buckets, total }
  }).filter(row => row.total > 0)
}

export default function AgingReport() {
  const period = usePeriod()
  const sekolah = readCached('sekolah')
  const siswa = readCached('siswa')
  const sppPayments = readCached('sppPayments')

  const elapsed = elapsedPeriods(period.selectedYear, period.selectedMonth)
  const rows = computeAging(sekolah, siswa, elapsed, sppPayments)

  const totals = rows.reduce((acc, r) => ({
    bulanIni: acc.bulanIni + r.bulanIni,
    satuBulan: acc.satuBulan + r.satuBulan,
    duaBulanPlus: acc.duaBulanPlus + r.duaBulanPlus,
    total: acc.total + r.total,
  }), { bulanIni: 0, satuBulan: 0, duaBulanPlus: 0, total: 0 })

  return (
    <div className="space-y-6 animate-fadeIn printable-report">
      <div className="bg-white p-4 rounded-2xl shadow-sm border">
        <h2 className="text-xl font-bold text-slate-800">Laporan Umur Piutang (Aging)</h2>
        <p className="text-xs text-slate-500">Tunggakan SPP per sekolah, dikelompokkan berdasarkan usia utang tertua siswa</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="py-4 px-6">Sekolah</th>
                <th className="py-4 px-6 text-right">Bulan Ini</th>
                <th className="py-4 px-6 text-right">1 Bulan</th>
                <th className="py-4 px-6 text-right text-rose-600">2+ Bulan</th>
                <th className="py-4 px-6 text-right">Total Piutang</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-12 text-center text-slate-400">
                    Tidak ada tunggakan SPP untuk periode ini.
                  </td>
                </tr>
              ) : (
                rows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="py-4 px-6 font-bold text-slate-800">{r.nama}</td>
                    <td className="py-4 px-6 text-right font-semibold text-slate-500">{r.bulanIni > 0 ? formatRupiah(r.bulanIni) : '—'}</td>
                    <td className="py-4 px-6 text-right font-semibold text-amber-600">{r.satuBulan > 0 ? formatRupiah(r.satuBulan) : '—'}</td>
                    <td className="py-4 px-6 text-right font-bold text-rose-600">{r.duaBulanPlus > 0 ? formatRupiah(r.duaBulanPlus) : '—'}</td>
                    <td className="py-4 px-6 text-right font-extrabold text-slate-900">{formatRupiah(r.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-extrabold text-slate-800">
                  <td className="py-4 px-6">Total</td>
                  <td className="py-4 px-6 text-right">{formatRupiah(totals.bulanIni)}</td>
                  <td className="py-4 px-6 text-right text-amber-600">{formatRupiah(totals.satuBulan)}</td>
                  <td className="py-4 px-6 text-right text-rose-600">{formatRupiah(totals.duaBulanPlus)}</td>
                  <td className="py-4 px-6 text-right">{formatRupiah(totals.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}