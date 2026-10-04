# Design Spec — Polish Konvergensi Jadwal (III) + Kalender (V) + Notifikasi In-App (VII)

**Tanggal:** 2026-10-04
**Status:** Disetujui user arah A (konseptual, 2026-10-04) — menunggu review tertulis file ini sebelum implementation plan.
**Pendekatan terpilih:** A — Polish konvergensi client-only (tanpa entity/tabel/endpoint/dependensi baru). WA/push deferred fase 2.

## 1. Pemahaman bersama (brief)

- **Tujuan:** Trainer dalam 2 klik menjawab "di mana saya mengajar hari ini/besok, sudah diisi belum?" + admin melihat cakupan mingguan tanpa buka Excel. Semua lewat satu hub `Jadwal Penugasan` (Harian/Mingguan/Kalender) + bell yang mengarah ke tanggal yang benar.
- **Keadaan kini (tervalidasi 2026-10-04 via read):** `PenugasanTimetable.jsx:47-64` hub tunggal `harian|mingguan|kalender` via `buildDailyTimetable` (`penugasan.js:311-356`); Mingguan = stacked tbody per-hari (`:374-396`), bukan matriks pivot; Kalender = grid bulan + `openDayInHarian (:273-276)` navigasi saja, tanpa tulis; shortcut navbar `KALENDER_SHORTCUT` tanpa route baru (`App.jsx:73-89,239-245`); bell H-1/H-day in-app ada (`NotificationBell.jsx:93-96`, `reminders.js:29-62`) tapi flag `done` baca ledger legacy `absensi` (`:60,87`), bukan `absensiPengajar`; CSV/Unduh Harian-only (`:252-254,313-320`).
- **Asumsi yang dikunci dari tanya-jawab:**
  - D1: Kanal = in-app only. WA/push/cron ditangguhkan fase 2 (tanpa tabel `notifikasi`, tanpa worker cPanel).
  - D2: Tanpa skema baru. Sumber tetap `trainer.penugasanPengajar[] × sekolah.jadwalList[]`; RBAC server otoritatif (taste #61).
  - D3: Mingguan tetap stacked derivasi (bukan rewrite matriks exemplar). Kalender tetap navigasi (tanpa tulis dari sel).
- **Di luar scope slice ini:** Raport (Slice 1 — done), Dashboard Ringkas (Slice 2 — done), Staff generik (IV — ignored per permintaan), matriks pivot exemplar (pendekatan B ditolak), push/WA (pendekatan C deferred).

## 2. Arsitektur & model data (tanpa skema baru)

- Tidak ada tabel/entity/endpoint baru. Semua derived klien dari `readCached`: `sekolah` (`jadwalList[]`), `trainer` (`sekolahIds`, `penugasanPengajar[]`), `eksternal` (reference-only), `absensiPengajar` (flag done baru) + `absensi` (fallback legacy selama migrasi).
- Kunci `uiState` yang dipakai ulang (tanpa kunci baru): `jadwalView: 'harian'|'mingguan'|'kalender'` (`PenugasanTimetable.jsx:58-63`), `lastSeenReminders` (highlight bell saja, bukan status baca server — `NotificationBell.jsx:131`), `activeTab` + `kalenderNonce` remount pattern (`App.jsx:191,380`).
- Aturan tanggal lokal: H-day/H-1 wall-clock lokal (`new Date(y,m,d)`, idiom `reminders.js:34`), BUKAN UTC — jadwal simpan nama hari Indonesia; `tanggal` absensi dibaca apa adanya.
- RBAC: Trainer hanya miliknya (`penugasanInvolvesTrainer` + `sekolahIds` union, `reminders.js:18-23`, `PenugasanTimetable.jsx:84-88`); Admin Cabang terfilter cabang (`filterEntitiesByBranch`); Superadmin semua/terfilter. Bell trainer tidak menampilkan nominal uang (hanya nama + jam + status).

## 3. Komponen & UI (mirror idiom, tanpa pola baru)

- **P1 — Flag `done` dari `absensiPengajar` (concrete pick):** `reminders.js:47` diganti membaca `absensiPengajar` (`trainerId/sekolahId/tanggal`, menghormati `isExternalPerson/dicatatOleh`) dengan fallback OR ke ledger `absensi` lama selama 1 rilis agar data lama tidak dianggap belum-diisi. `NotificationBell.jsx:60,87` + `TrainerDashboard.jsx:76` ikut jalur yang sama. Pill `Selesai/Belum Diisi` reuse class `TrainerDashboard.jsx:114-115` verbatim; copy Indonesia tetap (`Tidak ada sekolah terjadwal hari ini/besok`).
- **P2 — CSV/print parity visible-view:** `displayRows` (`:242-250`) + `handleExportCSV (:252-254)` diperluas dari Harian-only ke `rowsByDate` flatMap per `visibleDates` dengan kolom `Tanggal` tambahan saat `mingguan/kalender`; `printable-report` + `PrintButton` ikut view aktif (idiom `PG.C.2 :279-281`, `print.css:10-34`). Label tombol Indonesia tetap (`Unduh CSV`).
- **P3 — Bell deep-link tanggal:** `NotificationBell onOpenJadwal (App.jsx:361)` diperkaya konteks `{iso, view}` — klik item "Besok" mendarat di Mingguan/Kalender pada `iso` itu via `setTanggal(iso)+setView()+kalenderNonce`, bukan tab generik. Reuse `openDayInHarian (:273-276)` + `withKalenderShortcut (:82-89)`; highlight tetap di `Jadwal Penugasan`; drawer mobile menutup saat pilih.
- Style-frozen: class bell/dropdown/tabel/modal dipinjam verbatim (`TrainerAttendanceAdmin.jsx:153-210`, `AccountMenu.jsx:19-33`); ikon reuse path `jadwalPenugasan` (taste #11, do not invent); tidak ada warna/font baru.

## 4. Aliran data

1. Pengingat: `readCached(sekolah+trainer+eksternal+absensiPengajar+absensi)` → `remindersForTrainer({trainerId, nowLocal})` → bell count `todayUndone+tomorrow` + dropdown + section `Rekap Saya` (tetap, hanya tambah titik masuk bell). Tandai-dilihat hanya tulis `uiState.lastSeenReminders`.
2. Jadwal: `tanggal` jangkar → `visibleDates` (harian 1 iso / mingguan Senin-Minggu / kalender sebulan) → `rowsByDate` loop `buildDailyTimetable` per iso + filter scope trainer → `marksByDate` (`coverMarksForRows`) → render tabel/grid.
3. Deep-link: klik bell item → `App.setActiveTab('jadwalPenugasan', {jadwalView, tanggal})` → remount via `key={kalenderNonce}` → sorot sel `data-testid=kalender-hari data-tanggal={iso}`.

## 5. Error handling, validasi & RBAC

- `jadwalList` kosong/rusak → daftar ramah, tidak crash (guard `Array.isArray` seperti `scheduleIncludesToday`); `tanggal` kosong → fallback hari ini (`safeTanggal :94`).
- `trainerId` tak dikenal / di luar cabang → bell `0` / tabel kosong terfilter; server tetap penolak otoritatif untuk tulis (taste #61) — ingatan in-app tidak memberi hak baru.
- `crossScopeNames` lookup gagal → fallback `Trainer tidak ditemukan`/`Memuat...` seperti kini (`:202-209`), tidak blocking render.
- Semua I/O baru = nol fetch baru (P1 hanya baca cache yang sudah di-hydrate + `subscribeStore` tick seperti `TrainerDashboard.jsx:20-22`); bila pre-hydrate kosong, tunggu tick.

## 6. Testing (mengikuti testing taste)

- Unit `src/lib/__tests__/reminders.test.js` (perluas, tanggal dinamis bukan hardcode): `done` dari `absensiPengajar` (internal + eksternal via `dicatatOleh`), fallback legacy `absensi`, lintas batas minggu, WIB-vs-UTC 00:00–07:00 tidak geser hari, trainer tanpa penugasan → kosong.
- E2E temp (hapus setelah hijau, taste testing #15): bell → klik item Besok → mendarat di view/tanggal benar + `kalender-hari` tersorot; CSV Mingguan berisi kolom Tanggal + baris = tabel terlihat; locator `getByRole` dulu, fallback `data-testid`; assert zero `pageerror`; data disposable browser + guard wipe sekali-per-halaman.
- Visual: screenshot bell dropdown + Kalender vs baseline (baris manual legitimate, testing taste #19).
- Gate: `npm run build` bersih + suite hijau; gagal tak terkait dilabeli pre-existing dengan bukti.

## 7. Sisa & tangguhan (dekomposisi, bukan scope file ini)

- Pendekatan B (matriks pivot HARI-sebagai-kolom + tulis dari sel kalender via `PenugasanManager`) ditolak untuk slice ini — butuh validasi overlap + RBAC ulang (`trainer.php:138-194`).
- Pendekatan C (tabel `notifikasi` + `api/notifikasi.php` + cron H-1 + WA/FCM + consent PII + worker cPanel) deferred fase 2 dengan pemilik: butuh kasus lintas-perangkat + keputusan biaya/consent.
- Route `id:kalender` mandiri tetap ditolak (duplikasi state).

## 8. Langkah berikut

- Setelah file ini direview dan disetujui tertulis → invoke `writing-plans` untuk memecah menjadi `*_PLAN.md` + `*_MILESTONES.md` (MICROTASK/VERIFY format, taste #52/#69) sebelum kode apa pun ditulis (HARD-GATE brainstorming).
