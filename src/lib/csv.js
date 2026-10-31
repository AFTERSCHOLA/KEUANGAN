// ============================================
// M2.6 — CSV pack (Person 4)
// Semua 6 export dari model baru: nama file bawa periode "YYYY-MM",
// statistik trainer di-key pakai trainerId, absensi difilter pakai
// field `periode` (bukan prefix string tanggal).
// ============================================

import { formatJadwalList } from './format.js'
import { formatMatrixCell } from './trainerAttendance.js'

// M-F8 — Excel Indonesia expects `;` separators: with `,` the sheet
// collapses into one comma-joined column. BOM + quoting kept; quoting
// now also triggers on `;`.
// Task-2 open-correctly — every export carries the `sep=;` opener line
// (after BOM, honored + hidden by Excel) so double-click opens split
// columns with no wizard, plus CRLF endings (spec builder-check #5).
function downloadCSV(headers, rows, filename, periode) {
  const csvContent = "\uFEFF" + "sep=;\r\n" + [
    headers.join(";"),
    ...rows.map(row => row.map(val => {
      let text = String(val === undefined || val === null ? "" : val).replace(/"/g, '""')
      return text.includes(';') || text.includes('\n') || text.includes('\r') || text.includes('"') ? `"${text}"` : text
    }).join(";"))
  ].join("\r\n")

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${periode}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportSekolahCSV(sekolah, trainer, periode) {
  const headers = ["Nama Sekolah", "Alamat", "Jadwal", "Tarif SPP", "Trainer Ditugaskan"]
  const rows = sekolah.map(s => [
    s.nama,
    s.alamat,
    // TEAM_FEEDBACK G3 — same formatted range the cards show (no column
    // change); legacy rows without jadwalList fall back to s.jadwal.
    formatJadwalList(s.jadwalList) || s.jadwal,
    s.spp,
    (s.trainerIds || []).map(id => trainer.find(t => t.id === id)?.nama).filter(Boolean).join('; ') || 'Belum Ditugaskan',
  ])
  downloadCSV(headers, rows, 'Daftar_Sekolah_Mitra', periode)
}

export function exportSiswaCSV(siswa, periode) {
  const headers = ["Nama Siswa", "Sekolah", "Kelas", "No WhatsApp", `Lunas SPP ${periode}`]
  const rows = siswa.map(s => [
    s.nama,
    s.sekolahNama,
    s.kelas,
    s.wa,
    s.sppLunas?.[periode] ? 'Lunas' : 'Belum Lunas',
  ])
  downloadCSV(headers, rows, 'Daftar_Siswa_Afterschola', periode)
}

export function exportTrainerCSV(trainerFinanceRows, periode) {
  const headers = ["Nama Trainer", "Sekolah Penugasan", "Honor per Sesi", "Sesi Hadir", "Beban Honor", "Honor Dibayar", "Sisa Honor"]
  const rows = trainerFinanceRows.map(t => [
    t.nama, t.sekolahNama, t.tarif, t.hadirSesi, t.bebanHonor, t.dibayar, t.sisaHonor,
  ])
  downloadCSV(headers, rows, 'Daftar_Trainer_Afterschola', periode)
}

export function exportAbsensiCSV(absensi, sekolah, periode) {
  const headers = ["Tanggal", "Sekolah", "Trainer", "Status Trainer", "Jumlah Siswa Hadir"]
  const filtered = absensi.filter(a => a.periode === periode)
  const rows = filtered.map(a => [
    a.tanggal,
    sekolah.find(s => s.id === a.sekolahId)?.nama || '-',
    a.trainerNama,
    a.trainerStatus,
    (a.siswaList || []).filter(s => s.status === 'Hadir').length,
  ])
  downloadCSV(headers, rows, 'Laporan_Absensi', periode)
}

export function exportPembayaranCSV(honorPayments, trainer, periode) {
  const headers = ["Trainer", "Nominal", "Tanggal Bayar"]
  const filtered = honorPayments.filter(p => p.periode === periode)
  const rows = filtered.map(p => [
    trainer.find(t => t.id === p.trainerId)?.nama || '-',
    p.nominal,
    p.tanggalBayar,
  ])
  downloadCSV(headers, rows, 'Laporan_Pembayaran_Honor', periode)
}

export function exportRingkasanCSV(finance, periode) {
  const headers = ["Pos", "Nominal", "Jenis"]
  const rows = [
    ["Potensi SPP Total", finance.potensiSpp, "Memo"],
    ["Pemasukan SPP (Lunas)", finance.pemasukanSpp, "Kas"],
    ["SPP Belum Tertagih", finance.belumTertagih, "Memo"],
    ["Beban Honor Trainer (Akrual)", finance.totalBebanHonor, "Memo"],
    ["Honor Dibayar (Kas)", finance.totalHonorDibayar, "Kas"],
    ["Sisa Kewajiban Honor", finance.sisaKewajiban, "Memo"],
    ["Laba / Rugi (Kas)", finance.labaRugi, "Kas"],
  ]
  downloadCSV(headers, rows, 'Ringkasan_Keuangan', periode)
}

// ============================================
// SB.B.3 (D-SB12) — export laporan piutang aging, membawa kolom
// Sumber Dana (Sekolah / Ortu Langsung), diambil dari
// sekolah.metodePembayaran.sumberDana lewat computeAging() di
// AgingReport.jsx (bukan dari sppPayments — lihat catatan di sana).
// ============================================
export function exportAgingCSV(agingRows, periode) {
  const headers = ["Sekolah", "Sumber Dana", "Bulan Ini", "1 Bulan", "2+ Bulan", "Total Piutang"]
  const rows = agingRows.map(r => [
    r.nama,
    r.sumberDana === 'ortu' ? 'Ortu Langsung' : 'Sekolah',
    r.bulanIni,
    r.satuBulan,
    r.duaBulanPlus,
    r.total,
  ])
  downloadCSV(headers, rows, 'Laporan_Piutang_Aging', periode)
}

// ============================================
// PG.C.1 (F-PG3; D-PG6) — export tabel Jadwal Penugasan harian.
// P2 — visible-view parity: rows may carry their own `tanggal`
// (Mingguan/Kalender per-iso); rows without it fall back to the label
// arg. Second arg doubles as the filename suffix.
// displayRows: [{ sekolah, trainer, asisten, waktu, tanggal? }] — baris tampil yang
// sudah difilter scope (export tidak pernah lebih dari yang terlihat di
// tabel, D-PG7). tanggal: "YYYY-MM-DD" pilihan user (bukan periode
// bulanan — D-PG5), menjadi kolom Tanggal + suffix nama file:
// Jadwal_Penugasan_2026-09-24.csv. BOM + quoting via downloadCSV
// (Excel-ready, sama seperti 6 export existing).
// ============================================
export function exportJadwalPenugasanCSV(displayRows, tanggal) {
  const headers = ["Sekolah", "Trainer", "Asisten", "Waktu", "Tanggal"]
  const rows = (displayRows || []).map(r => [
    r.sekolah, r.trainer, r.asisten, r.waktu, r.tanggal ?? tanggal,
  ])
  downloadCSV(headers, rows, 'Jadwal_Penugasan', tanggal)
}

// AP.C.3 (F-AP5; D-AP5) — export the Rekap matrix ACTUALS (one row per
// school × date × entry). displayRows: [{ sekolah, tanggal, nama, peran,
// status, keterangan, catatan, teks }] — full details (status +
// keterangan + admin correction note, BUG6), byte-equal to the visible
// cells (D-PG6 idiom). Filename carries the monthly periode:
// Rekap_Pengajar_2026-09.csv. BOM + quoting via downloadCSV
// (Excel-ready, same as existing exports).
export function exportRekapPengajarCSV(displayRows, periode) {
  const headers = ["Sekolah", "Tanggal", "Nama", "Peran", "Status", "Keterangan", "Catatan", "Teks"]
  const rows = (displayRows || []).map(r => [
    r.sekolah, r.tanggal, r.nama, r.peran, r.status, r.keterangan, r.catatan, r.teks,
  ])
  downloadCSV(headers, rows, 'Rekap_Pengajar', periode)
}

// Task-2 — matrix-shape CSV variant (docs/exemplar/ABSENSI
// TRAINER-new.xlsx columns: NO + NAMA SEKOLAH + one column per calendar
// day, two-row weekday/date header flattened to `<Hari> <n>` per column
// — same Monday-first table as server/lib/exportMatrix.php). Consumes the
// cached buildTrainerMatrix memo (same object the table renders — scope
// filtered upstream, so never more rows than visible); each cell joins
// its per-entry formatMatrixCell texts with `\n` (the xlsx newline-in-cell
// idiom), byte-equal to the visible cells. Filename:
// Rekap_Matriks_<periode>.csv. CRLF + sep opener via downloadCSV.
const MATRIX_HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

export function exportRekapMatrixCSV(matrix) {
  const periode = matrix?.periode
  const dates = matrix?.dates || []
  const header = ['NO', 'NAMA SEKOLAH', ...dates.map(d => {
    const [y, m, day] = String(d).split('-').map(Number)
    const hari = MATRIX_HARI[(new Date(y, m - 1, day).getDay() + 6) % 7] || ''
    return `${hari} ${day}`
  })]
  const rows = (matrix?.rows || []).map((r, i) => [
    String(i + 1),
    r.nama,
    ...dates.map(d => (r.cells[d] || []).map(entry => formatMatrixCell(entry)).join('\n')),
  ])
  downloadCSV(header, rows, 'Rekap_Matriks', periode)
}
