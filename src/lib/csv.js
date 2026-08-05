// ============================================
// M2.6 — CSV pack (Person 4)
// Semua 6 export dari model baru: nama file bawa periode "YYYY-MM",
// statistik trainer di-key pakai trainerId, absensi difilter pakai
// field `periode` (bukan prefix string tanggal).
// ============================================

function downloadCSV(headers, rows, filename, periode) {
  const csvContent = "\uFEFF" + [
    headers.join(","),
    ...rows.map(row => row.map(val => {
      let text = String(val === undefined || val === null ? "" : val).replace(/"/g, '""')
      return text.includes(',') || text.includes('\n') || text.includes('"') ? `"${text}"` : text
    }).join(","))
  ].join("\n")

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
    s.jadwal,
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