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

## A2.5 — Manual-audit follow-ups (per D-10 = B, D-18 = B)

Source: `docs/log-doc/audit-app-vs-tests_2026-09-04_2249Z.md`. These extend the existing attendance-photo chain (A2) with sekolah/logo file pickers and the new jadwal day-picker.

### A2.5-SEKOLAH-FOTO Sekolah.foto: add file picker (F-10)

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

### A2.5-LOGO Settings.logo: add file picker (F-19)

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

### A2.5-JADWAL-1 Sekolah.jadwal: day-picker + Add More (F-18)

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
