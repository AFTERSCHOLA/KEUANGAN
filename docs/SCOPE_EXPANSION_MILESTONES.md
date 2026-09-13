# Scope Expansion — Microtask Chains (M5–M7)

**Companion to `SCOPE_EXPANSION_PLAN.md`.**  
This document decomposes each phase into strictly-ordered microtasks conforming to Part 6 of `IMPLEMENTATION_PLAN.md`. Each microtask must VERIFY before the next begins.

---

## Milestone M5 — Field Trainer Wins (Phase A)

**Entry gate:** Role split approved; trial billing rule decided by client.

### M5.1 — Soft-Login & Role Split

**M5.1.1** `EDIT: features/auth/RolePicker.jsx`  
Create role-picker modal (Admin / Trainer-select). Store `role` + `trainerId` in localStorage UI state.  
**VERIFY:** App boots → modal blocks until role selected → state persists across refresh.

**M5.1.2** `EDIT: App.jsx + features/auth/TrainerDashboard.jsx`  
Branch tab registry on role: Admin sees 8 tabs; Trainer sees 4 (Absensi, Riwayat, Siswa read-only, Rekap Saya).  
**VERIFY:** Switching role hides/shows correct tabs; direct URL to hidden tab redirects to dashboard.

**M5.1.3** `EDIT: lib/store.js`  
Add `getRoleContext()` returning `{role, trainerId, cabangId}`. All `read()` calls pass context for filtering.  
**VERIFY:** Trainer role only sees own-branch data in lists.

### M5.2 — Attendance Schema Upgrade

**M5.2.1** `EDIT: lib/constants.js`  
Update `newAbsensi()` factory: add `asistenId`, `asistenNama`, `dokumentasi[]`, `catatan`, `statusVerifikasi`, `sesiKe`.  
**VERIFY:** Factory returns complete object; sparse fields undefined when not set.

**M5.2.2** `EDIT: features/attendance/AttendanceForm.jsx`  
Add assistant dropdown (nullable; excludes main trainer; "— Tanpa Asisten —" option).  
Add `catatan` textarea.  
**VERIFY:** Save rounds trip all fields; `asistenId === trainerId` blocked with alert.

**M5.2.3** `EDIT: features/attendance/AttendanceForm.jsx`  
Add two photo slots: "Foto Kehadiran" and "Foto Kegiatan".  
Store compressed base64 in `dokumentasi[]` (IndexedDB if >1MB, else dataURL).  
**VERIFY:** Save record → refresh → photos render as thumbnails; quota warning shows if localStorage >4MB.

**M5.2.3b** `EDIT: features/attendance/AttendanceForm.jsx`  
Save-time sanity prompt: on save, show confirm — "{n} tercatat hadir — sesuai kertas? [Ya, Simpan] [Cek Ulang]".  
**VERIFY:** Prompt appears on every save; "Cek Ulang" returns to list without saving; "Ya" proceeds.

**M5.2.4** `EDIT: features/attendance/QuickSession.jsx`  
Create QuickSession component: "Semua Hadir?" button marks all 30 students present; taps flip exceptions.  
**VERIFY:** One tap → all toggled → 3 exceptions tapped → save → record shows 27/30.

### M5.3 — Verification & History

**M5.3.1** `EDIT: features/attendance/RiwayatAbsensi.jsx`  
Replace flat "Belum Dicek" filter with **exception-filtered review queue** (default view): shows only flagged records — no-photo sessions, hadir count deviating >20% from school's trailing average, first-ever attendance appearance of a student, records edited after prior verification. Plus randomized sample: 2–3 unreviewed records per trainer per week appended to the queue. Verify button (admin/head-trainer role only) stamps `statusVerifikasi`.  
**VERIFY:** Queue shows only flags + sample, not all records; admin can verify; trainer sees no verify button; full history still reachable via explicit "Semua" toggle.

**M5.3.1b** `EDIT: lib/constants.js + features/attendance/TrainerHistory.jsx`  
Add `konfirmasiTrainer` timestamp field to `newAbsensi()` factory (null until certified). TrainerHistory must render each own record's `asistenNama`, `dokumentasi` thumbnails, and `catatan` BEFORE the self-certification action so the trainer can actually inspect what they are certifying. Add weekly self-certification flow: one-tap "Saya nyatakan absensi minggu ini sesuai dokumen kertas" button stamps all own un-certified records of the week. Static retention label rendered beside photo upload: *"Simpan kertas absensi minimal 1 tahun ajaran."*  
**VERIFY:** Each own record shows asisten, documentation thumbnails, and catatan in TrainerHistory; one tap → week's own records carry `konfirmasiTrainer` timestamp; already-certified records untouched; label visible on attendance form.

**M5.3.2** `EDIT: features/auth/TrainerDashboard.jsx`  
Replace the Rekap Saya stub with real landing content: today's scheduled schools for this trainer (from `sekolah.jadwal` + trainer assignment), which scheduled schools already have absensi today vs. pending, and the trainer's own current-period honor summary (sesi hadir × tarif, honor dibayar, sisa) derived from `financialData()`.  
**VERIFY:** Trainer logs in → Rekap Saya shows scheduled schools with pending/done status for today plus own honor summary; figures match Data Pembayaran/Keuangan for the selected period.

**M5.3.3** `EDIT: features/students/StudentList.jsx`  
Add view-only mode: hide Edit/Delete buttons when `role === 'trainer'`. Add Trial badge.  
**VERIFY:** Trainer role → no action buttons; admin → all buttons present.

### M5.4 — Trial Student System

**M5.4.1** `EDIT: lib/constants.js`  
Add `status: 'Trial'|'Aktif'|'Berhenti'` and `trialMulai` to `newSiswa()`.  
**VERIFY:** Factory sets `'Aktif'` by default; trial sets `'Trial'` + date.

**M5.4.2** `EDIT: features/students/StudentForm.jsx`  
Add status radio + trial start date picker.  
**VERIFY:** Save → refresh → status persists; trial students excluded from SPP calculations.

**M5.4.3** `EDIT: lib/finance.js`  
`financialData()` excludes `status === 'Trial'` from `potensiSpp` and `tunggakan`.  
**VERIFY:** 30 active + 2 trial students → SPP potensi counts only 30.

**Exit gate:** Trainer can login → Rekap Saya shows today's schedule + own honor summary → mark attendance with photos → see asisten/documentation/catatan in own history → self-certify the week → admin verifies the flagged record → finance numbers unchanged by trial students.

---

## Milestone M6 — Head Trainer / Finance Wins (Phase B)

**Entry gate:** M5 exit gate passed; SPP payment ledger design approved.

### M6.1 — SPP Payment Ledger

**M6.1.1** `EDIT: lib/sppPayments.js`  
Create ledger module mirroring `honorPayments` pattern: `{id, siswaId, periode, nominal, tanggalBayar, metode, diterimaOleh, bukti, sudahDisetor}`.  
**VERIFY:** Append-only; entries deletable individually (correction path).

**M6.1.2** `EDIT: lib/constants.js`  
Update `newSiswa()`: `sppLunas` becomes derived cache (derived from `sppPayments` sum, not manually edited).  
Add documentation comment: "// Derived from sppPayments ledger — never edit directly"  
**VERIFY:** Setting `sppLunas` manually throws console warning in dev.

**M6.1.3** `EDIT: features/payments/SppPaymentModal.jsx`  
Create modal: select siswa → periode → nominal → metode (dropdown: Tunai-Sekolah/Tunai-Trainer/Tunai-Admin/Transfer) → diterimaOleh → optional photo proof.  
**VERIFY:** Submit → ledger entry created → `sppLunas[periode]` auto-set → Keuangan Pemasukan updates.

### M6.2 — Financial Documents

**M6.2.1** `EDIT: features/reports/SlipHonor.jsx`  
Create printable slip: per-trainer, per-payment entry with signature lines.  
**VERIFY:** Click "Cetak Slip" on payment history → print preview shows formatted slip → window.print() works.

**M6.2.2** `EDIT: features/reports/InvoiceTemplate.jsx`  
Create invoice template: school letterhead, periode breakdown, `INV/YYYY/MM/{branch}-{seq}` numbering, status badge.  
**VERIFY:** Generate for school with 30 students → shows correct SPP total → status changes draft → terbit → lunas (derived).

### M6.3 — Advanced Reporting

**M6.3.1** `EDIT: features/reports/AgingReport.jsx`  
Create aging table: rows = schools, columns = Bulan Ini / 1 Bulan / 2+ Bulan / Total.  
Values derived from `tunggakan.js` elapsed period count.  
**VERIFY:** 2 students unpaid 2 months → SDN 01 shows 600k in 2+ bucket.

**M6.3.2** `EDIT: features/reports/FinanceReport.jsx`  
Add report mode toggle: Periode Tunggal / Rentang Kustom / Semester / Tahun Ajaran.  
**VERIFY:** Select Jul–Dec → table shows 6 columns with per-month data + totals.

**M6.3.3** `EDIT: features/reports/ExecutiveSummary.jsx`  
Create Overview card: big Laba/Rugi figure, collection rate %, top 3 red flags (worst collection, unpaid trainer, old tunggakan).  
**VERIFY:** Card renders on Overview; numbers match FinanceReport for same periode.

### M6.4 — MTD/YTD Comparison

**M6.4.1** `EDIT: features/reports/FinanceReport.jsx`  
Add comparison table: current periode vs. previous month vs. same month last academic year.  
Columns: current, prev, Δ absolute, Δ %.  
**VERIFY:** Jul 2026 vs Jun 2026 vs Jul 2025 → all three columns populate correctly.

**Exit gate:** Head Trainer can → record SPP payment with channel → print slip → generate school invoice → view aging report → export all without opening CSV.

---

## Milestone M7 — Platform & Multi-Branch (Phase C)

**Entry gate:** M6 exit gate passed; cPanel hosting active with PHP available.

### M7.1 — Branch Schema

**M7.1.1** `EDIT: lib/constants.js`  
Add `cabang: {id, nama, kode}` entity and factory.  
Add `cabangId` to `newSekolah()` — required field, defaults to first branch.  
**VERIFY:** Create school without cabangId → factory assigns default; dropdown shows in form.

**M7.1.2** `EDIT: lib/constants.js`  
Branch-prefixed IDs: `generateId(prefix, cabangKode)` → `prefix-BRANCH-Date.now-random`.  
Migrate existing IDs in-place (one-time function `migrateIds()`).  
**VERIFY:** New records have branch prefix; old records migrated; no collisions.

**M7.1.3** `EDIT: features/admin/BranchManager.jsx`  
Create branch CRUD (superadmin only).  
**VERIFY:** Create branch → assign school → school list filtered by branch.

### M7.2 — Server-First Storage

**M7.2.1** `EDIT: lib/store.js`  
Add async API client: `read()` → `fetch('/api/read.php')`, fallback to localStorage cache.  
Add `syncLog` tracking unsaved changes.  
**VERIFY:** Network off → app still works from cache → network on → sync button shows pending count → sync resolves.

**M7.2.2** `EDIT: server/api/*.php` (~40 lines each)  
Create PHP endpoints: `absensi.php`, `sppPayments.php`, `honorPayments.php`, `sync.php`.  
Append-only writes (INSERT, never UPDATE/DELETE except honorPayments correction).  
**VERIFY:** Post record → MySQL row appears → second post with same ID rejected (409 Conflict).

**M7.2.3** `EDIT: lib/constants.js`  
Add `idb-keyval` for photo storage. Compress images >500KB before storage.  
**VERIFY:** Photo saves to IndexedDB, not localStorage; localStorage size stays under 2MB.

### M7.3 — Quality & Scale

**M7.3.1** `EDIT: src/lib/__tests__/`  
Unit tests for `finance.js`: `financialData()` with known fixture → assertions on all outputs.  
Unit tests for `tunggakan.js`, `constants.js`, `backup.js`.  
**VERIFY:** `npm test` → 40+ assertions pass; CI fails on regression.

**M7.3.2** `EDIT: vite.config.js`  
Add `vite-plugin-pwa`. Manifest: name "Afterschola", icon, standalone display.  
**VERIFY:** Build → dist/manifest.json exists → Chrome DevTools → Application → installable.

**M7.3.3** `EDIT: features/overview/Overview.jsx`  
Add "Cabang" filter dropdown (superadmin only) switching all data views.  
**VERIFY:** Superadmin sees all branches → selects Cabang BDG → tables show only BDG data.

**Exit gate:** Two branches sync independently → superadmin aggregates both → no manual CSV intervention needed for month-end close.

---

## Milestone M8 — Auth Hardening (superseded by production gates)

Authentication is promoted into the production track and is no longer deferred. Implement the approved PHP session, RBAC, CSRF, branch-scope, and API contract in `PRODUCTION_MILESTONES.md` gates G0–M5. JWT, signed-header auth, and per-branch `.htaccess` password protection remain non-goals.

- Contract and roles: G0.2, M1.1, M2.1–M2.4
- Server authorization and protected APIs: M3.1–M3.5
- Authenticated React mode: M4.1–M4.3
- Security and operational hardening: M5.1–M5.4

---

## A2.5 — Manual-audit follow-ups (per D-10 = B, D-18 = B) — **GATE CLOSED 2026-09-07**

Source: `docs/log-doc/audit-app-vs-tests_2026-09-04_2249Z.md`. These extend the existing attendance-photo chain (A2) with sekolah/logo file pickers and the new jadwal day-picker.

**Closure evidence (working tree @ HEAD = 42c5a1b):**
- `A2.5-SEKOLAH-FOTO` — `SchoolList.jsx:10` imports `PhotoSlot`, used in the Sekolah form around line 408 (reuses the existing attendance path; taste #11).
- `A2.5-LOGO` — `SettingsModal.jsx:6,81-85` mounts `<PhotoSlot label="Logo (Unggah)" entry={logoEntry} onChange={setLogoEntry} />`; saved via `setSettings({ logoUrl, logoEntry, title })` at line 40.
- `A2.5-JADWAL-1` — `constants.js:43` adds `jadwalList: []` to `newSekolah()`; `SchoolList.jsx:77,416-457` is the day-picker + Add/Remove UI; `TrainerDashboard.jsx:8-13` reads `jadwalList` first with a `jadwal` string fallback (idempotent migration per taste #35).
- Status line on the Sekolah card (`SchoolList.jsx:319`) renders `formatJadwalList(sch.jadwalList) || sch.jadwal || 'Belum diatur'`.

**Closure verification (2026-09-07/08, PHP 8000 + XAMPP MySQL + Vite 5173 up, DB reset to canonical seed):**
- All three pinned specs exist and pass — `Verified: npx playwright test tests/sekolah-foto-picker.spec.js tests/settings-logo-picker.spec.js tests/sekolah-jadwal-list.spec.js --project=default --workers=1 -> 3 passed (25.2s)`; also green inside the full suite run (84/85/86 ok).
- `r3-verify.spec.js remains green` clause now true — `Verified: npx playwright test tests/r3-verify.spec.js --project=default --workers=1 -> 4 passed`. Required one in-scope test-side fix: PM.5.22's new `#` row-numbering column (`StudentList.jsx:232`) shifted the Data Siswa td indices; R3.3's `td.nth(3/4)` were updated to `nth(4/5)` (`r3-verify.spec.js:254-257`) — pre-existing drift from the PM.5.22 commit's own VERIFY clause, not an A2.5 regression.
- Unit suite: `Verified: npm test -> 54 passed (13 files)` — required one in-scope test-side fix: the stale `M-MAS1.1` expectation ("keeps cabangId for superadmin") was aligned to the server-authoritative contract (`trainer.php:51-53` forbids body `cabangId` for every role; store.js aligned in `e5bb162`; taste #61).
- Production build: `Verified: npm run build -> ✓ built in 4.16s, PWA precache 6 entries (435.53 KiB)`.
- Seed-fixture fix carried in the working tree: `server/tests/db-reset.php` — the canonical `cbg-test-pusat` seed payload now includes `id` inside the payload (read.php returns payloads verbatim; every client consumer keys off `record.id`; without it, superadmin sekolah creation 422s with "Cabang tidak valid").
- Suite-hygiene fix carried in the working tree: `playwright.config.js` default project now also ignores `phase567-exit-gate.spec.js` + `stress-simulation.spec.js` (destructive-project-only, matching the existing `auth-login-page` exclusion idiom). Their `cleanup_phase.php` `DELETE FROM cabang` was the "specific test that wipes the seeded branch" HY.5 root-cause #5 asked to isolate — it poisoned every later full-suite test needing `cbg-test-pusat`.

**Remaining (pre-existing, outside A2.5 scope — documented cohorts, not regressions):**
- Full-suite state (2026-09-07/08, 103 tests = 90 default + 13 destructive): 77 passed / 24 failed / 2 did-not-run. All 24 match the documented HYGIENE_MILESTONES 2026-09-03 classes: 12 `e2e.spec.js` selector drifts (class 2); 6 app-level/feature-gap specs incl. `multi-account-crud-sync` helper-shape mismatch (class 3); `student-delete-absensi` count assertion (class 4). Destructive project: `auth-login-page` cases 6/10 (HY.5.1b's known `Akun`-dropdown omission), `phase567-exit-gate` (`trn-test-1` trainer row never seeded), `stress-simulation` (pre-existing Tambah-Cabang overlay hang, re-tripping PM.5.9's new validation alert). The 2 `console.log` in `TrainerHistory.jsx:37,41` (859ea75 debug logging) were the pre-existing PM.5.17 hygiene item — **purged 2026-09-08 when the PM.5.11–5.22 gate closed** (see PLAYWRIGHT_MIGRATION_MILESTONES.md "Gate PM.5 (audit-appended) — closure evidence").
- **RESOLVED 2026-09-08 — the `859ea75` login-flake family (loginViaApi 200 → app lands on login page).** Root cause pinned with a four-probe diagnostic (fresh-context reproduction 25/25 amplified, natural-catch ~1/10, Node-level cookie-order probe 16/16): `loginViaApi`'s priming `page.goto('/')` boots the app, whose `bootstrapAuth()` fires cookie-less async `GET /api/auth/me.php` + `/api/auth/csrf.php`; PHP mints a fresh **visitor** session for each and returns it as `Set-Cookie`. When those responses land AFTER the login POST's `Set-Cookie`, the visitor-session cookie OVERWRITES the authenticated session cookie in the shared jar (same name, `afterschola_session`). The next `goto(APP)` then boots with the dead visitor session → `me.php` 401s → App renders "Silakan masuk untuk melanjutkan". Two compounding facts measured along the way: (a) PHP reads the FIRST same-named cookie when two are sent (`A;B` → 401 16/16, `B` alone → 200), and (b) the Vite proxy passes Set-Cookie through unchanged — neither is the cause, but both would mask a naive "send both cookies" workaround. Fix (test-side, `tests/fixtures.js` `loginViaApi`): drain the prime navigation's boot-time auth round-trips (`waitForResponse` on GET me.php then GET csrf.php, each with a 10s catch-swallow) BEFORE posting login, so login's authenticated Set-Cookie is the last value standing in the jar. `Verified:` post-fix probe 30/30 fresh contexts authenticated (was ~1/10 dead); the previously-flaky cohort (m63.3, flow-simulation trainer, audit2 trainer leg, school-list-actions, A2.5 acceptance batch incl. r3-verify) all pass with the fix. This closes the last open item of the 2026-09-03 class-5 HY.5 triage.

### A2.5-SEKOLAH-FOTO Sekolah.foto: add file picker (F-10) — **DONE 2026-09-08**

```text
MICROTASK: Sekolah.foto: add file picker
  EDIT:    src/features/schools/SchoolList.jsx (the SekolahForm, around line 350-353); src/components/PhotoSlot.jsx (existing component, may be reused); src/lib/store.js (add `uploadPhoto` helper that writes to IndexedDB or queues a server upload)
  FINDS:   F-10 (manual audit #004, #005); D-10 = B (extend SCOPE_EXPANSION)
  RULES:   taste #11 (mirror the existing PhotoSlot attendance path); per PRODUCTION_PLAN.md:121-125, photos must NOT be stored in localStorage for production — use IndexedDB or server upload; per SCOPE_EXPANSION_PLAN.md:158, photos outside localStorage; taste #35 (idempotent upload)
  DEPENDS: the A2 attendance-photo infra (M5.2.3) must be in place; if not, A2.5 inherits the dependency
  OUTCOME: the Sekolah form's Foto field offers two options: (a) URL input (existing), (b) file picker that uploads to IndexedDB and surfaces a thumbnail; the form saves the URL or the IndexedDB reference, not the raw file
  VERIFY:  Playwright `tests/sekolah-foto-picker.spec.js` (new) opens Tambah Sekolah as superadmin, asserts the Foto field has a file-picker option, uploads a small test image, asserts the thumbnail renders; refreshes the page, asserts the sekolah record re-hydrates with the same thumbnail; existing r3-verify.spec.js remains green
  DONE-IF: verify passes; only intended files changed
```

**DONE record (2026-09-08):** Spec exists (`tests/sekolah-foto-picker.spec.js`); asserts URL input + PhotoSlot picker, runtime-minted JPEG upload → thumbnail, `fotoEntry {type:'idb'}` storage contract (no raw bytes on record/localStorage), post-refresh re-hydration, and cleanup. `Verified: npx playwright test tests/sekolah-foto-picker.spec.js --project=default -> passed` (also green inside the full suite). A2 dependency satisfied: A2 photo infra (`PhotoSlot.jsx`, `photoStorage.js`) in place since M5.2.3.

### A2.5-LOGO Settings.logo: add file picker (F-19) — **DONE 2026-09-08**

```text
MICROTASK: Settings.logo: add file picker
  EDIT:    src/components/SettingsModal.jsx (the Logo URL field, around line 75-77); src/lib/store.js (extend the settings save to handle a logo file)
  FINDS:   F-19 (manual audit #019); D-10 = B
  RULES:   taste #11 (mirror A2.5-SEKOLAH-FOTO); per PRODUCTION_PLAN.md:121-125, photos outside localStorage; taste #15 wire the fix to a real upload guard
  DEPENDS: A2.5-SEKOLAH-FOTO (shared upload helper)
  OUTCOME: the Settings modal's Logo field offers URL input (existing) and file picker (new); the saved logo is referenced by URL or IndexedDB id, not the raw file; the app header's `SidebarLogo` (src/components/SidebarLayout.jsx:10-32) renders the saved logo
  VERIFY:  Playwright `tests/settings-logo-picker.spec.js` (new) opens Settings as superadmin, uploads a small test image, asserts the header's logo updates to the uploaded thumbnail, refreshes, asserts the logo survives; existing r3-verify.spec.js remains green
  DONE-IF: verify passes; only intended files changed
```

**DONE record (2026-09-08):** Spec exists (`tests/settings-logo-picker.spec.js`); asserts URL input + PhotoSlot picker, upload → header `img[alt="Logo"]` src delta, `logoEntry {type:'idb'}` storage contract, post-refresh survival, and post-test restore via "Hapus foto". `Verified: npx playwright test tests/settings-logo-picker.spec.js --project=default -> passed` (also green inside the full suite).

**LP.B.4 update (2026-09-12):** Server contract supersedes the idb-only expectation above (taste #42; F-LP1, D-LP4). Online superadmin saves now assert `logoEntry {type:'server', id}` backed by a `photo_uploads` row (`cabang_id NULL`); the spec keeps the same-device refresh leg (now proves idb cache warming) and adds a second-context leg (fresh `browser.newContext`, empty idb/localStorage by construction) that resolves the same id via `logo-current.php` and renders the same bytes via `logo-download.php` with zero per-device import. Offline/denied stays `{type:'idb'}` (R-LP5). Cleanup still clears the local entry via "Hapus foto" (the server row has no delete endpoint and is intentionally retained). `Verified: npx playwright test tests/settings-logo-picker.spec.js --project=default --workers=1 -> 1 passed`.

### A2.5-JADWAL-1 Sekolah.jadwal: day-picker + Add More (F-18) — **DONE 2026-09-08**

```text
MICROTASK: Sekolah.jadwal: list of {dayOfWeek, time} entries with Add More
  EDIT:    src/features/schools/SchoolList.jsx (the SekolahForm, around line 354-357); src/lib/constants.js (add `jadwalList` to `newSekolah()` factory, default `[]`); src/lib/format.js (if a formatter is needed for day/time)
  FINDS:   F-18 (manual audit #003); D-18 = B (list of day-of-week + time entries)
  RULES:   taste #11 (mirror existing form-row styling); taste #15 wire the fix to a real validation guard (each entry must have a valid dayOfWeek and time); taste #35 (idempotent migration of legacy `jadwal` string to `jadwalList[]` on first save)
  DEPENDS: none
  OUTCOME: the Sekolah form's Jadwal field is a list of (dayOfWeek, time) entries with an Add jadwal button; existing single-string `jadwal` is preserved as a derived display string (`Mon 14:00, Wed 15:00`) until the first save upgrades the record to the array form; the TrainerDashboard (src/features/auth/TrainerDashboard.jsx:8-10, scheduleIncludesToday) is updated to read `jadwalList[]` instead of the string
  VERIFY:  Playwright `tests/sekolah-jadwal-list.spec.js` (new) opens Tambah Sekolah as superadmin, adds 2 jadwal entries (Mon 14:00, Wed 15:00), saves, refreshes, asserts the form re-hydrates with 2 entries; opens the Sekolah as a trainer, asserts the Rekap Saya page shows the school on the matching day; existing r3-verify.spec.js remains green
  DONE-IF: verify passes; only intended files changed
```

**DONE record (2026-09-08):** Spec exists (`tests/sekolah-jadwal-list.spec.js`); asserts 2 pinned entries (Senin 14:00, Rabu 15:00) + a runtime-derived today entry (date-aware per testing taste), saved `jadwalList[]` shape, Edit-form re-hydration, then the trainer leg: API-created trainer (server policy username, one-time `initialPassword`), must-change-password gate completion, and Rekap Saya showing the school scheduled today with the formatted jadwal line. `Verified: npx playwright test tests/sekolah-jadwal-list.spec.js --project=default -> passed` (also green inside the full suite).

## Microtask Verification Standards

Each microtask above must satisfy:

```
MICROTASK: <one verb + one noun>
  EDIT:    <file(s) you own>
  RULES:   <R-codes that apply>
  VERIFY:  app boots, zero console errors, AND <one observable behavior>
  DONE-IF: verify passes; nothing else changed (git diff shows only intended lines)
```

**R-codes quick reference (from IMPLEMENTATION_PLAN.md):**
- R1: One concern per edit
- R2: Contract or nothing (all data via store.js)
- R3: Factories only
- R4: Ledger trust (aggregates from ledgers, never entity state)
- R5: Style-frozen (existing className verbatim)
- R6: Checkpoint discipline (narrowest pass/fail after every edit)
- R7: Ownership boundaries (only your files)

---

**End of Microtask Chains**
