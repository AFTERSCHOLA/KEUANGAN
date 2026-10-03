# Design Spec — Slice 1: Raport + Tingkat/Mapel (Data Siswa)

**Tanggal:** 2026-10-03
**Status:** Disetujui user (konseptual) — menunggu review tertulis file ini sebelum implementation plan.
**Pendekatan terpilih:** A — Entity raport persisten + form manual + template cetak.

## 1. Pemahaman bersama (brief)

- **Tujuan:** Admin/Trainer dapat mengisi 4 nilai aspek + catatan per siswa per semester, lalu mencetak raport dengan format tetap meniru `FORMAT RAPORT CODING.docx` — seperti alur Invoice (isi form → cetak dokumen). Perhitungan otomatis belum dibutuhkan.
- **Asumsi yang dikunci dari tanya-jawab:**
  - D1: Nilai manual semua — Total = jumlah 4 aspek (otomatis), Rata-rata = total/4 (otomatis), Grade input manual bebas (mis. `A-`).
  - D2: `tingkat` + `mapel` menjadi field di Data Siswa + di-snapshot ke record raport (riwayat tidak berubah saat siswa naik level).
  - D3: Trainer ikut isi — Trainer menulis untuk murid yang dia ajar; Admin Cabang verifikasi cabang sendiri; Superadmin semua cabang.
  - D4: Periode raport = semester (`Ganjil`/`Genap` + `tahunAjaran` = tahun awal ajaran A pada label A/A+1, meniru academic-year engine D4), 1 raport per (siswa, semester, tahunAjaran).
- **Di luar scope slice ini:** Dashboard Simpel (II), Weekly/Calendar (III+V), Absensi Staff (IV — deferred), Notifikasi (VII), perubahan billing/keuangan.

## 2. Arsitektur & model data

- Entity baru `raport` (JSON record → localStorage + MySQL via PHP API, ikut storage decision tree SCOPE_EXPANSION_PLAN):
  `{ id, siswaId, sekolahId, cabangId, semester: 'Ganjil'|'Genap', tahunAjaran,
     tingkatSnapshot, mapelSnapshot, nilai: { helpingTeam, computationalThinking, problemSolving, creativity } (0–100),
     total (derived), rataRata (derived), grade (string bebas), catatan (≤500 char),
     status: 'Draft'|'Diajukan'|'Terverifikasi', dibuatOleh, diverifikasiOleh, createdAt, updatedAt }`
- Unik: satu record per `(siswaId, semester, tahunAjaran)` — simpan ulang = koreksi record yang sama (load-to-correct, meniru Riwayat Absensi), bukan duplikat (server 409 + pesan mengarah ke koreksi).
- Siswa bertambah dua field: `tingkat: ''|'Beginner'|'Intermediate'` (dropdown), `mapel` (input teks + datalist dari nilai KETERANGAN jadwal yang sudah ada: Scratch 3, Scratch Jr, Roblox Studio, Python/VsCode, IoT, …). Factory: perluas `newSiswa()` + factory baru `newRaport()` di `src/lib/constants.js` (R3 — factories only).
- Snapshot rule: edit `tingkat`/`mapel` di Data Siswa TIDAK menulis ulang raport lama (display-cache pattern seperti `sekolahNama`).
- RBAC server otoritatif (taste #33, #61): Trainer tulis hanya murid sekolah yang ditugaskan padanya (via `sekolahIds`/`penugasanPengajar`); Admin Cabang tulis/verifikasi cabang sendiri; Superadmin penuh; Trainer tidak dapat menghapus yang sudah `Terverifikasi` (hanya Admin). Backup v2+ mencakup `raport`.

## 3. Komponen & UI (mirror idiom, tanpa pola baru)

- `src/features/raport/` baru: `RaportList.jsx` (filter semester + sekolah + cari siswa; tabel idiom standar `bg-slate-50` header, `rounded-2xl` card), `RaportForm.jsx` (Modal standar header `bg-blue-900` + judul `text-yellow-300`; label Indonesia: Simpan/Batal/Hapus; 4 input angka digit polos, grade teks, catatan textarea, badge status Draft/Diajukan/Terverifikasi), `RaportTemplate.jsx` (printable-report + `window.print()`, meniru struktur `InvoiceTemplate.jsx`: kop logo, judul PENILAIAN AKHIR SISWA, Nama/Kelas/Tingkat/Mapel/Semester, tabel 4 aspek + Total, baris Nilai Akhir + Grade, Catatan, baris tanggal Bandung + tanda tangan Instruktur, tombol Kembali/Cetak).
- Form Data Siswa: tambah dropdown Tingkat + input Mapel+datalist; mode `readOnly` (Trainer view) menyembunyikan tombol tulis.
- Style-frozen (R5): className/table/modal/button dipinjam verbatim dari Invoice/SlipHonor/StudentList; tidak ada warna/font/idiom baru. Copy Indonesia dipin agar bisa dipilih test by role/name.

## 4. Aliran data

1. Pilih siswa → snapshot `tingkat`/`mapel`/`sekolahId`/`cabangId` → isi 4 nilai + grade + catatan → Total/Rata otomatis di klien (satu-satunya tempat hitung, meniru `finance.js` rule R4) → Simpan sebagai Draft/Diajukan via `writeRemote('raport')`.
2. Trainer: Draft → Diajukan. Admin Cabang: verifikasi (Diajukan → Terverifikasi) atau koreksi + kembalikan ke Draft. Superadmin: semua transisi.
3. Cetak: `RaportTemplate` read-only dari record; badge status tampil di cetakan; nilai cetak = record (tidak dihitung ulang di render).
4. Hapus: dialog Konfirmasi (`Hapus`/`Batal`) — hanya Admin (dan Trainer untuk Draft miliknya yang belum diajukan). Bukan ledger uang, jadi hapus dengan konfirmasi diizinkan.

## 5. Error handling & validasi

- Validasi klien + server: 4 nilai wajib 0–100 (input `type=number`, `min=0`, `max=100`, isi digit polos); grade wajib (maks 5 char); catatan opsional; `siswaId`/`semester`/`tahunAjaran` wajib.
- Duplikat semester → 409: tampilkan pesan `Raport semester ini sudah ada — buka untuk koreksi` + tombol muat-ke-form (load-to-correct).
- Forbidden (tulis di luar scope) → tutup dialog + `showToast` pesan server (server tetap penolak otoritatif).
- Semua kegagalan I/O/API punya jalur gagal yang jelas (UNIVERSAL #9): pesan error lokal di baris form, tidak silent.

## 6. Testing (mengikuti testing taste)

- Unit (`src/lib/__tests__/raport*.test.js`): total/rata derivation, factory default, snapshot-immutability (edit siswa tidak mengubah raport lama), unik-per-semester guard.
- E2E `tests/raport-verify.spec.js` (persisten, penamaan per baris milestone): data disposable di browser, guard wipe sekali-per-halaman; locator `getByRole` dulu, fallback `:has()` terdokumentasi; assert zero pageerror; isi angka digit polos; periode semester dinamis (tahun ajaran berjalan); intercept `window.print()` + assert terpanggil; peran dilatih: Trainer isi miliknya OK vs tulis murid orang lain ditolak, Admin verifikasi OK.
- Visual parity vs `FORMAT RAPORT CODING.docx`: baris checklist manual (legitimate manual row, testing taste #19) + screenshot full-page per peran.
- Gate: `npm run build` bersih + suite hijau sebelum DONE; kegagalan tak terkait dilabeli pre-existing (taste #9) dengan bukti `git stash` bila perlu.

## 7. Sisa slice (dekomposisi, bukan scope file ini)

- Slice 2: Dashboard Simpel (toggle/ringkas di Overview — hitung siswa, pemasukan, rugi, sekolah; read-only atas `financialData()`).
- Slice 3: Weekly Schedule + Calendar (matriks mingguan HARI×JAM dari `jadwalList`×`penugasanPengajar` + kalender bulanan konvergensi; read-only; nota: `PenugasanTimetable` saat ini harian per-tanggal, bukan mingguan).
- Slice 4 (deferred): Staff Attendance — menunggu model akun eksternal.
- Slice 5: Notifikasi H-1/H-day (perlu keputusan kanal: WA manual vs in-app; tanpa infra push, kemungkinan mulai dari pengingat in-app + link WA).
- Fondasi VI/VIII ikut Slice 1 (field siswa); pemakaian `mapel` di jadwal (`KETERANGAN`) tetap teks bebas, tidak disatukan paksa di slice ini.

## 8. Langkah berikut

- Setelah file ini direview dan disetujui tertulis → invoke `writing-plans` untuk memecah Slice 1 menjadi `*_PLAN.md` + `*_MILESTONES.md` (MICROTASK/VERIFY format, taste #52/#69) sebelum kode apa pun ditulis (HARD-GATE brainstorming).
