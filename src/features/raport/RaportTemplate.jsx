import { academicYearLabel } from '../../lib/constants.js'
import { getSettings } from '../../lib/store.js'

// Slice 1 Raport (Task 7) — cetakan read-only dari record, meniru
// docs/exemplar/TEMPLATE_RAPPORT_CODING.html verbatim: lembar A4
// 794x1122 (Times serif, posisi absolut, dekorasi sudut kuning/navy +
// watermark — art diekstrak sekali ke public/raport/, bukan base64 di
// bundle; gaya di print.css blok .raport-sheet). Toolbar no-print
// (Kembali / Cetak Raport via window.print) + root printable-report
// (print.css) dipertahankan. Nilai cetak = record
// (total/rataRata/grade/catatan), TIDAK dihitung-ulang di render
// (spec §4.3). Terbilang tidak ada — nilai bukan uang.
const ASPECT_ROWS = [
  ['helpingTeam', 'Helping Team'],
  ['computationalThinking', 'Computational Thinking'],
  ['problemSolving', 'Problem Solving'],
  ['creativity', 'Creativity/Improvisation'],
]

const EXEMPLAR_ADDR_1 = 'Jl. Cisaranten Wetan 167A, Cisaranten Wetan, Kec.'
const EXEMPLAR_ADDR_2 = 'Cinambo, Kota Bandung'
const EXEMPLAR_PHONE = '0823-3808-9915'

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

// Prop `sekolah` dipertahankan untuk kontrak parent (RaportList.jsx
// mengopernya); area cetak exemplar hanya memuat Nama + Kelas.
export default function RaportTemplate({ raport, siswa, sekolah, onBack }) {
  if (!raport) return null
  const settings = getSettings()
  const nilai = raport.nilai || {}
  // Alamat kop: pengaturan bila diisi, exemplar bila kosong (S7.2).
  const alamatCustom = (settings.alamatUsaha || '').trim()
  const addr1 = alamatCustom || EXEMPLAR_ADDR_1
  const addr2 = alamatCustom ? '' : EXEMPLAR_ADDR_2
  const signer = settings.penandatangan || '(……………….)'
  const nama = siswa?.nama || 'Siswa tidak ditemukan'
  const kelas = siswa?.kelas || '-'
  const tahunLabel = academicYearLabel(Number(raport.tahunAjaran))
  const tanggalLabel = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border no-print">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Raport — {nama}</h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-slate-500">{raport.semester} · {tahunLabel}</p>
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

      <div className="printable-report raport-sheet">
        <div className="raport-page">

          {/* dekorasi sudut (kiri-atas / kanan-bawah) */}
          <svg className="abs" style={{ left: 0, top: 0 }} width="794" height="1122" viewBox="0 0 794 1122" aria-hidden="true">
            <polygon fill="#F7D109" points="0,179 0,0 301,0" />
            <polygon fill="#FFDE58" points="0,392 0,0 119,0" />
            <polygon fill="#0D2E52" points="109,0 0,142 0,0" />
            <polygon fill="#F7D109" points="819,975 819,1152 522,1152" />
            <polygon fill="#FFDE58" points="819,846 819,1216 707,1216" />
            <polygon fill="#0D2E52" points="711,1152 832,994 821,1010 821,1152" />
          </svg>

          {/* watermark */}
          <img className="abs" src="/raport/watermark.png" alt="" style={{ left: '186px', top: '376px', width: '437px', height: '404px' }} />

          {/* header */}
          <img className="abs" src="/raport/logo-after-schola.png" alt="After Schola" style={{ left: '638px', top: '-37px', width: '85px', height: '151px' }} />
          <img className="abs" src="/raport/logo-small.png" alt="" style={{ left: '725px', top: '11px', width: '56px', height: '52px' }} />
          <div className="abs brand">YELLOBOX.ID</div>
          <div className="abs sans addr addr1">{addr1}</div>
          {addr2 && <div className="abs sans addr addr2">{addr2}</div>}
          {!alamatCustom && <img className="abs" src="/raport/icon-pin.png" alt="" style={{ left: '206.7px', top: '134px', width: '12.6px', height: '17.5px' }} />}
          <img className="abs" src="/raport/icon-phone.png" alt="" style={{ left: '211px', top: '161px', width: '16.7px', height: '20.6px' }} />
          <div className="abs sans phone t">{EXEMPLAR_PHONE}</div>
          <div className="abs rule"></div>

          {/* title & intro (spasi di sekitar <br/> menjaga getByText
              'PENILAIAN AKHIR SISWA' S7.1/S7.2 tetap cocok; visual dua
              baris exemplar tidak berubah) */}
          <div className="abs title t">PENILAIAN AKHIR{' '}<br />SISWA</div>

          <div className="abs intro t">Berdasarkan hasil penilaian kegiatan siswa selama mengikuti <b>Ekstrakurikuler CODING</b><br />Semester {raport.semester} Tahun Ajaran {tahunLabel}, kami menerangkan bahwa</div>

          <div className="abs field-row t" style={{ top: '369px' }}><span className="lbl">Nama</span>:<span className="val">{nama}</span></div>
          <div className="abs field-row t" style={{ top: '397px' }}><span className="lbl">Kelas</span>:<span className="val">{kelas}</span></div>

          <div className="abs lead t">Memperoleh <b>Penilaian Akhir Semester (PAS)</b> dengan uraian sebagai berikut</div>

          {/* score table */}
          <table id="nilai">
            <colgroup><col style={{ width: '46.6px' }} /><col style={{ width: '442.7px' }} /><col style={{ width: '104.7px' }} /></colgroup>
            <tbody>
              <tr><td className="c b">No.</td><td className="c b">Daftar Penilaian</td><td className="c b">Nilai</td></tr>
              {ASPECT_ROWS.map(([key, label], idx) => (
                <tr key={key}><td className="c">{idx + 1}.</td><td>{label}</td><td className="c">{nilai[key] ?? '-'}</td></tr>
              ))}
              <tr><td className="c b" colSpan="2">Total Nilai</td><td className="c">{raport.total ?? '-'}</td></tr>
            </tbody>
          </table>

          {/* final score & grade: Total ÷ 4 = Nilai Akhir (top = total
              dividend, static 4 divisor below, bold middle = quotient) */}
          <table id="akhir">
            <colgroup><col /><col /><col /><col /><col /><col /></colgroup>
            <tbody>
              <tr>
                <td className="b" rowSpan="2">Nilai Akhir</td>
                <td style={{ height: '30px' }}>{raport.total ?? '-'}</td>
                <td className="b" rowSpan="2">{formatDesimal(raport.rataRata)}</td>
                <td className="nb" rowSpan="2"></td>
                <td className="b" rowSpan="2">Grade Nilai</td>
                <td className="b" rowSpan="2">{raport.grade || '-'}</td>
              </tr>
              <tr><td style={{ height: '30px' }}>4</td></tr>
            </tbody>
          </table>

          {/* notes */}
          <table id="catatan">
            <colgroup><col style={{ width: '94.5px' }} /><col /></colgroup>
            <tbody>
              <tr><td>Catatan :</td><td>{raport.catatan || '-'}</td></tr>
            </tbody>
          </table>

          {/* signature */}
          <div className="abs sign-date t">Bandung, {tanggalLabel}</div>
          <div className="abs sign-role t">Instruktur,</div>
          <div className="abs sign-name t">{signer}</div>

        </div>
      </div>
    </div>
  )
}
