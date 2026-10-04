# Dashboard Simpel + Notifikasi In-App + Shortcut Kalender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trainer mendapat pengingat H-1/H-day di dalam aplikasi, Ringkas terkunci sebagai default, dan Kalender terbuka lewat satu tombol navbar.

**Architecture:** Tanpa entity/tabel/endpoint/dependensi baru. Semua derived di klien dari `readCached` + `uiState` (`overviewMode`, `jadwalView`, `lastSeenReminders` hari `YYYY-MM-DD`). Bell di top-bar beside `AccountMenu`; sidebar tetap murni navigasi.

**Tech Stack:** React 19 + Vite 6, Vitest 4 (`npm test`), Playwright 1.62 (`npx playwright test`), Tailwind 4, `localStorage` uiState.

**Spec:** `docs/superpowers/specs/2026-10-04-dashboard-notifikasi-kalender-design.md`

## Global Constraints

- Copy UI Indonesia dipin: `Jadwal Hari Ini`, `Jadwal Sekolah Besok`, `Tidak ada sekolah terjadwal hari ini`, `Tidak ada sekolah terjadwal besok`, `Selesai`, `Belum Diisi`, `Ringkas`, `Lengkap`, `Kalender` (kartu ke-3 berlabel `Laba/Rugi berjalan` sesuai render).
- Tanggal lokal wall-clock (`new Date(y,m,d)`), BUKAN `toISOString()`/UTC untuk H-day/H-1.
- Angka Rupiah: input digit polos, tampil `formatRupiah`; tidak ada `console.log` di `src/`.
- Ikon Kalender reuse path `jadwalPenugasan` verbatim; pill/class dropdown pinjam `TrainerDashboard.jsx:114-115` verbatim (taste #11, do not invent).
- Trainer tidak pernah melihat nominal uang di pengingat; server tetap otoritatif untuk tulis (taste #61).
- Test dates dinamis (bulan/tahun berjalan), bukan hardcode; locator `getByRole` dulu.

## Review Focus

- Pergantian hari 00:00–07:00 WIB tidak menggeser H-day/H-1 ke UTC-kemarin.
- Trainer multi-penugasan (2 sekolah hari sama, asisten vs instruktur via `penugasanInvolvesTrainer`) tampil dua-duanya, bukan satu.
- Admin_cabang hanya melihat cabang sendiri; superadmin ikut filter cabang terpilih.
- Klik `Kalender` saat sudah di tab Jadwal Penugasan tetap pindah ke view Kalender (remount, bukan silent-noop).
- `jadwalList` kosong/rusak tidak crash bell maupun timetable.

---

### Task 1: `remindersForTrainer` + unit test

**Files:**
- Create: `src/lib/reminders.js`
- Test: `src/lib/__tests__/reminders.test.js`

**Interfaces:**
- Consumes: bentuk `sekolah.jadwalList[] {dayOfWeek}`, `trainer.sekolahIds[]`, `trainer.penugasanPengajar[]`, `absensi[] {tanggal, sekolahId, trainerId}`, `penugasanInvolvesTrainer(a, trainerId)` dari `src/lib/penugasan.js`.
- Produces: `remindersForTrainer({trainerId, sekolah, trainer, absensi, nowLocal}) -> {today: [{sekolahId, nama, waktu, done}], tomorrow: [{sekolahId, nama, waktu}], counts: {todayUndone, tomorrow, total}}` — dipakai Task 2.

- [ ] **Step 1: Write the failing test** — `src/lib/__tests__/reminders.test.js` dengan tanggal dinamis: bangun `nowLocal` hari ini + nama hari ID (`['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][d.getDay()]`), 1 sekolah `jadwalList=[{dayOfWeek: todayName}]` + 1 sekolah `[{dayOfWeek: tomorrowName}]`, assert `today.length===1 && tomorrow.length===1 && counts.total===2`; tambah kasus `absensi` berisi `{tanggal: todayISO, sekolahId, trainerId}` → `today[0].done===true && counts.todayUndone===0`; kasus dua sekolah di hari yang sama (satu via `sekolahIds`, satu via `penugasanPengajar` aktif) → `today.length===2`; kasus `jadwalList` kosong → `today/tomorrow` kosong tanpa throw.
- [ ] **Step 2: Run test to verify it fails**

  Run: `npm test -- reminders`
  Expected: FAIL — `remindersForTrainer is not defined`.
- [ ] **Step 3: Implement `remindersForTrainer` in `src/lib/reminders.js`** — reuse idiom `scheduleIncludesToday` (cocok `jadwalList[].dayOfWeek`, fallback string `jadwal` bila perlu) + `penugasanInvolvesTrainer` + union `sekolahIds`; `waktu` dari `formatJadwalList(jadwalList)`; `done` via `absensi.some(...)`; tanpa fetch, tanpa tulis.
- [ ] **Step 4: Run test to verify it passes**

  Run: `npm test -- reminders`
  Expected: PASS, semua kasus hijau.
- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/reminders.js src/lib/__tests__/reminders.test.js
  git commit -m "feat: remindersForTrainer H-day/H-1 derivation" -m "Task 1"
  ```

### Task 2: `NotificationBell` di top-bar + `lastSeenReminders`

**Files:**
- Create: `src/components/NotificationBell.jsx`
- Modify: `src/App.jsx:306-331` (header: render `<NotificationBell/>` beside `<AccountMenu/>`)
- Test: `tests/ringkas-notif-kalender.spec.js` (tambah `describe('notif')` di task ini; describe `ringkas`/`kalender` menyusul di Task 3/4)

**Interfaces:**
- Consumes: `remindersForTrainer` (Task 1), `readCached`, `subscribeStore`, `getRoleContext`, `getUiState`, `setUiState` dari `src/lib/store.js`; `filterEntitiesByBranch` untuk admin_cabang.
- Produces: `<NotificationBell onOpenJadwal={() => void} />` — bell mandiri baca store; `onOpenJadwal` dipakai App untuk `setActiveTab('jadwalPenugasan')`.

- [ ] **Step 1: Write the failing E2E describe** — `tests/ringkas-notif-kalender.spec.js`, `describe('notif')`: seed via localStorage 1 sekolah terjadwal hari ini + 1 besok untuk trainer login, buka sebagai trainer, assert `getByRole('button', {name: /notifikasi/i})` badge `2`; tandai absensi hari ini (atau seed absensi done) → badge `1`; buka dropdown → `Jadwal Sekolah Besok` terlihat; login admin_cabang cabang lain → bell tidak menampilkan sekolah cabang tersebut. Data disposable + guard wipe sekali-per-halaman; assert zero `pageerror`.
- [ ] **Step 2: Run test to verify it fails**

  Run: `npx playwright test tests/ringkas-notif-kalender.spec.js -g "notif"`
  Expected: FAIL — `NotificationBell`/`notifikasi` tidak ditemukan.
- [ ] **Step 3: Implement `NotificationBell.jsx`** — baca `readCached('sekolah'/'trainer'/'absensi')` + `subscribeStore` tick (mirip `TrainerDashboard.jsx:20-22`); hitung via `remindersForTrainer(nowLocal=new Date())`; scope: trainer → miliknya, admin_cabang → cabang terfilter, superadmin → semua/terfilter; badge `counts.total` live; buka dropdown menulis `setUiState({lastSeenReminders: 'YYYY-MM-DD'})` (kontrol highlight saja, bukan count); pill reuse class `TrainerDashboard.jsx:114-115`; Escape/mousedown-menutup mirip `AccountMenu.jsx:19-33`.
- [ ] **Step 4: Wire header di `src/App.jsx:325-330`** — `<div className="flex items-center gap-2"><NotificationBell onOpenJadwal={() => setActiveTab('jadwalPenugasan')} /><AccountMenu ... /></div>`; tanpa ubah `SidebarLayout`.
- [ ] **Step 5: Run test to verify it passes**

  Run: `npx playwright test tests/ringkas-notif-kalender.spec.js -g "notif"`
  Expected: PASS.
- [ ] **Step 6: Commit**

  ```bash
  git add src/components/NotificationBell.jsx src/App.jsx tests/ringkas-notif-kalender.spec.js
  git commit -m "feat: in-app H-1/H-day notification bell" -m "Task 2"
  ```

### Task 3: Kunci `Ringkas` default + regression pin

**Files:**
- Modify: `src/features/overview/OverviewCards.jsx:57-65` (hanya bila guard default belum tepat; jika sudah, tanpa edit perilaku)
- Test: `tests/ringkas-notif-kalender.spec.js` (tambah `describe('ringkas')`)

**Interfaces:**
- Consumes: `financialData`, `withPipelinePotensi`, `filterEntitiesByBranch` (existing, tidak diubah).
- Produces: tidak ada interface baru — perilaku terkunci: unset → `Ringkas` 4 `ringkas-card`.

- [ ] **Step 1: Write the failing E2E describe** — `describe('ringkas')`: bersihkan `uiState.overviewMode`, reload Overview, assert tepat 4 `data-testid=ringkas-card` berisi teks `Jumlah Siswa Aktif`/`Pemasukan bulan berjalan`/`Laba-Rugi berjalan`/`Jumlah Sekolah Mitra`; klik `Lengkap` → reload → `Lengkap` persist.
- [ ] **Step 2: Run test to verify current behavior**

  Run: `npx playwright test tests/ringkas-notif-kalender.spec.js -g "ringkas"`
  Expected: PASS bila kode kini sudah benar (tugas ini pengunci); bila FAIL, lanjut Step 3.
- [ ] **Step 3 (hanya bila Step 2 FAIL): Implement minimal fix di `OverviewCards.jsx:59-65`** — default `Ringkas` saat unset; tanpa tambah kartu/reorder/rumus.
- [ ] **Step 4: Run test to verify it passes**

  Run: `npx playwright test tests/ringkas-notif-kalender.spec.js -g "ringkas"`
  Expected: PASS.
- [ ] **Step 5: Commit**

  ```bash
  git add src/features/overview/OverviewCards.jsx tests/ringkas-notif-kalender.spec.js
  git commit -m "test: pin Ringkas default 4-card overview" -m "Task 3"
  ```

### Task 4: Shortcut `Kalender` di navbar

**Files:**
- Modify: `src/App.jsx:38-67,209-213,266` (tambah `KALENDER_SHORTCUT`, intersep `setActiveTab`, `key` remount)
- Test: `tests/ringkas-notif-kalender.spec.js` (tambah `describe('kalender')`)

**Interfaces:**
- Consumes: `getUiState`/`setUiState` key `jadwalView`; `PenugasanTimetable` membaca awal dari `uiState` (tidak diubah).
- Produces: entri nav `Kalender` untuk peran admin + trainer.

- [ ] **Step 1: Write the failing E2E describe** — `describe('kalender')`: dari Overview klik nav `Kalender` → assert mendarat di Jadwal Penugasan dengan `aria-pressed=true` pada tombol `Kalender` (`role=group aria-label=Tampilan jadwal`); reload → tetap Kalender; kasus dari view Harian: pindah Harian → klik `Kalender` → assert view berubah (covers remount).
- [ ] **Step 2: Run test to verify it fails**

  Run: `npx playwright test tests/ringkas-notif-kalender.spec.js -g "kalender"`
  Expected: FAIL — nav `Kalender` tidak ada.
- [ ] **Step 3: Implement shortcut di `src/App.jsx`** — `const KALENDER_SHORTCUT = {id: 'kalender', label: 'Kalender', icon: <reuse path jadwalPenugasan>}`; sertakan setelah `jadwalPenugasan` di `visibleTabs` admin + `TRAINER_TABS`; deklarasikan `const [kalenderNonce, setKalenderNonce] = useState(0)` di beside `activeTab` state (`App.jsx:165`); intersep: `if (tabId==='kalender') { setUiState({activeTab:'jadwalPenugasan', jadwalView:'kalender'}); setActiveTabState('jadwalPenugasan'); setKalenderNonce(n=>n+1); setMobileDrawerOpen(false); return; }`; render `{activeTab==='jadwalPenugasan' && <PenugasanTimetable key={kalenderNonce} />}`; concrete pick terdokumentasi: highlight aktif tetap di `Jadwal Penugasan` (tanpa dual-highlight state).
- [ ] **Step 4: Run test to verify it passes**

  Run: `npx playwright test tests/ringkas-notif-kalender.spec.js -g "kalender"`
  Expected: PASS.
- [ ] **Step 5: Commit**

  ```bash
  git add src/App.jsx tests/ringkas-notif-kalender.spec.js
  git commit -m "feat: kalender navbar shortcut to jadwal view" -m "Task 4"
  ```

### Task 5: Gate akhir

- [ ] **Step 1: Full unit**

  Run: `npm test`
  Expected: PASS semua.
- [ ] **Step 2: Full E2E file**

  Run: `npx playwright test tests/ringkas-notif-kalender.spec.js`
  Expected: PASS `ringkas + notif + kalender`.
- [ ] **Step 3: Production build**

  Run: `npm run build`
  Expected: bersih tanpa error.
- [ ] **Step 4: Grep higiene**

  Run: `npx tsc --noEmit` bila tersedia, jika tidak lewati sebagai `Unverified`; `grep -r "console.log" src/` harus kosong.
  Expected: `Verified:` per baris, sisanya `Unverified:` jujur.
