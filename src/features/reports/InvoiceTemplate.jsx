import { formatRupiah } from '../../lib/format.js'
import { terbilang } from '../../lib/terbilang.js'
import { getSettings } from '../../lib/store.js'

export default function InvoiceTemplate({ invoice, sekolah, onBack }) {
  if (!invoice || !sekolah) return null
  const settings = getSettings()

  const periodeLabel = invoice.periodeList.length === 1
    ? new Date(`${invoice.periodeList[0]}-01`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
    : `${new Date(`${invoice.periodeList[0]}-01`).toLocaleDateString('id-ID', { month: 'long' })} - ${new Date(`${invoice.periodeList[invoice.periodeList.length - 1]}-01`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`

  const tanggalLabel = new Date(invoice.tanggalTerbit).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border no-print">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Invoice — {sekolah.nama}</h2>
          <p className="text-xs text-slate-500">{invoice.nomor || 'Draft (belum bernomor)'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm px-4 py-2 rounded-xl transition">Kembali</button>
          <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm px-4 py-2 rounded-xl transition shadow-sm">Cetak Invoice</button>
        </div>
      </div>

      <div className="printable-report bg-white rounded-2xl shadow-sm border p-8 max-w-3xl mx-auto">
        <div className="flex items-start justify-between border-b pb-4 mb-6">
          <div>
            <h3 className="text-lg font-extrabold text-blue-900">{settings.title || 'Afterschola'}</h3>
            <p className="text-xs text-slate-400">{settings.alamatUsaha || ''}</p>
          </div>
          <div className="text-right">
            <h3 className="text-xl font-extrabold text-blue-900">INVOICE</h3>
            <p className="text-sm font-bold text-blue-700">{invoice.nomor || '(Draft)'}</p>
            <p className="text-xs text-slate-400">Tanggal: {tanggalLabel}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6 bg-slate-50 rounded-xl p-4">
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Kepada Yth</p>
            <p className="font-bold text-slate-800">{sekolah.nama}</p>
            {invoice.pjSekolah && <p className="text-xs text-slate-500">PJ: {invoice.pjSekolah}</p>}
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-400 font-bold uppercase">Periode Tagihan</p>
            <p className="font-bold text-slate-800">{periodeLabel}</p>
          </div>
        </div>

        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b-2 border-slate-800 text-[11px] font-bold uppercase text-slate-500">
              <th className="text-left py-2">No</th>
              <th className="text-left py-2">Uraian</th>
              <th className="text-center py-2">Siswa</th>
              <th className="text-right py-2">Harga Satuan</th>
              <th className="text-right py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-3">1</td>
              <td className="py-3">{invoice.uraian}</td>
              <td className="py-3 text-center">{invoice.jumlahSiswa}</td>
              <td className="py-3 text-right">{formatRupiah(invoice.hargaSatuan)}</td>
              <td className="py-3 text-right font-bold">{formatRupiah(invoice.total)}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-between items-center border-t pt-3 mb-2">
          <span className="font-bold text-slate-800">GRAND TOTAL</span>
          <span className="text-xl font-extrabold text-blue-700">{formatRupiah(invoice.total)}</span>
        </div>
        <div className="bg-slate-50 rounded-lg px-4 py-2 mb-8 text-xs text-slate-600">
          <span className="font-semibold">Terbilang: </span>
          <span className="italic">"{terbilang(invoice.total)}"</span>
        </div>

        <div className="grid grid-cols-2 gap-8">
          <div className="text-xs text-slate-600">
            <p className="font-semibold mb-1">Catatan Pembayaran:</p>
            {settings.rekeningBank ? (
              <p>Pembayaran dapat ditransfer ke: {settings.rekeningBank} {settings.rekeningNomor} a.n. {settings.rekeningAtasNama}</p>
            ) : (
              <p className="text-slate-400">Belum diatur — isi info rekening di Pengaturan.</p>
            )}
          </div>
          <div className="text-center text-xs">
            <p className="mb-14">Hormat Kami,</p>
            <p className="border-t border-slate-400 pt-1 font-bold text-slate-800">{settings.penandatangan || '-'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}