import { academicYearLabel } from '../../lib/constants.js'
import { getSettings } from '../../lib/store.js'

const LOGO_URL = '/invoice/logo.png'

// Slice 1 Raport (Task 7) — cetakan read-only dari record, meniru
// struktur InvoiceTemplate.jsx verbatim: toolbar no-print (Kembali /
// Cetak Raport via window.print) + root printable-report (print.css).
// Nilai cetak = record (total/rataRata/grade/catatan), TIDAK
// dihitung-ulang di render (spec §4.3). Terbilang tidak ada — nilai
// bukan uang.
const ASPECT_ROWS = [
  ['helpingTeam', 'Helping Team'],
  ['computationalThinking', 'Computational Thinking'],
  ['problemSolving', 'Problem Solving'],
  ['creativity', 'Creativity'],
]

// Desimal Indonesia: 89.25 -> "89,25".
function formatDesimal(nilai) {
  if (nilai === null || nilai === undefined || nilai === '') return '-'
  return Number(nilai).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

function statusBadge(status) {
  if (status === 'Terverifikasi') return 'bg-emerald-100 text-emerald-700'
  if (status === 'Diajukan') return 'bg-blue-100 text-blue-700'
  return 'bg-slate-100 text-slate-500'
}

export default function RaportTemplate({ raport, siswa, sekolah, onBack }) {
  if (!raport) return null
  const settings = getSettings()
  const nilai = raport.nilai || {}
  // Snapshot dikunci saat create (display-cache seperti sekolahNama);
  // live siswa hanya fallback bila snapshot kosong.
  const tingkat = raport.tingkatSnapshot || siswa?.tingkat || ''
  const mapel = raport.mapelSnapshot || siswa?.mapel || ''
  const tanggalLabel = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border no-print">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Raport — {siswa?.nama || 'Siswa tidak ditemukan'}</h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-slate-500">{raport.semester} · {academicYearLabel(Number(raport.tahunAjaran))}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge(raport.status)}`}>
              {raport.status}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm px-4 py-2 rounded-xl transition">Kembali</button>
          <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm px-4 py-2 rounded-xl transition shadow-sm">Cetak Raport</button>
        </div>
      </div>

      <div className="printable-report bg-white rounded-2xl shadow-sm border p-8 max-w-3xl mx-auto">
        <div className="flex items-start justify-between pb-5 border-b border-slate-200">
          <div>
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="h-14 object-contain" onError={e => { e.currentTarget.style.display = 'none' }} />
            ) : (
              <img src={LOGO_URL} alt="Logo" className="h-14 object-contain" onError={e => { e.currentTarget.style.display = 'none' }} />
            )}
            <p className="text-xs text-slate-400 mt-2">{settings.alamatUsaha || ''}</p>
          </div>
          <div className="text-right">
            <h3 className="text-3xl font-extrabold text-blue-900 tracking-wide">PENILAIAN AKHIR SISWA</h3>
            <p className="text-sm font-bold text-blue-700">Semester {raport.semester} · {academicYearLabel(Number(raport.tahunAjaran))}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 bg-slate-50 rounded-xl px-5 py-4 mt-6 text-sm">
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Nama</p>
            <p className="font-bold text-slate-800 mt-0.5">{siswa?.nama || 'Siswa tidak ditemukan'}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Kelas</p>
            <p className="font-bold text-slate-800 mt-0.5">{siswa?.kelas || '-'}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Tingkat</p>
            <p className="font-bold text-slate-800 mt-0.5">{tingkat || '-'}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Mapel</p>
            <p className="font-bold text-slate-800 mt-0.5">{mapel || '-'}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Sekolah</p>
            <p className="font-bold text-slate-800 mt-0.5">{sekolah?.nama || 'Sekolah tidak ditemukan'}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Status</p>
            <p className="mt-0.5">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge(raport.status)}`}>
                {raport.status}
              </span>
            </p>
          </div>
        </div>

        <table className="w-full text-sm mt-8 mb-2">
          <thead>
            <tr className="border-b-2 border-slate-800 text-[11px] font-bold uppercase text-slate-700">
              <th className="text-left py-2 pr-2 w-8">No</th>
              <th className="text-left py-2">Aspek Penilaian</th>
              <th className="text-right py-2">Nilai</th>
            </tr>
          </thead>
          <tbody>
            {ASPECT_ROWS.map(([key, label], idx) => (
              <tr key={key} className="border-b border-slate-200">
                <td className="py-4 align-top">{idx + 1}</td>
                <td className="py-4 pr-6 align-top">{label}</td>
                <td className="py-4 text-right align-top font-bold">{nilai[key] ?? '-'}</td>
              </tr>
            ))}
            <tr className="border-b-2 border-slate-800">
              <td colSpan={2} className="py-4 font-extrabold text-slate-800 tracking-wide">TOTAL</td>
              <td className="py-4 text-right font-extrabold text-blue-700">{raport.total ?? '-'}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-between items-center pt-4 pb-3">
          <span className="font-extrabold text-slate-800 tracking-wide">Nilai Akhir</span>
          <span className="text-xl font-extrabold text-blue-700">{formatDesimal(raport.rataRata)}</span>
        </div>
        <div className="flex justify-between items-center pb-3">
          <span className="font-extrabold text-slate-800 tracking-wide">Grade</span>
          <span className="text-xl font-extrabold text-blue-700">{raport.grade || '-'}</span>
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 text-xs text-slate-600 leading-relaxed">
          <p className="font-bold text-slate-800 mb-1.5">Catatan:</p>
          <p>{raport.catatan || '-'}</p>
        </div>

        <div className="grid grid-cols-2 gap-8 items-end mt-10">
          <div />
          <div className="text-center text-xs">
            <p className="text-slate-500 mb-1">Bandung, {tanggalLabel}</p>
            <p className="text-slate-500 mb-1">Instruktur,</p>
            <div className="h-12" />
            <p className="border-t border-slate-400 inline-block pt-1 px-2 font-bold text-slate-800">{settings.penandatangan || '(........................)'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
