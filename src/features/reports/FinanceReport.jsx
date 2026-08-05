import { read, usePeriod } from '../../lib/store.js'
import { formatRupiah } from '../../lib/format.js'
import { financialData } from '../../lib/finance.js'
import PrintButton from '../../components/PrintButton.jsx'

export default function FinanceReport() {
  const period = usePeriod()
  const sekolah = read('sekolah')
  const siswa = read('siswa')
  const trainer = read('trainer')
  const absensi = read('absensi')
  const honorPayments = read('honorPayments')

  const data = financialData({
    sekolah, siswa, trainer, absensi, honorPayments,
    periode: period.periodeKey(),
  })

  return (
    <div className="space-y-6 animate-fadeIn printable-report">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Laporan Keuangan Laba Rugi</h2>
          <p className="text-xs text-slate-500">Rangkuman finansial berjalan</p>
        </div>
        <PrintButton />
      </div>

      <div className="bg-gradient-to-br from-blue-900 to-slate-950 text-white rounded-2xl p-6 shadow-md grid grid-cols-1 md:grid-cols-4 gap-4 animate-scaleIn">
        <div className="space-y-1">
          <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Pemasukan SPP</p>
          <h3 className="text-2xl font-extrabold text-white">{formatRupiah(data.pemasukanSpp)}</h3>
          <p className="text-[10px] text-blue-200">Realisasi SPP Lunas</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Beban Honor Trainer</p>
          <h3 className="text-2xl font-extrabold text-yellow-300">{formatRupiah(data.totalBebanHonor)}</h3>
          <p className="text-[10px] text-blue-200">Log Akrual Kehadiran Sesi</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Honor Telah Dibayar</p>
          <h3 className="text-2xl font-extrabold text-emerald-400">{formatRupiah(data.totalHonorDibayar)}</h3>
          <p className="text-[10px] text-blue-200">Realisasi Kas Keluar</p>
        </div>
        <div className="space-y-1 border-t md:border-t-0 md:border-l border-blue-800 pt-4 md:pt-0 md:pl-4">
          <p className="text-xs font-bold text-yellow-300 uppercase tracking-wider">Laba / Rugi Bersih</p>
          <h3 className={`text-2xl font-extrabold ${data.labaRugi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatRupiah(data.labaRugi)}
          </h3>
          <p className="text-[10px] text-blue-200">SPP - Realisasi Kas Keluar</p>
        </div>
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
    </div>
  )
}
