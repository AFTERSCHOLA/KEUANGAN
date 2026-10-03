// Domain raport semester (Slice 1) — satu-satunya tempat hitung-hitungan
// total/rata-rata di klien. Nilai `null` dihitung 0 hanya untuk preview;
// validasi wajib (nilai 0–100) ada di server + form, bukan di sini.

// Kunci aspek nilai — dipakai Task 5/6/7 verbatim, jangan diganti.
export const RAPORT_ASPECT_KEYS = ['helpingTeam', 'computationalThinking', 'problemSolving', 'creativity']

// Daftar tingkat Data Siswa — dipakai Task 5/6/7 verbatim.
export const RAPORT_TINGKAT = ['Beginner', 'Intermediate']

// Daftar semester raport — dipakai Task 5/6/7 verbatim.
export const RAPORT_SEMESTER = ['Ganjil', 'Genap']

// Total = jumlah 4 aspek. Aspek `null`/kosong = 0 (preview saja).
export function raportTotal(nilai) {
  return RAPORT_ASPECT_KEYS.reduce((jumlah, kunci) => jumlah + (Number(nilai?.[kunci]) || 0), 0)
}

// Rata-rata = total / 4.
export function raportRataRata(nilai) {
  return raportTotal(nilai) / RAPORT_ASPECT_KEYS.length
}

// Kunci nilai tingkat/mapel/sekolah siswa saat ini ke snapshot raport.
// Hasilnya salinan nilai (display-cache seperti `sekolahNama`): edit Data
// Siswa setelahnya tidak mengubah snapshot yang sudah dikunci.
export function buildRaportSnapshot(siswa) {
  return {
    tingkatSnapshot: siswa?.tingkat ?? '',
    mapelSnapshot: siswa?.mapel ?? '',
    sekolahId: siswa?.sekolahId ?? '',
  }
}
