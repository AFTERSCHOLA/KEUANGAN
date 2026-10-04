# Design Spec — Slice 2+5: Dashboard Simpel + Notifikasi In-App + Shortcut Kalender

**Tanggal:** 2026-10-04
**Status:** Disetujui user (konseptual, 2026-10-04) — menunggu review tertulis file ini sebelum implementation plan.
**Pendekatan terpilih:** A — Derived client-only (tanpa entity/tabel/endpoint/dependensi baru).

## 1. Pemahaman bersama (brief)

- **Tujuan:** (a) Dashboard simpel menjadi landing default yang terbaca dalam 5 detik (jumlah siswa, pemasukan, laba/rugi, sekolah mitra); (b) Trainer mendapat pengingat H-1 dan H-day di dalam aplikasi; (c) Kalender dapat dibuka lewat satu tombol di navbar, tidak lagi terkubur di toggle Jadwal Penugasan.
- **Keadaan kini (tervalidasi 2026-10-04 via grep/read):** `Ringkas` 4 kartu sudah ada (`OverviewCards.jsx:172-193`); `Rekap Saya` Hari Ini/Besok sudah ada tapi pasif (`TrainerDashboard.jsx:99-142`); `Kalender` sudah ada sebagai view di dalam `PenugasanTimetable.jsx:325-361`, tanpa entri navbar; tidak ada infrastruktur notifikasi (tidak ada `*Notif*`, tidak ada tabel/endpoint).
- **Asumsi yang dikunci dari tanya-jawab:**
  - D1: Kanal notifikasi = in-app only (tanpa push/FCM, tanpa WA blast, tanpa dependensi baru — lolos UNIVERSAL scope gate).
  - D2: Dashboard = kunci `Ringkas` yang ada sebagai default (tanpa kartu ke-5, tanpa reorder, tanpa ubah rumus `financialData()`).
  - D3: Kalender = shortcut navigasi ke `jadwalPenugasan` dalam mode `kalender` (tanpa route/tab id baru, tanpa duplikasi state).
- **Di luar scope slice ini:** Raport (Slice 1 — sudah berspek), Weekly rewrite, Staff Attendance (deferred), push/WA blast, tabel `notifikasi` server (pendekatan B/C ditangguhkan).

## 2. Arsitektur & model data (tanpa skema baru)

- Tidak ada tabel/entity/endpoint baru. Semua derived di klien dari koleksi yang sudah di-`readCached`: `sekolah` (`jadwalList[]`), `trainer` (`sekolahIds`, `penugasanPengajar[]`), `absensi` (`tanggal/sekolahId/trainerId`), `siswa`, `sppPayments/honorPayments/invoices` (hanya untuk dashboard yang sudah ada).
- Tiga kunci `uiState` (`STORE_KEY_ui` di `src/lib/store.js`): `overviewMode: 'Ringkas'|'Lengkap'` (sudah ada, default `Ringkas` saat unset — `OverviewCards.jsx:59-65`); `jadwalView: 'harian'|'mingguan'|'kalender'` (sudah ada — `PenugasanTimetable.jsx:58-63`); `lastSeenReminders: <ISO string>` (baru, penanda sudah-dilihat untuk badge bell, bukan status baca server).
- Aturan tanggal lokal: H-day/H-1 dihitung dengan wall-clock lokal (`new Date(y,m,d)`, idiom `TrainerDashboard.jsx:62-69`), BUKAN `toISOString()`/UTC — jadwal menyimpan nama hari Indonesia pilihan user; absensi `tanggal` tetap dibaca apa adanya untuk flag `done`.
- RBAC mengikuti privilege matrix (`SCOPE_EXPANSION_PLAN.md` Part 6): Trainer hanya sekolah miliknya (`sekolahIds` ∪ `penugasanInvolvesTrainer`); Admin Cabang terfilter cabang (`filterEntitiesByBranch`); Superadmin semua/terfilter. Trainer tidak pernah melihat nominal uang di pengingat (hanya nama sekolah + jam + status).

## 3. Komponen & UI (mirror idiom, tanpa pola baru)

- **Dashboard (kunci yang ada):** `src/features/overview/OverviewCards.jsx:156-193` dipertahankan verbatim — grup `role=group aria-label=Mode tampilan Overview` berisi `Ringkas|Lengkap`, grid 4 `data-testid=ringkas-card` (`Jumlah Siswa Aktif / Pemasukan bulan berjalan / Laba/Rugi berjalan / Jumlah Sekolah Mitra`), `formatRupiah`, `PeriodFilter` + branch selector tetap di header, empty copy `noData:84` tetap Indonesia. `Lengkap` tidak diubah.
- **Notifikasi (baru, 2 file):** `src/lib/reminders.js` pure helper `remindersForTrainer({trainerId, sekolah, trainer, absensi, nowLocal}) → {today:[{sekolahId,nama,waktu,done}], tomorrow:[...]}` — reuse `scheduleIncludesToday` day-name + `penugasanInvolvesTrainer` + flag `done = absensi.some(tanggal===today && sekolahId && trainerId)`; `src/components/NotificationBell.jsx` dirender di top-bar beside `AccountMenu` (concrete pick — bukan sidebar; sidebar tetap murni navigasi — `SidebarLayout.jsx:140-161`): bell + badge count `today-undone + tomorrow`, dropdown daftar `Jadwal Hari Ini / Jadwal Sekolah Besok` dengan pill `Selesai / Belum Diisi` meminjam class `TrainerDashboard.jsx:114-115` verbatim; copy Indonesia dipin (`Tidak ada sekolah terjadwal hari ini/besok`). Klik bell menulis `lastSeenReminders`; count dihitung ulang tiap hari, tidak ada tulis server. Style-frozen (R5): class bell/dropdown/modal dipinjam dari `TrainerDashboard`/`AccountMenu`, tidak ada warna/font baru.
- **Shortcut Kalender (tanpa route baru):** Entri nav `KALENDER_SHORTCUT` (ikon reuse path `jadwalPenugasan` verbatim — taste #11, do not invent) yang `onSelect`-nya diintersep di `App.jsx`: `setActiveTab('jadwalPenugasan'); setUiState({jadwalView:'kalender'})`. `PenugasanTimetable` tidak dirender ulang via path baru — view awal tetap dibaca dari `uiState` seperti sekarang. Highlight aktif saat `activeTab==='jadwalPenugasan' && jadwalView==='kalender'`. Berlaku di rail desktop, drawer mobile (menutup saat pilih), dan rail ciut (`title` tooltip).
- Copy Indonesia dipin agar test bisa `getByRole`/`getByText`.

## 4. Aliran data

1. Dashboard: `readCached → filterEntitiesByBranch → financialData → withPipelinePotensi → current/entities` (tidak berubah) → render `Ringkas` default; toggle menulis `overviewMode`.
2. Pengingat: setiap render/mount baca `sekolah+trainer+absensi` → `remindersForTrainer(nowLocal)` → bell count + dropdown + section `Rekap Saya` tetap (tidak diganti, hanya ditambah titik masuk bell). Tandai-dilihat hanya menulis `uiState`, tidak menyentuh ledger.
3. Kalender: klik entri `Kalender` → `App` set tab + `jadwalView` → `PenugasanTimetable` render grid `kalender-hari` (`data-tanggal`) → klik hari `openDayInHarian(iso)` kembali ke harian tanggal itu (perilaku kini dipertahankan).

## 5. Error handling, validasi & RBAC

- `jadwalList` kosong/rusak → daftar ramah `Tidak ada sekolah terjadwal…`, tidak crash (guard `Array.isArray` seperti `scheduleIncludesToday`).
- `trainerId`/`sekolahIds` tak dikenal → bell `0`, bukan error; admin di luar cabang → daftar kosong terfilter (server tetap otoritatif untuk tulis — taste #61; ingatan in-app tidak memberi hak tulis baru).
- Semua kegagalan I/O punya jalur gagal jelas (UNIVERSAL #9): tidak ada fetch baru sehingga tidak ada failure path baru; bila `readCached` kosong (pre-hydrate), komponen menunggu `subscribeStore` tick seperti `TrainerDashboard.jsx:20-22`.
- Privilege: bell trainer = miliknya saja; bell admin_cabang = antrean cabang (`Hari ini belum diisi`); superadmin = semua/terfilter. Tidak ada nominal keuangan di dropdown trainer.

## 6. Testing (mengikuti testing taste)

- Unit `src/lib/__tests__/reminders.test.js`: H-day/H-1 lintas batas minggu (pakai tanggal dinamis, bukan hardcode — testing taste #6), batas WIB-vs-UTC (00:00–07:00 WIB tidak geser hari), `done` dari `absensi`, trainer tanpa penugasan → kosong, cabang terfilter.
- E2E persisten (penamaan per baris milestone): (a) fresh `uiState` → `Ringkas` 4 `ringkas-card`, toggle `Lengkap` persist setelah refresh; (b) seed 1 sekolah hari ini + 1 besok → bell count `2`, submit absensi hari ini → `1`, klik bell menandai; (c) klik `Kalender` → mendarat di Jadwal Penugasan dengan `Kalender` pressed, refresh tetap Kalender; locator `getByRole` dulu, fallback `kalender-hari`/`ringkas-card`; assert zero `pageerror`; data disposable di browser + guard wipe sekali-per-halaman; intercept tidak perlu (tanpa `window.print` baru).
- Visual parity: screenshot full-page Overview `Ringkas` + bell dropdown vs baseline (baris manual legitimate — testing taste #19).
- Gate: `npm run build` bersih + suite hijau; kegagalan tak terkait dilabeli pre-existing dengan bukti.

## 7. Sisa & tangguhan (dekomposisi, bukan scope file ini)

- Pendekatan B (tabel `notifikasi` + `api/notifikasi.php` + cron H-1 + unread server) dan C (WA blast massal / FCM push + consent PII + worker cPanel) ditangguhkan dengan pemilik: butuh kasus nyata lintas-perangkat + keputusan biaya/consent sebelum dihidupkan.
- Route `id:kalender` mandiri ditolak (duplikasi state); CSV/Unduh tetap Harian-only seperti kini.

## 8. Langkah berikut

- Setelah file ini direview dan disetujui tertulis → invoke `writing-plans` untuk memecah menjadi `*_PLAN.md` + `*_MILESTONES.md` (MICROTASK/VERIFY format, taste #52/#69) sebelum kode apa pun ditulis (HARD-GATE brainstorming).
