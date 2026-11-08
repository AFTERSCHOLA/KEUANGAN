# Credit Carry-Over & Follow-Up Output Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile credit carry-overs so that `InvoiceModal` and print templates calculate consistent remaining balances and statuses (eliminating the contradictory "Belum Lunas with Total Yang Harus Dibayar Rp 0" bug), and implement multi-level follow-up outputs across the invoice card, follow-up history, school cards in `SchoolList.jsx`, and print templates.

**Architecture:**
- Settlement & Credit:
  - In `src/lib/invoices.js`, integrate active credit carry-overs into `invoiceSettlement()` so that if an invoice is covered by past credit, its settlement and status reflect `Lunas (Kredit)` with `sisa: 0`.
  - Ensure `invoiceTotalYangHarusDibayar` never produces a disjoint result from the invoice settlement.
  - Guard against phantom credit generation on invoices with `grandTotal: 0`.
- Follow-Up Output:
  - In `src/features/reports/InvoiceModal.jsx`, render prominent status badges: `[Follow-up: Menunggu Pembayaran]` (when nominal = 0) vs `[Follow-up: Terbayar Rp X]` (when nominal > 0).
  - In `InvoiceFollowUpSection` accordion: add explicit status badges (`Belum Bayar` / `Menunggu Pembayaran` vs `Terbayar`).
  - In `src/features/schools/SchoolList.jsx`: surface the latest follow-up chip directly on the school card (`📞 Follow-up: <date> (<status>)`), giving instant visibility without opening the modal.
  - In `InvoiceTemplate.jsx` and `invoiceDoc.php`: if an unpaid invoice has an active follow-up commitment/note, print it under Catatan Pembayaran.

**Tech Stack:** React 19, Tailwind CSS, Vitest, MySQL / PHP 8.2 contract tests.

## Global Constraints
- Preserve Taste guidelines: no console.log in `src/`, Indonesian UI copy, Rupiah currency formatting conventions.
- Working tree hygiene: strictly preserve untracked files `LOGBOOK_leyddddddd.md` and `docs/AdminDashboard/` (Taste #13).
- No new external runtime dependencies.
- Linear git history on `test-stage`.

## Review Focus
1. An invoice with credit carry-over matching or exceeding the bill must reflect `sisa: 0` and status `Lunas` across both modal and print.
2. If cash is paid on an invoice with credit, remaining balance is never negative and Total Yang Harus Dibayar equals the remaining balance.
3. An unpaid follow-up (`nominal: 0`) displays a clear `Menunggu Pembayaran` / `Belum Bayar` status in the modal and on the school card in `SchoolList.jsx`.
4. Follow-up notes and promise dates appear in the printed invoice's payment notes when unpaid.
5. All 48 Vitest suites and 18 PHP contract test suites pass with 0 regressions.

---

### Task 1: Reconcile Credit Carry-Over in Settlement and Print Math

**Files:**
- Modify: `src/lib/invoices.js`
- Modify: `src/features/reports/InvoiceModal.jsx`
- Modify: `src/features/reports/InvoiceTemplate.jsx`
- Modify: `server/lib/invoiceDoc.php`
- Modify: `server/api/invoices-doc.php`
- Test: `src/lib/__tests__/invoice-credit-reconcile.test.js`

- [x] **Step 1.1**: Write unit tests in `src/lib/__tests__/invoice-credit-reconcile.test.js` verifying:
  - An invoice with Rp 500.000 grandTotal and Rp 500.000 carry-over credit evaluates to `sisa: 0`, status `Lunas`, and `totalYangHarusDibayar: 0`.
  - An invoice with Rp 500.000 grandTotal, Rp 200.000 carry-over credit, and Rp 200.000 cash evaluates to `sisa: 100.000`, status `Belum Lunas`, and `totalYangHarusDibayar: 100.000`.
  - Invoices with `grandTotal: 0` do not mint phantom credit in `carryOverLines()`.
- [x] **Step 1.2**: Run test to verify it fails (`npm test -- invoice-credit-reconcile`).
- [x] **Step 1.3**: Update `src/lib/invoices.js`:
  - In `invoiceSettlement()`: factor in `activeCredit` from carry-over lines (`effectiveTotal = Math.max(0, total - activeCredit); sisa = Math.max(0, effectiveTotal - dibayar)`). If `effectiveTotal <= dibayar`, status is `Lunas`.
  - In `carryOverLines()`: do not emit a credit line if `previous.grandTotal === 0 && previous.total === 0` (phantom credit guard).
  - In `invoiceTotalYangHarusDibayar()`: return `settlement.sisa + totalActiveCarryOver` consistently.
- [x] **Step 1.4**: Update `InvoiceTemplate.jsx`, `server/api/invoices-doc.php`, and `server/lib/invoiceDoc.php` to use the unified settlement logic so print templates never contradict invoice status.
- [x] **Step 1.5**: Run tests to verify they pass (`npm test -- invoice-credit-reconcile` and `php server/tests/invoice-doc.check.php`).
- [x] **Step 1.6**: Commit Task 1 changes.

---

### Task 2: Multi-Level Follow-Up Output in Modal, School Cards, and Print

**Files:**
- Modify: `src/features/reports/InvoiceModal.jsx`
- Modify: `src/features/schools/SchoolList.jsx`
- Modify: `src/features/reports/InvoiceTemplate.jsx`
- Modify: `server/lib/invoiceDoc.php`
- Test: `src/features/reports/__tests__/invoice-followup-output.test.jsx`
- Test: `src/features/schools/__tests__/school-followup-output.test.jsx`

- [x] **Step 2.1**: Write component unit tests for follow-up outputs:
  - In `invoice-followup-output.test.jsx`: verifies invoice card displays `[Follow-up: Menunggu Pembayaran]` badge when unpaid, and accordion displays status chips for each follow-up.
  - In `school-followup-output.test.jsx`: verifies school card in `SchoolList.jsx` displays the latest follow-up status chip when the school has active follow-ups.
- [x] **Step 2.2**: Run tests to verify they fail.
- [x] **Step 2.3**: Update `InvoiceModal.jsx`:
  - Render a prominent badge `[Follow-up: Menunggu Pembayaran]` (amber) or `[Follow-up: Terbayar]` on the invoice card.
  - In `InvoiceFollowUpSection`: add status chip to each item in the accordion (`Belum Bayar` vs `Terbayar Rp X`).
- [x] **Step 2.4**: Update `src/features/schools/SchoolList.jsx`:
  - Compute latest follow-up across the school's invoices.
  - Display follow-up chip on the school card (`📞 Follow-up: <date> - <status>`).
- [x] **Step 2.5**: Update `InvoiceTemplate.jsx` and `server/lib/invoiceDoc.php`:
  - When an invoice is unpaid and has a follow-up note, include it in `Catatan Pembayaran`.
- [x] **Step 2.6**: Run tests to verify they pass.
- [x] **Step 2.7**: Commit Task 2 changes.

---

### Task 3: Full System Verification & Real-Data Integration Sanity

**Files:**
- All touched files
- Test: Full Vitest suite, PHP contract suite, and production build

- [x] **Step 3.1**: Run `npm test` across all test files.
- [x] **Step 3.2**: Run `npm run test:server` across all 18 PHP contract test suites.
- [x] **Step 3.3**: Run `npm run build` to verify clean Vite PWA production bundle.
- [x] **Step 3.4**: Verify working tree hygiene (`LOGBOOK_leyddddddd.md` and `docs/AdminDashboard/` untouched).
- [x] **Step 3.5**: Finalize documentation and commit.
