import { read, usePeriod } from '../../lib/store.js'
import { formatRupiah } from '../../lib/format.js'
import { financialData } from '../../lib/finance.js'
import PrintButton from '../../components/PrintButton.jsx'
import {
  exportSekolahCSV,
  exportSiswaCSV,
  exportTrainerCSV,
  exportAbsensiCSV,
  exportPembayaranCSV,
  exportRingkasanCSV,
} from '../../lib/csv.js'

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

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500 font-semibold mr-1">Export:</span>
        <button onClick={() => exportSekolahCSV(sekolah, trainer, period.periodeKey())} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors">Sekolah</button>
        <button onClick={() => exportSiswaCSV(siswa, period.periodeKey())} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors">Siswa</button>
        <button onClick={() => exportTrainerCSV(data.trainerFinance, period.periodeKey())} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors">Trainer</button>
        <button onClick={() => exportAbsensiCSV(absensi, sekolah, period.periodeKey())} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors">Absensi</button>
        <button onClick={() => exportPembayaranCSV(honorPayments, trainer, period.periodeKey())} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors">Pembayaran</button>
        <button onClick={() => exportRingkasanCSV(data, period.periodeKey())} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors">Ringkasan</button>
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
