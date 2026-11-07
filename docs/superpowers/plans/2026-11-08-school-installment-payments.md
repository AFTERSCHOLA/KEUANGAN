# School Installment Payments & Sisa Tagihan Print Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a dedicated, multi-stage installment payment recording flow ("Catat Pembayaran") on invoices with real-time remaining balance calculation, and upgrade the invoice print template (`InvoiceTemplate.jsx` and `invoiceDoc.php`) to display a clear audit breakdown for carry-overs and remaining balances (Total Awal, Sudah Dibayar, Pembayaran Saat Ini, Sisa Tagihan, and explanatory note), resolving the "Rp 0 at top vs Rp 100.000 at bottom" confusion.

**Architecture:**
- Frontend: `InvoiceModal.jsx` provides a dedicated "Catat Pembayaran" form matching Page 2 of the spec (Total Awal, Sudah Dibayar, Sisa Saat Ini, Input Nominal, Live Auto Sisa, Metode, Tanggal, Diterima Oleh, Bukti Bayar, Catatan).
- Ledger: Payments append directly to `sppPayments` linked to `invoiceId`, recalculating `invoiceSettlement()` dynamically (Belum Lunas -> Lunas upon complete settlement; credit on overpayment).
- Print / Doc: `InvoiceTemplate.jsx` and `server/lib/invoiceDoc.php` render a transparent "Rincian Tagihan / Sisa Tagihan" section matching Page 3 of the spec whenever an invoice carries previous payments or carry-overs.

**Tech Stack:** React 19, Tailwind CSS, Vitest, Node.js, PHP 8.2 (Standalone contract tests).

**Spec:** Teammate Consultation Document (Pages 1-4) & User Confirmation.

## Global Constraints
- Preserve Taste guidelines: no console.log in `src/`, Indonesian UI copy, Rupiah currency formatting conventions.
- Working tree hygiene: strictly preserve untracked files `LOGBOOK_leyddddddd.md` and `docs/AdminDashboard/` (Taste #13).
- No new external runtime dependencies.
- Linear git history on `test-stage`.

## Review Focus
1. Exact zero-balance settlement: when payment equals remaining balance, invoice status transitions immediately to `Lunas`.
2. Partial installment: when payment is less than remaining balance, invoice status stays `Belum Lunas` and sisa decreases by exact payment amount.
3. Overpayment: when payment exceeds remaining balance, excess is recorded as credit and sisa becomes 0.
4. Auto-calculation display: as the admin types the payment amount, `Sisa tagihan setelah pembayaran` updates reactively.
5. Sisa tagihan print breakdown: when an invoice has Rp 0 current period items but carry-over from an earlier invoice, the print view clearly explains the initial total, past payments, and remaining balance.

---

### Task 1: Installment Breakdown & Settlement Helpers in `src/lib/invoices.js`

**Files:**
- Modify: `src/lib/invoices.js`
- Test: `src/lib/__tests__/invoice-installment.test.js`

- [x] **Step 1.1**: Write unit tests in `src/lib/__tests__/invoice-installment.test.js` verifying `invoicePaymentBreakdown()` and `invoiceSettlement()` with multi-stage installments (initial total, previous payments, current payment, auto sisa, status transitions).
- [x] **Step 1.2**: Run test to verify it fails before implementation (`npm test -- invoice-installment`).
- [x] **Step 1.3**: Implement `invoicePaymentBreakdown(invoice, { sppPayments, siswa, invoices })` in `src/lib/invoices.js` returning structured breakdown `{ totalAwal, sudahDibayar, sisaSaatIni, payments }`.
- [x] **Step 1.4**: Run tests to verify they pass (`npm test -- invoice-installment`).
- [x] **Step 1.5**: Commit Task 1 changes.

---

### Task 2: Dedicated "Catat Pembayaran / Pelunasan Bertahap" Form in `InvoiceModal.jsx`

**Files:**
- Modify: `src/features/reports/InvoiceModal.jsx`
- Test: `src/features/reports/__tests__/invoice-installment-ui.test.jsx`

- [ ] **Step 2.1**: Write component tests in `src/features/reports/__tests__/invoice-installment-ui.test.jsx` verifying the "Catat Pembayaran" form renders with Invoice Number, Total Tagihan Awal, Sudah Dibayar Sebelumnya, Sisa Tagihan Saat Ini, updates "Sisa setelah pembayaran" live on input, and submits school-level payment.
- [ ] **Step 2.2**: Run test to verify it fails (`npm test -- invoice-installment-ui`).
- [ ] **Step 2.3**: In `InvoiceModal.jsx`:
  - Add "Catat Pembayaran" button on invoice card (when not fully Lunas). If fully Lunas, show "Lunas" indicator.
  - Implement modal/editor matching Page 2 layout:
    - Header with Invoice Number.
    - Readonly summary: Total tagihan awal, Sudah dibayar sebelumnya, Sisa tagihan saat ini.
    - Input: `Jumlah yang dibayarkan sekarang` (RupiahInput).
    - Reactive display: `Sisa tagihan setelah pembayaran` (auto-calculated: `Math.max(0, sisa - nominal)`).
    - Inputs: `Metode pembayaran` (Transfer / Tunai), `Tanggal pembayaran` (date picker), `Diterima oleh` (text), `Upload Bukti Bayar` (file input + receipt preview), `Catatan` (text).
    - Save action: appends `newSppPayment({ invoiceId: inv.id, ... })`, recomputes settlement, and updates UI state.
  - Preserve the Follow-Up history section for communication outreach.
- [ ] **Step 2.4**: Run tests to verify they pass (`npm test -- invoice-installment-ui`).
- [ ] **Step 2.5**: Commit Task 2 changes.

---

### Task 3: Sisa Tagihan & Carry-Over Audit Breakdown in Print Views

**Files:**
- Modify: `src/features/reports/InvoiceTemplate.jsx`
- Modify: `server/lib/invoiceDoc.php`
- Test: `src/lib/__tests__/invoice-print-sisa.test.js`

- [x] **Step 3.1**: Write tests in `src/lib/__tests__/invoice-print-sisa.test.js` verifying `InvoiceTemplate` renders the detailed breakdown (Total tagihan awal, Sudah dibayar sebelumnya, Pembayaran saat ini, Sisa tagihan, Keterangan) when an invoice represents carry-over / sisa tagihan.
- [x] **Step 3.2**: Run test to verify it fails (`npm test -- invoice-print-sisa`).
- [x] **Step 3.3**: Update `InvoiceTemplate.jsx`:
  - When an invoice has previous payments or carries over an earlier invoice with remaining balance:
    Render the clear audit block matching Page 3 of the spec:
    - Total tagihan awal
    - Sudah dibayar sebelumnya
    - Pembayaran saat ini / terakhir
    - Sisa tagihan
    - Keterangan note with original invoice reference and cumulative settlement progress.
- [x] **Step 3.4**: Update `server/lib/invoiceDoc.php` with identical audit breakdown structure.
- [x] **Step 3.5**: Run PHP contract check `php server/tests/invoice-doc.check.php` and `npm test -- invoice-print-sisa`.
- [x] **Step 3.6**: Commit Task 3 changes.

---

### Task 4: Full Test Suite Verification & Integration Sanity

**Files:**
- All touched files
- Test: Full Vitest suite & PHP contract suite

- [ ] **Step 4.1**: Run `npm test` across all 46 test files.
- [ ] **Step 4.2**: Run `npm run test:server` across all 18 PHP contract test suites.
- [ ] **Step 4.3**: Run `npm run build` to verify clean Vite PWA production bundle.
- [ ] **Step 4.4**: Verify `git status` to ensure working tree hygiene (untracked files `LOGBOOK_leyddddddd.md` and `docs/AdminDashboard/` untouched).
- [ ] **Step 4.5**: Commit any final plan/doc updates.
