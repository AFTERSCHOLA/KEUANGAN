# Feature Slices Plan — 8-Item Request Roadmap

**Tanggal:** 2026-10-03
**Status:** Roadmap disetujui-sebagai-indeks; tiap slice tetap lewat siklus spec → plan → implementasi sendiri (tidak ada kode sebelum spec slice-nya disetujui).
**Aturan main (taste):** UNIVERSAL.md dulu; slice terkecil yang jalan end-to-end; tiap milestone ada VERIFY; tiru idiom yang sudah ada;RBAC eksplisit; tidak ada `console.log` di `src/`; laporan `Verified:` ringkas.

## 1. Peta 8 item → slice

| # | Item user | Slice | Disposisi | Alasan |
|---|-----------|-------|-----------|--------|
| I | Raport | Slice 1 | ✅ Spec ditulis (`docs/superpowers/specs/2026-10-03-raport-design.md`) | Entity + form manual + cetak mirip Invoice |
| VI | Tingkat (Beginner/Intermediate) | Slice 1 | ✅ Ikut Slice 1 | Field `tingkat` di Data Siswa + snapshot raport |
| VIII | Mapel (Scratch/Python/…) | Slice 1 | ✅ Ikut Slice 1 | Field `mapel` di Data Siswa + snapshot raport |
| II | Dashboard Simpel | Slice 2 | 📋 Direncana di bawah | Read-only atas `financialData()` |
| III | Tabel Jadwal Mingguan | Slice 3 | 📋 Direncana di bawah — BELUM ADA (yang ada `PenugasanTimetable.jsx:16` itu harian per-tanggal, bukan matriks HARI×JAM exemplar) | View baru, tanpa ubah schema |
| V | Kalender | Slice 3 | 📋 Satu slice dengan III (konvergensi) | Kalender = agregat bulanan dari join yang sama |
| VII | Notifikasi H-1/H-day | Slice 4 | 📋 Direncana di bawah | Tanpa infra push — in-app dulu |
| IV | Staff Attendance | Deferred | ⏸️ Ditunda (keputusan user) | Redundan tanpa akun eksternal |

## 2. Slice 2 — Dashboard Simpel (item II)

- **Tujuan satu kalimat:** Pengguna melihat kondisi saat ini (siswa, pemasukan, laba/rugi, sekolah) dalam satu pandangan sederhana tanpa grafik rumit.
- **Concrete pick:** Toggle `Ringkas`/`Lengkap` di tab Overview (persisted via UI state, meniru pola `sidebarCollapsed` di `App.jsx:157`); mode Ringkas menampilkan 4 kartu besar: Jumlah Siswa Aktif, Pemasukan bulan berjalan, Laba/Rugi berjalan, Jumlah Sekolah Mitra. Semua angka dari `financialData()`/`readCached` yang sudah ada — read-only, role-scope ikut yang berlaku.
- **Bukan scope:** grafik baru, metrik baru di luar 4 kartu, perubahan `finance.js`.
- **Open Q (kunci sebelum spec):** Q-S2-1: 4 kartu di atas sudah tepat, atau ada metrik pengganti (mis. jumlah trainer, tunggakan)? Q-S2-2: toggle untuk semua role atau hanya non-trainer?

## 3. Slice 3 — Jadwal Mingguan + Kalender (item III + V)

- **Tujuan satu kalimat:** Jadwal mengajar terlihat sebagai matriks mingguan (seperti sheet Jadwal exemplar: HARI/JAM/SEKOLAH/TRAINER/ASISTEN/KETERANGAN) dan sebagai kalender bulanan yang harinya memuat sesi masing-masing.
- **Concrete pick:** Di keluarga tab Jadwal tambah pemilih tampilan `Harian`/`Mingguan`/`Kalender` (segmented control, persisted); Mingguan = grup sesi per HARI dari join `jadwalList`×`penugasanPengajar` (mesin yang sama dengan `buildDailyTimetable`); Kalender = grid sebulan, tiap sel hari memuat sesi hari itu, klik hari → tampilkan daftar harian. Read-only penuh, tanpa tulis/schema baru, CSV/print ikut pola `PenugasanTimetable.jsx:118-133`.
- **Bukan scope:** edit jadwal dari kalender, drag-and-drop, sync eksternal.
- **Open Q:** Q-S3-1: satu tab dengan switcher (pick) vs tab terpisah? Q-S3-2: kalender menampilkan semua cabang atau ikut scope cabang terpilih?

## 4. Slice 4 — Notifikasi Trainer H-1/H-day (item VII)

- **Tujuan satu kalimat:** Trainer diingatkan jadwalnya sehari sebelum dan di hari-H tanpa infrastruktur push baru.
- **Concrete pick:** Kartu pengingat in-app di `TrainerDashboard`/Rekap Saya: bagian `Besok` (sesi H+1 dari penugasan, via `localDateString`) + bagian `Hari ini` (sudah ada — A4 SCOPE_EXPANSION_PLAN — tinggal pastikan selalu tampil). Tanpa WA push (WA ke diri sendiri tidak masuk akal), tanpa background job, tanpa dependensi baru (UNIVERSAL scope gate).
- **Bukan scope:** push notification, email, SMS gateway, pengingat ke sekolah/orang tua.
- **Open Q:** Q-S4-1: in-app cukup, atau tim mengharapkan WA push sungguhan (itu butuh infra → post-release)? Q-S4-2: perlu juga pengingat follow-up invoice exemplar (`TANGGAL FOLLOW UP`, F12-deferred) di slice ini atau tetap frequency terpisah?
- **Depends:** logika join Slice 3 (dipakai ulang, bukan ditulis ulang).

## 5. Deferred — Staff Attendance (item IV)

- Ditunda sesuai keputusan user: sistem role tidak mengenal kehadiran eksternal tanpa akun. Tidak ada spec, tidak ada microtask. Dibuka kembali hanya lewat keputusan baru bila model akun eksternal berubah.

## 6. Urutan eksekusi yang disarankan

1. Slice 1 (Raport+Tingkat/Mapel) — spec selesai, menunggu review tertulis file spec.
2. Slice 2 (Dashboard Simpel) — terkecil, murni read-only.
3. Slice 3 (Mingguan+Kalender) — view lebih besar, fondasi join dipakai Slice 4.
4. Slice 4 (Notifikasi in-app) — memakai ulang join Slice 3.

Tiap slice: brainstorming singkat → spec di `docs/superpowers/specs/` → review tertulis → `writing-plans` → `*_PLAN.md` + `*_MILESTONES.md` → implementasi per MICROTASK/VERIFY. File ini hanya indeks agar tidak ada yang terlupakan, bukan pengganti spec per slice.
