import { formatRupiah } from '../../lib/format.js'

export default function SlipHonor({ trainer, payment, onBack }) {
  if (!trainer || !payment) return null

  const periodeLabel = new Date(`${payment.periode}-01`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  const tanggalLabel = new Date(payment.tanggalBayar).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border no-print">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Slip Honor Trainer</h2>
          <p className="text-xs text-slate-500">{trainer.nama} — {periodeLabel}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm px-4 py-2 rounded-xl transition">Kembali</button>
          <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm px-4 py-2 rounded-xl transition shadow-sm">Cetak Slip</button>
        </div>
      </div>

      <div className="printable-report bg-white rounded-2xl shadow-sm border p-8 max-w-2xl mx-auto">
        <div className="text-center border-b pb-4 mb-6">
          <h3 className="text-lg font-extrabold text-blue-900">SLIP PEMBAYARAN HONOR</h3>
          <p className="text-xs text-slate-400">Afterschola</p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-6">
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Nama Trainer</p>
            <p className="font-bold text-slate-800">{trainer.nama}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Periode</p>
            <p className="font-bold text-slate-800">{periodeLabel}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Tanggal Bayar</p>
            <p className="font-bold text-slate-800">{tanggalLabel}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase">No. Referensi</p>
            <p className="font-bold text-slate-800">{payment.id}</p>
          </div>
        </div>

        <div className="border-t border-b py-4 mb-8">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-slate-600">Nominal Dibayarkan</span>
            <span className="text-xl font-extrabold text-emerald-700">{formatRupiah(payment.nominal)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mt-16 text-center text-xs">
          <div>
            <div className="border-t border-slate-400 pt-2 mx-8">
              <p className="font-semibold text-slate-600">Penerima</p>
              <p className="text-slate-800 mt-1">{trainer.nama}</p>
            </div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-2 mx-8">
              <p className="font-semibold text-slate-600">Pemberi</p>
              <p className="text-slate-800 mt-1">Admin Afterschola</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}