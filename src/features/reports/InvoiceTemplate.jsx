import { formatRupiah } from '../../lib/format.js'
import { terbilang } from '../../lib/terbilang.js'
import { readCached, getSettings } from '../../lib/store.js'
import { invoiceSettlement, invoiceTotal, invoicePeriods } from '../../lib/invoices.js'

const LOGO_URL = '/invoice/logo.png'
const SIGNATURE_URL = '/invoice/signature.png'

export default function InvoiceTemplate({ invoice, sekolah, onBack }) {
  if (!invoice || !sekolah) return null
  const settings = getSettings()

  // SB.B.3 — badge Lunas/Belum Lunas otomatis, computed sama seperti di
  // InvoiceModal (D-SB9). Draft belum punya settlement karena belum resmi
  // diterbitkan/ditagih.
  const isDraft = invoice.status === 'Draft'
  const settlement = !isDraft
    ? invoiceSettlement(invoice, { sppPayments: readCached('sppPayments'), siswa: readCached('siswa') })
    : null

  const periodeList = invoicePeriods(invoice)
  const periodeLabel = periodeList.length <= 1
    ? (periodeList[0] ? new Date(`${periodeList[0]}-01`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : '-')
    : `${new Date(`${periodeList[0]}-01`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })} - ${new Date(`${periodeList[periodeList.length - 1]}-01`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`

  // SBF.1 (D-SBF1) — normalize both shapes: server canonical
  // (periode/items[]/grandTotal/nomorInvoice) and legacy client
  // (periodeList/uraian/total/nomor). Totals always derive from
  // invoiceTotal() so print matches the history list; carry lines
  // below are display-only and never feed the total (SB.B.4 rule).
  const nomorDisplay = invoice.nomor || invoice.nomorInvoice || null
  const tanggalSrc = invoice.tanggalTerbit || invoice.tanggal || (invoice.createdAt ? invoice.createdAt.slice(0, 10) : '')
  const tanggalLabel = tanggalSrc ? tanggalSrc.split('-').reverse().join('-') : '-'
  const grandTotal = invoiceTotal(invoice)
  const carryLines = Array.isArray(invoice.carryOverLines) ? invoice.carryOverLines : []
  const tableRows = Array.isArray(invoice.items) && invoice.items.length > 0
    ? invoice.items.map((it, idx) => ({
        no: idx + 1,
        uraian: it.deskripsi || invoice.uraian || '',
        qty: it.jumlahSiswa,
        harga: it.hargaSatuan,
        total: it.total,
      }))
    : [{ no: 1, uraian: invoice.uraian || '', qty: invoice.jumlahSiswa, harga: invoice.hargaSatuan, total: invoice.total }]
  const pjDisplay = invoice.pjSekolah || invoice.pjNama || ''

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border no-print">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Invoice — {sekolah.nama}</h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-slate-500">{nomorDisplay || 'Draft (belum bernomor)'}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              isDraft ? 'bg-slate-100 text-slate-500' :
              settlement.status === 'Lunas' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {isDraft ? 'Draft' : settlement.status}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm px-4 py-2 rounded-xl transition">Kembali</button>
          <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm px-4 py-2 rounded-xl transition shadow-sm">Cetak Invoice</button>
        </div>
      </div>

      <div className="printable-report bg-white rounded-2xl shadow-sm border p-8 max-w-3xl mx-auto">
        <div className="flex items-start justify-between pb-5 border-b border-slate-200">
          <div>
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="h-14 object-contain" onError={e => { e.currentTarget.style.display = 'none' }} />
            ) : (
              <img src={LOGO_URL} alt="Logo" className="h-14 object-contain" />
            )}
            <p className="text-xs text-slate-400 mt-2">{settings.alamatUsaha || ''}</p>
          </div>
          <div className="text-right">
            <h3 className="text-3xl font-extrabold text-blue-900 tracking-wide">INVOICE</h3>
            <p className="text-sm font-bold text-blue-700">{nomorDisplay || '(Draft)'}</p>
            <p className="text-xs text-slate-400 mt-1">Tanggal: {tanggalLabel}</p>
          </div>
        </div>

        <div className="flex items-start justify-between bg-slate-50 rounded-xl px-5 py-4 mt-6">
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Kepada Yth:</p>
            <p className="font-bold text-slate-800 mt-0.5">{sekolah.nama}</p>
            {pjDisplay && <p className="text-xs text-slate-500 mt-0.5">PJ: {pjDisplay}</p>}
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Bulan Tagihan:</p>
            <p className="font-bold text-blue-700 mt-0.5">{periodeLabel}</p>
          </div>
        </div>

        <table className="w-full text-sm mt-8 mb-2">
          <thead>
            <tr className="border-b-2 border-slate-800 text-[11px] font-bold uppercase text-slate-700">
              <th className="text-left py-2 pr-2 w-8">No</th>
              <th className="text-left py-2">Uraian</th>
              <th className="text-center py-2">Siswa</th>
              <th className="text-right py-2">Harga<br />Satuan</th>
              <th className="text-right py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map(row => (
              <tr key={row.no} className="border-b border-slate-200">
                <td className="py-4 align-top">{row.no}</td>
                <td className="py-4 pr-6 align-top">{row.uraian}</td>
                <td className="py-4 text-center align-top">{row.qty}</td>
                <td className="py-4 text-right align-top whitespace-nowrap">{formatRupiah(row.harga)}</td>
                <td className="py-4 text-right align-top font-bold whitespace-nowrap">{formatRupiah(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {carryLines.length > 0 && (
          <div className="mt-1 mb-2 space-y-0.5 text-xs">
            {carryLines.map(line => (
              <p
                key={`${line.invoiceId}-${line.kind}`}
                className={line.amount < 0 ? 'text-emerald-600' : 'text-amber-600'}
              >
                {line.description}: {formatRupiah(Math.abs(line.amount))}
                {line.amount < 0 ? ' (credit)' : ''}
              </p>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center pt-4 pb-3">
          <span className="font-extrabold text-slate-800 tracking-wide">GRAND TOTAL</span>
          <span className="text-xl font-extrabold text-blue-700">{formatRupiah(grandTotal)}</span>
        </div>
        <div className={`bg-blue-50/60 rounded-lg px-4 py-2.5 text-xs text-slate-600 border border-blue-100/60 ${isDraft ? 'mb-10' : 'mb-6'}`}>
          <span className="font-semibold text-slate-700">Terbilang: </span>
          <span className="italic">"{terbilang(grandTotal)}"</span>
        </div>

        {!isDraft && (
          <div className="grid grid-cols-3 gap-3 mb-10 text-xs">
            <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5">
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-wide">Total Tagihan</p>
              <p className="font-bold text-slate-800 mt-0.5">{formatRupiah(settlement.total)}</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5">
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-wide">Sudah Dibayar</p>
              <p className="font-bold text-emerald-700 mt-0.5">{formatRupiah(settlement.dibayar)}</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5">
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-wide">Sisa Tagihan</p>
              <p className={`font-bold mt-0.5 ${settlement.sisa > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatRupiah(settlement.sisa)}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-8 items-end">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 text-xs text-slate-600 leading-relaxed">
            <p className="font-bold text-slate-800 mb-1.5">Catatan Pembayaran:</p>
            {settings.rekeningBank ? (
              <>
                <p>Pembayaran dapat ditransfer ke rekening berikut:</p>
                <p>Bank {settings.rekeningBank} No. Rekening: {settings.rekeningNomor} a.n. {settings.rekeningAtasNama}</p>
                <p>Mohon mencantumkan nomor invoice pada berita transfer. Terima kasih atas kepercayaan Bapak/Ibu.</p>
              </>
            ) : (
              <p className="text-slate-400">Belum diatur — isi info rekening di Pengaturan.</p>
            )}
          </div>
          <div className="text-center text-xs">
            <p className="text-slate-500 mb-1">Hormat Kami,</p>
            <img src={SIGNATURE_URL} alt="Tanda tangan" className="h-12 object-contain mx-auto" />
            <p className="border-t border-slate-400 inline-block pt-1 px-2 font-bold text-slate-800">{settings.penandatangan || '-'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}