# Invoice Follow-Up & Installment Payment Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify invoice payment recording into the Follow-up workflow as practiced by the client, providing real-time balance calculations, exact partial/full settlement transitions, transparent case closure ("Lunas / case closed"), accurate status badges across the app, and modified remaining-balance printouts without premature settlement or false "Terbayar" flags.

**Architecture:**
- **Form UI:** `InvoiceFollowUpSection` in `src/features/reports/InvoiceModal.jsx` receives the invoice settlement breakdown and displays initial billed total, previously paid amount, current balance, and live auto-calculated "Sisa tagihan setelah pembayaran ini".
- **Settlement & Closure:** When saved with a payment amount (`nominal > 0`), it appends a payment to `sppPayments` linked to `invoiceId`. If the remaining balance reaches Rp 0, invoice status becomes `Lunas`, and the Follow-up action is closed ("case closed"). If a remaining balance exists (`sisa > 0`), status stays `Belum Lunas`, and Follow-up remains accessible for subsequent installments.
- **Accurate Badges:** Badges in `InvoiceModal.jsx` and `SchoolList.jsx` check true settlement state: `Follow-up: Menunggu Pembayaran` (nominal = 0), `Follow-up: Cicilan (Sisa Rp X)` (partial payment), and `Follow-up: Lunas` (fully settled) — eliminating misleading green "Terbayar" flags on partial payments.
- **Print Template:** `InvoiceTemplate.jsx` and `server/lib/invoiceDoc.php` display the modified remaining balance breakdown explicitly labeled as an updated balance statement for the master invoice.

**Tech Stack:** React 19, Tailwind CSS, Vitest, PHP 8.2 (Standalone contract tests).

**Spec:** User Clarification (2026-11-09) & Teammate Findings (`docs/exemplar/session-examples1.pdf`).

## Global Constraints
- Preserve Taste guidelines: no console.log in `src/`, Indonesian UI copy (`Batal`, `Simpan`, `Lunas`, `Belum Lunas`, `Kasus Selesai`), Rupiah currency formatting conventions (`formatRupiah()`).
- Working tree hygiene: strictly preserve untracked files `LOGBOOK_leyddddddd.md` and `docs/AdminDashboard/` (Taste #13).
- No new external runtime dependencies.
- Linear git history on `test-stage`.

## Review Focus
1. Partial installment payment: An invoice of Rp 500.000 with a Follow-up payment of Rp 200.000 must result in `sisa: 300000`, status `Belum Lunas`, badge `Follow-up: Cicilan (Sisa Rp 300.000)`, and the Follow-up button must remain open for further installments.
2. Exact zero-balance settlement: When a Follow-up payment pays the exact remaining balance (e.g., remaining Rp 300.000 paid Rp 300.000), status becomes `Lunas`, and the Follow-up action is closed ("case closed"), preventing redundant follow-up logging.
3. Multi-installment history preservation: Recording multiple follow-up payments appends each payment to `sppPayments` and each communication note to `followUps` without overwriting earlier records.
4. Reactive form calculation: As the admin types an amount in the Follow-up form, the "Sisa setelah pembayaran ini" updates live and displays the resulting status preview.
5. School card badge consistency: In `SchoolList.jsx`, a school with an active invoice undergoing installment follow-up displays `📞 Follow-up: <date> (Cicilan)` or `(Menunggu Pembayaran)` instead of falsely claiming `(Terbayar)`.

---

### Task 1: Follow-Up Form Balance Summary & Reactive Settlement Preview

**Files:**
- Modify: `src/features/reports/InvoiceModal.jsx:189-325`
- Test: `src/features/reports/__tests__/invoice-followup-ui.test.jsx`

**Interfaces:**
- Consumes: `invoicePaymentBreakdown(inv, { sppPayments, siswa, invoices })` from `src/lib/invoices.js`
- Produces: `InvoiceFollowUpSection` receiving `breakdown` prop, rendering:
  - Summary row: `Total Tagihan Awal`, `Sudah Dibayar Sebelumnya`, `Sisa Tagihan Saat Ini`.
  - Reactive preview: `Sisa tagihan setelah pembayaran ini: Math.max(0, sisaSaatIni - fuForm.nominal)`.
  - Updated field labels:
    - `Tgl kirim` -> `Tgl Kirim / Kontak`
    - `Tgl follow-up` -> `Tgl Rencana Bayar / Janji Bayar`
    - `Nominal Pembayaran` -> `Nominal Pembayaran / Cicilan Saat Ini`
    - `Upload Bukti Bayar` -> `Upload Bukti Transfer / Koordinasi`

- [x] **Step 1.1: Write failing component tests in `invoice-followup-ui.test.jsx`**
  Add tests asserting that `InvoiceFollowUpSection`:
  - Renders the summary cards with `Total Tagihan Awal`, `Sudah Dibayar Sebelumnya`, and `Sisa Tagihan Saat Ini`.
  - Calculates and renders `Sisa setelah pembayaran ini` live based on `fuForm.nominal`.
  - Displays the clarified field labels.

- [x] **Step 1.2: Run test to verify it fails**
  Run: `npx vitest run src/features/reports/__tests__/invoice-followup-ui.test.jsx`
  Expected: FAIL (missing summary cards / new text)

- [x] **Step 1.3: Update `InvoiceFollowUpSection` and caller in `InvoiceModal.jsx`**
  - Pass `breakdown` into `<InvoiceFollowUpSection breakdown={breakdown} ... />`.
  - Render summary badges: `Total Tagihan`, `Sudah Dibayar`, `Sisa Saat Ini`.
  - Render live preview: `Sisa setelah pembayaran: {formatRupiah(Math.max(0, (breakdown?.sisaSaatIni ?? 0) - (Number(fuForm.nominal) || 0)))}`.
  - Update input labels to clearly distinguish date of contact vs date of payment promise, and nominal payment.

- [x] **Step 1.4: Run test to verify it passes**
  Run: `npx vitest run src/features/reports/__tests__/invoice-followup-ui.test.jsx`
  Expected: PASS

- [x] **Step 1.5: Commit Task 1**
  ```bash
  git add src/features/reports/InvoiceModal.jsx src/features/reports/__tests__/invoice-followup-ui.test.jsx
  git commit -m "feat(invoice): add live settlement summary and reactive balance preview to follow-up form"
  ```

---

### Task 2: Settlement Status Transition, "Case Closed", and Accurate Status Badges

**Files:**
- Modify: `src/features/reports/InvoiceModal.jsx:780-840, 1115-1150`
- Modify: `src/features/schools/SchoolList.jsx:400-415`
- Test: `src/features/reports/__tests__/invoice-followup-output.test.jsx`
- Test: `src/features/schools/__tests__/school-followup-output.test.jsx`

**Interfaces:**
- Consumes: `invoiceSettlement()` & `invoicePaymentBreakdown()`
- Produces:
  - When `settlement.status === 'Lunas'`: The "Follow-up" button is disabled/hidden or replaced by a non-interactive badge `✓ Selesai (Lunas)` ("case closed").
  - On invoice card badge:
    - If `settlement.status === 'Lunas'`: `Follow-up: Lunas` (Emerald badge).
    - If `settlement.dibayar > 0` and `settlement.sisa > 0`: `Follow-up: Cicilan (Sisa ${formatRupiah(settlement.sisa)})` (Sky/Blue badge).
    - If `settlement.dibayar === 0`: `Follow-up: Menunggu Pembayaran` (Amber badge).
  - In `SchoolList.jsx`:
    - School card follow-up chip evaluates against the school's active invoice settlement instead of naive `latestFu.nominal > 0`:
      - If school has unpaid balance: `📞 Follow-up: <date> (Cicilan)` or `(Menunggu Pembayaran)`.
      - If settled: `📞 Follow-up: <date> (Lunas)`.

- [x] **Step 2.1: Write failing unit tests in `invoice-followup-output.test.jsx` & `school-followup-output.test.jsx`**
  - In `invoice-followup-output.test.jsx`: Assert that an invoice with partial payment shows `Follow-up: Cicilan (Sisa Rp ...)` instead of `Follow-up: Terbayar`.
  - Assert that an invoice that is `Lunas` shows `Follow-up: Lunas` and does not display an actionable `Follow-up` edit button ("case closed").
  - In `school-followup-output.test.jsx`: Assert that school card shows `Cicilan` when invoice has partial payments remaining.

- [x] **Step 2.2: Run tests to verify they fail**
  Run: `npx vitest run src/features/reports/__tests__/invoice-followup-output.test.jsx src/features/schools/__tests__/school-followup-output.test.jsx`
  Expected: FAIL

- [x] **Step 2.3: Update `InvoiceModal.jsx` and `SchoolList.jsx`**
  - In `InvoiceModal.jsx`:
    - Update invoice card badge logic to check `settlement`:
      ```jsx
      const fuBadge = !latestFu ? null :
        settlement?.status === 'Lunas'
          ? { text: 'Follow-up: Lunas', color: 'bg-emerald-100 text-emerald-700' }
          : (settlement?.dibayar || 0) > 0
            ? { text: `Follow-up: Cicilan (Sisa ${formatRupiah(settlement.sisa)})`, color: 'bg-sky-100 text-sky-700' }
            : { text: 'Follow-up: Menunggu Pembayaran', color: 'bg-amber-100 text-amber-700' }
      ```
    - Case closed condition: Only render the `<button onClick={() => openFollowUp(inv)}>Follow-up</button>` when `settlement?.status !== 'Lunas'` (or show `<span className="text-[11px] font-bold text-slate-400">Kasus Selesai</span>` when Lunas).
  - In `SchoolList.jsx`:
    - Link `schoolFollowUps` with invoice settlements for accurate status copy (`Lunas` vs `Cicilan` vs `Menunggu Pembayaran`).

- [x] **Step 2.4: Run tests to verify they pass**
  Run: `npx vitest run src/features/reports/__tests__/invoice-followup-output.test.jsx src/features/schools/__tests__/school-followup-output.test.jsx`
  Expected: PASS

- [x] **Step 2.5: Commit Task 2**
  ```bash
  git add src/features/reports/InvoiceModal.jsx src/features/schools/SchoolList.jsx src/features/reports/__tests__/invoice-followup-output.test.jsx src/features/schools/__tests__/school-followup-output.test.jsx
  git commit -m "feat(invoice): implement case closed logic upon full settlement and accurate follow-up badges"
  ```

---

### Task 3: Modified Invoice Print Clarification & Multi-Stage Lifecycle Test

**Files:**
- Modify: `src/features/reports/InvoiceTemplate.jsx:215-250`
- Modify: `server/lib/invoiceDoc.php:480-510`
- Create: `src/features/reports/__tests__/invoice-followup-installment-lifecycle.test.jsx`

**Interfaces:**
- Consumes: Full invoice settlement, follow-up history, and payment ledger
- Produces:
  - Header in `InvoiceTemplate.jsx` and `invoiceDoc.php` includes clear subtitle for partial-payment / remaining balance statements:
    `Lembar Sisa Tagihan (Bukan Tagihan Baru) — Mengacu pada Nomor Faktur: #[Nomor]`
  - Automated integration test covering the exact scenario from PDF Page 3 & 4:
    1. Invoice Rp 500.000 terbit -> status Belum Lunas, sisa Rp 500.000.
    2. Follow-Up with payment Rp 200.000 -> sisa Rp 300.000, status Belum Lunas, badge Cicilan, Follow-up button remains open.
    3. Follow-Up with payment Rp 100.000 -> sisa Rp 200.000, status Belum Lunas.
    4. Follow-Up with payment Rp 200.000 -> sisa Rp 0, status transitions to `Lunas`.
    5. Case closed: Follow-up action closed, badge is `Follow-up: Lunas`.
    6. Verify invoice history lists all 3 payments, and follow-up accordion lists all 3 follow-up entries without loss.

- [x] **Step 3.1: Write failing lifecycle integration test in `invoice-followup-installment-lifecycle.test.jsx`**
  Write tests covering the full 6-step lifecycle above.

- [x] **Step 3.2: Run test to verify it fails**
  Run: `npx vitest run src/features/reports/__tests__/invoice-followup-installment-lifecycle.test.jsx`
  Expected: FAIL

- [x] **Step 3.3: Implement print clarification in `InvoiceTemplate.jsx` and `invoiceDoc.php`**
  - When `settlement.dibayar > 0 && settlement.sisa > 0`, explicitly note in the audit breakdown:
    `"Lembar Sisa Tagihan (Bukan Faktur Baru) — Mengacu pada Invoice #[Nomor]"`.

- [x] **Step 3.4: Run tests to verify they pass**
  Run: `npx vitest run src/features/reports/__tests__/invoice-followup-installment-lifecycle.test.jsx`
  Run: `php server/tests/invoice-doc.check.php`
  Expected: All PASS.

- [x] **Step 3.5: Commit Task 3**
  ```bash
  git add src/features/reports/InvoiceTemplate.jsx server/lib/invoiceDoc.php src/features/reports/__tests__/invoice-followup-installment-lifecycle.test.jsx
  git commit -m "feat(invoice): clarify remaining balance printout and add multi-stage follow-up lifecycle test"
  ```

---

### Task 4: Full Test Suite Verification & Production Build Sanity

**Files:**
- All touched files
- Test: Full Vitest suite, PHP contract suite, and production build

- [ ] **Step 4.1: Run full Vitest suite**
  Run: `npm test`
  Expected: All non-MySQL unit/integration test suites pass cleanly.

- [ ] **Step 4.2: Run full server contract test suites**
  Run: `npm run test:server`
  Expected: All standalone PHP contract suites pass.

- [ ] **Step 4.3: Verify Vite PWA production build**
  Run: `npm run build`
  Expected: Clean build with zero errors.

- [ ] **Step 4.4: Verify working tree hygiene**
  Run: `git status`
  Expected: Untracked files `LOGBOOK_leyddddddd.md` and `docs/AdminDashboard/` preserved untouched.
