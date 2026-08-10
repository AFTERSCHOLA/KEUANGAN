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

**M5.2.4** `EDIT: features/attendance/QuickSession.jsx`  
Create QuickSession component: "Semua Hadir?" button marks all 30 students present; taps flip exceptions.  
**VERIFY:** One tap → all toggled → 3 exceptions tapped → save → record shows 27/30.

### M5.3 — Verification & History

**M5.3.1** `EDIT: features/attendance/RiwayatAbsensi.jsx`  
Add `statusVerifikasi` badge per row; filter "Belum Dicek"; verify button (admin/head-trainer role only).  
**VERIFY:** Admin can verify; trainer cannot; filter hides verified rows.

**M5.3.2** `EDIT: features/attendance/TrainerHistory.jsx`  
Create trainer-only history showing own records, upcoming schedule, "rekap saya" totals.  
**VERIFY:** Trainer sees only own `absensi` records; totals match manual calculation.

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

**Exit gate:** Trainer can login → mark attendance with photos → admin verifies same record → finance numbers unchanged by trial students.

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

## Milestone M8 — Auth Hardening (Phase D — Deferred)

**Deferred until cPanel phase complete and business case proven.**

- `.htaccess` per-branch password protection
- PHP session-based auth with `cabangId` claim
- Token-based API auth (JWT or signed headers)

---

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
