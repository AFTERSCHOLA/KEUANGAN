import { read, usePeriod } from '../../lib/store.js'
import { formatRupiah } from '../../lib/format.js'
import { financialData } from '../../lib/finance.js'
import { elapsedPeriods, sppPaidForPeriode } from '../../lib/tunggakan.js'

function findWorstCollection(sekolahFinance) {
  const withTarget = sekolahFinance.filter(s => s.targetSpp > 0)
  if (withTarget.length === 0) return null
  return withTarget.reduce((worst, s) => {
    const rate = s.realisasiSpp / s.targetSpp
    const worstRate = worst.realisasiSpp / worst.targetSpp
    return rate < worstRate ? s : worst
  })
}

function findMostUnpaidTrainer(trainerFinance) {
  const withDebt = trainerFinance.filter(t => t.sisaHonor > 0)
  if (withDebt.length === 0) return null
  return withDebt.reduce((worst, t) => (t.sisaHonor > worst.sisaHonor ? t : worst))
}

function findOldestTunggakan(siswa, sekolah, elapsed, sppPayments) {
  const lastIdx = elapsed.length - 1
  let oldest = null

  siswa.forEach(s => {
    if (s.status === 'Trial') return
    const sppTarif = sekolah.find(sc => sc.id === s.sekolahId)?.spp || 0
    const unpaidIdx = elapsed
      .map((e, i) => ({ i, paid: sppPaidForPeriode(s, e.periode, sppPayments, sppTarif) }))
      .filter(x => !x.paid)
      .map(x => x.i)
    if (unpaidIdx.length === 0) return

    const oldestIdx = Math.min(...unpaidIdx)
    const distance = lastIdx - oldestIdx
    if (!oldest || distance > oldest.distance) {
      oldest = {
        distance,
        siswaNama: s.nama,
        sekolahNama: sekolah.find(sc => sc.id === s.sekolahId)?.nama || '-',
        monthsUnpaid: unpaidIdx.length,
      }
    }
  })

  return oldest
}

export default function ExecutiveSummary() {
  const period = usePeriod()
  const sekolah = read('sekolah')
  const siswa = read('siswa')
  const trainer = read('trainer')
  const absensi = read('absensi')
  const honorPayments = read('honorPayments')
  const sppPayments = read('sppPayments')

  const periode = period.periodeKey()
  const data = financialData({ sekolah, siswa, trainer, absensi, honorPayments, sppPayments, periode })
  const elapsed = elapsedPeriods(period.selectedYear, period.selectedMonth)

  const collectionRate = data.potensiSpp > 0 ? (data.pemasukanSpp / data.potensiSpp) * 100 : null

  const worstSchool = findWorstCollection(data.sekolahFinance)
  const worstTrainer = findMostUnpaidTrainer(data.trainerFinance)
  const oldestTunggakan = findOldestTunggakan(siswa, sekolah, elapsed, sppPayments)

  const redFlags = []
  if (worstSchool) {
    const rate = ((worstSchool.realisasiSpp / worstSchool.targetSpp) * 100).toFixed(0)
    redFlags.push({
      label: 'Kolektibilitas SPP Terendah',
      detail: `${worstSchool.nama} — baru ${rate}% tertagih`,
    })
  }
  if (worstTrainer) {
    redFlags.push({
      label: 'Sisa Honor Terbesar',
      detail: `${worstTrainer.nama} — ${formatRupiah(worstTrainer.sisaHonor)} belum dibayar`,
    })
  }
  if (oldestTunggakan) {
    redFlags.push({
      label: 'Tunggakan Terlama',
      detail: `${oldestTunggakan.siswaNama} (${oldestTunggakan.sekolahNama}) — ${oldestTunggakan.monthsUnpaid} bulan menunggak`,
    })
  }

  return (
    <div className="bg-gradient-to-br from-blue-900 to-slate-950 text-white rounded-2xl p-6 shadow-md animate-scaleIn space-y-6">
      <div>
        <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Laba / Rugi — Periode Berjalan</p>
        <h2 className={`text-4xl font-extrabold mt-1 ${data.labaRugi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {formatRupiah(data.labaRugi)}
        </h2>
        <p className="text-[11px] text-blue-200 mt-1">Pemasukan SPP − Honor Dibayar (kas)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-bold text-blue-300 uppercase tracking-wider mb-1">Tingkat Kolektibilitas SPP</p>
          <div className="flex items-end gap-2">
            <h3 className="text-2xl font-extrabold text-yellow-300">
              {collectionRate === null ? '—' : `${collectionRate.toFixed(1)}%`}
            </h3>
            <span className="text-[11px] text-blue-200 mb-1">dari total potensi tagihan</span>
          </div>
          <div className="w-full h-2 bg-blue-800 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-yellow-400 rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.max(0, collectionRate || 0))}%` }}
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-blue-300 uppercase tracking-wider mb-2">3 Sorotan Utama</p>
          {redFlags.length === 0 ? (
            <p className="text-sm text-blue-200">Tidak ada catatan penting periode ini.</p>
          ) : (
            <ul className="space-y-1.5">
              {redFlags.map((flag, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                  <span>
                    <span className="font-bold text-white">{flag.label}:</span>{' '}
                    <span className="text-blue-100">{flag.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}