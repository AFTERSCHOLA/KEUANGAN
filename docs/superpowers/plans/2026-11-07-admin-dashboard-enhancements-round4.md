# Admin Dashboard Enhancement Plan (Round 4: Invoice Parity, Print Layout, & Student Settlement)

**Goal:** Address 5 operational and testing issues raised by the team:
1. Fix fragile test fixture dependency in `school-status.test.js`.
2. Clear up payment method differentiation and fix "Harga Satuan" vs "Tarif per Sesi" with explanatory headers and tooltips.
3. Dynamically evaluate and reconcile `carryOverLines` so settled previous invoices do not persist as unpaid debts, and synchronize invoice `Lunas` status.
4. Implement a clear two-tier invoice print layout ("Cetak Invoice" & "Dokumen Resmi") showing current billing, previous carry-over, and net balance due.
5. Bridge school payment confirmation to the "Data Siswa" page so active students under settled school invoices immediately reflect "Lunas".
6. Verify 100% test pass on Vitest, PHP server battery, and production build.

**Architecture:**
- Frontend: React components in `src/features/reports/` (`InvoiceTemplate.jsx`, `InvoiceModal.jsx`), `src/features/students/` (`StudentList.jsx`), and helpers in `src/lib/` (`invoices.js`, `tunggakan.js`, `sppPayments.js`).
- Backend: PHP helpers in `server/lib/` (`invoiceDoc.php`, `invoiceGenerator.php`) and validation tests in `src/lib/__tests__/`.
- Database: MySQL InnoDB tables (`invoices`, `spp_payments`, `sekolah`, `siswa`, `cabang`).

---

## Task Breakdown

### Task 1: Fix Fragile Test Fixture in `school-status.test.js`
- **File:** `src/lib/__tests__/school-status.test.js:48-87`
- **Problem:** Hardcoding `$cabangId = 'cbg-test-pusat'` causes test failure on fresh machines where `cabang` table doesn't have that ID.
- **Solution:** Dynamically query an existing `cabang` row, or insert a temporary test `cabang` row if the table is empty.
- **Verify:** `npm test -- school-status` passes 100%.

### Task 2: Differentiate Billing Method & Fix "Harga Satuan" vs "Tarif per Sesi"
- **Files:**
  - `src/features/reports/InvoiceTemplate.jsx`
  - `server/lib/invoiceDoc.php`
  - `src/features/schools/SchoolList.jsx`
  - `src/features/reports/InvoiceModal.jsx`
  - `src/lib/__tests__/invoice-harga-satuan.test.js`
- **Requirements:**
  - For student-based flat invoices, "Harga Satuan" displays the school's SPP (`sekolah.spp` or `it.hargaSatuan`).
  - For per-meeting invoices (`basis: 'trainer'`), differentiate column header to `"Tarif per Sesi"` (or `"Honor/Tarif Sesi"`) with quantity as `"Sesi"` instead of `"Siswa"`.
  - In `SchoolList.jsx`, add clear guidance explaining the difference between "Flat / Beku (SPP per Siswa)" and "Tarif per Pertemuan (per Siswa / per Trainer)".
- **Verify:** `npm test -- invoice-harga-satuan` passes.

### Task 3: Dynamic Carry-Over Reconciliation & Invoice Status Synchronization
- **Files:**
  - `src/lib/invoices.js`
  - `server/lib/invoiceDoc.php`
  - `src/features/reports/InvoiceModal.jsx`
  - `src/lib/__tests__/invoice-carryover.test.js`
  - `src/lib/__tests__/invoice-followup-ledger.test.js`
- **Requirements:**
  - In `src/lib/invoices.js`: When reading an invoice with `carryOverLines`, dynamically check if the referenced invoice (`line.invoiceId`) has already been settled (`invoiceSettlement(prevInvoice).sisa === 0`). If settled, do not treat as an active unpaid debt.
  - When payment is received for an invoice with carry-over, reconcile both current and carry-over balances so total settlement marks invoice as `Lunas`.
  - In `server/lib/invoiceDoc.php`: `invoiceDocSettlement()` recognizes school-level payment rows with matching `sekolahId` and `periode`.
- **Verify:** `npm test -- invoice-carryover` and `npm test -- invoice-followup-ledger` pass.

### Task 4: Two-Tier Invoice Print Layout ("Cetak Invoice" & "Dokumen Resmi")
- **Files:**
  - `src/features/reports/InvoiceTemplate.jsx`
  - `server/lib/invoiceDoc.php`
  - `src/lib/__tests__/invoice-print-shape.test.js`
- **Requirements:**
  - Top Section: Tagihan Periode Ini (Subtotal) & Sudah Dibayar Periode Ini.
  - Middle Section: Sisa Tagihan Periode Sebelumnya (Carry-Over if any).
  - Bottom Section: Total Akumulasi yang Harus Dibayar (Net Remaining Balance).
  - Terbilang matches the net remaining balance.
  - Eliminate duplicated `$carryHtml` in `invoiceDoc.php`.
- **Verify:** `npm test -- invoice-print-shape` passes; visual and static markup verification.

### Task 5: Bridge School Payment Confirmation to Student Data ("Data Siswa")
- **Files:**
  - `src/lib/tunggakan.js`
  - `src/lib/sppPayments.js`
  - `src/features/students/StudentList.jsx`
  - `src/features/reports/InvoiceModal.jsx`
  - `src/lib/__tests__/tunggakan.test.js`
  - `src/lib/__tests__/spp-bulk.test.js`
- **Requirements:**
  - When a school payment is confirmed for an invoice covering a period (via follow-up or bulk settle with `sumberDana: 'sekolah'`), ensure active non-trial students belonging to that school and period reflect `Lunas`.
  - In `StudentList.jsx`: check if the student's school invoice for that viewed period is settled (`Lunas`), updating the badge to `Lunas` (`bg-emerald-100 text-emerald-700`).
  - In `src/lib/tunggakan.js`: `isTunggakan` considers school-level settled invoices so students under a settled school invoice are not falsely counted as overdue.
- **Verify:** `npm test -- tunggakan` and `npm test -- spp-bulk` pass.

### Task 6: Full Regression Test & Build Verification
- **Requirements:**
  - `npm test` -> 45+ test files pass 100%.
  - `npm run test:server` -> 18/18 server suites pass.
  - `npm run build` -> Clean Vite build.
