# Admin Dashboard Enhancements & Bugfixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 5 operational enhancements and bugfixes: fix the "Harga Satuan" `NaN` bug, add "Aktif" / "Non-Aktif" school operational isolation, add authenticated Change Password in the profile menu, add Forgot Password via SMTP with 1-hour expiration and user email configuration, and build multi-entry Invoice Follow-Up with folded accordion UI, receipt proof uploads, and school-level payment ledger integration with carry-over.

**Architecture:** Frontend enhancements in React (`src/features/` and `src/components/`), financial calculations in `src/lib/invoices.js` and `src/lib/finance.js`, backend endpoints in PHP (`server/api/`), zero-dependency socket-based SMTP mailer in `server/lib/mailer.php`, and schema migrations in `server/migrations/`. All changes maintain strict backward compatibility with existing localStorage caches, database payloads, and server-side RBAC scoping.

**Tech Stack:** React 18, Tailwind CSS, PHP 8+, MySQL (InnoDB + JSON payloads), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-admin-dashboard-enhancements-design.md`

## Global Constraints

- Indonesian UI copy and action labels throughout (`Simpan`, `Batal`, `Ubah Kata Sandi`, `Lupa kata sandi?`, `Aktif`, `Non-Aktif`, etc.).
- Plain digit entry for currency inputs; display formatted with Indonesian thousands separators via `formatRupiah()`.
- Non-destructive data model: legacy records missing new fields (`status`, `email`, `followUps`) default gracefully without requiring bulk overwrites.
- Role privilege integrity: `admin_cabang` is authorized to record follow-up and upload receipts only for schools in their own `cabangId`; `superadmin` has global access.
- Zero new external dependencies: socket SMTP mailer implemented with native PHP stream sockets; no composer packages.
- Handoff source hygiene: no `console.log` debug statements in `src/`, clean production build (`npm run build`).

## Review Focus

1. Invoices generated with per-meeting tariff or missing `hargaSatuan` must never display `RpNaN` in print, modal, or template.
2. Inactive schools must be hidden from active lists, student registration pickers, and automated invoice generators, while past closed invoices and past attendance remain intact.
3. Multiple follow-ups on the same invoice must append to history rather than overwriting past entries, and previous entries must collapse/expand cleanly.
4. Follow-up payment nominals must register in the cash ledger, reduce remaining invoice balance, and any unpaid remainder must automatically carry over to the next period.
5. Password reset requests must expire after 1 hour and reject attempts with an invalid or expired token.

---

### Task 1: Fix "Harga Satuan" NaN Bug & Add Defensive Currency Formatting

**Files:**
- Modify: `src/lib/format.js`
- Modify: `src/features/reports/InvoiceTemplate.jsx:80-90`
- Modify: `src/features/reports/InvoiceModal.jsx:87`
- Modify: `server/lib/invoiceDoc.php:98-110`
- Test: `src/lib/__tests__/invoice-harga-satuan.test.js`

**Interfaces:**
- Consumes: `invoice.items`, `invoice.hargaSatuan`, `sekolah.spp`
- Produces: Sanitized numeric unit price in all invoice views; `formatRupiah` safe against `NaN` / `undefined`.

- [ ] **Step 1: Write failing tests for formatRupiah and invoice harga satuan**
  Create `src/lib/__tests__/invoice-harga-satuan.test.js` asserting:
  - `formatRupiah(undefined)`, `formatRupiah(NaN)`, `formatRupiah(null)` all output `"Rp 0"`.
  - When invoice item has `{ tarifPerPertemuan: 75000 }` and no `hargaSatuan`, row harga evaluates to `75000`.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -- invoice-harga-satuan`
  Expected: FAIL with `expected 'RpNaN' to be 'Rp 0'` or missing property.
- [ ] **Step 3: Update `formatRupiah` in `src/lib/format.js`**
  Add numeric check:
  ```js
  const num = Number(amount);
  const safeAmount = Number.isFinite(num) ? num : 0;
  ```
- [ ] **Step 4: Update `InvoiceTemplate.jsx` and `invoiceDoc.php`**
  In `InvoiceTemplate.jsx:85`, use fallback:
  ```js
  harga: Number(it.hargaSatuan ?? it.tarifPerPertemuan ?? invoice.hargaSatuan ?? 0) || 0
  ```
  In `server/lib/invoiceDoc.php:99`, use:
  ```php
  'harga' => $it['hargaSatuan'] ?? $it['tarifPerPertemuan'] ?? $invoice['hargaSatuan'] ?? 0,
  ```
- [ ] **Step 5: Run tests to verify they pass**
  Run: `npm test -- invoice-harga-satuan`
  Expected: PASS
- [ ] **Step 6: Commit**
  ```bash
  git add src/lib/format.js src/features/reports/InvoiceTemplate.jsx src/features/reports/InvoiceModal.jsx server/lib/invoiceDoc.php src/lib/__tests__/invoice-harga-satuan.test.js
  git commit -m "fix(invoice): resolve harga satuan NaN bug and guard formatRupiah"
  ```

---

### Task 2: Data Sekolah "Aktif" & "Non-Aktif" Status & Operational Isolation

**Files:**
- Modify: `src/lib/constants.js:36-58` (`newSekolah`)
- Modify: `src/features/schools/SchoolList.jsx:30-140, 300-380, 480-550`
- Modify: `server/validation/entities.php:162-171` (`validateSekolah`)
- Modify: `server/lib/invoiceGenerator.php:80-95`
- Test: `src/lib/__tests__/school-status.test.js`

**Interfaces:**
- Consumes: `sekolah.status` (`'Aktif' | 'Non-Aktif'`)
- Produces: Filtered school lists by status; inactive schools excluded from active view and invoice generation.

- [ ] **Step 1: Write failing unit test for school status and filtering**
  Create `src/lib/__tests__/school-status.test.js` verifying:
  - `newSekolah()` defaults `status: 'Aktif'`.
  - A school with missing status defaults to `'Aktif'`.
  - Filter logic excludes `status === 'Non-Aktif'` when tab is `'Aktif'`.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -- school-status`
  Expected: FAIL (status property missing on `newSekolah()`).
- [ ] **Step 3: Update `src/lib/constants.js` and `server/validation/entities.php`**
  In `newSekolah()`, set `status: 'Aktif'`. In `validateSekolah()`, validate that if `status` is provided, it is in `['Aktif', 'Non-Aktif']`.
- [ ] **Step 4: Update `src/features/schools/SchoolList.jsx`**
  - Add status filter pills: `[Aktif]` (default), `[Non-Aktif]`, `[Semua]`.
  - Filter `visibleSekolah`: when `statusFilter === 'Aktif'`, show `s.status !== 'Non-Aktif'`.
  - In `SchoolForm`, add a Status select dropdown (`Aktif` / `Non-Aktif`).
  - On school card, display status badge (`bg-emerald-100 text-emerald-700` for Aktif, `bg-slate-100 text-slate-600` for Non-Aktif).
- [ ] **Step 5: Update `server/lib/invoiceGenerator.php`**
  In `invoiceGenerator.php:80-95`, skip schools where `payload->status === 'Non-Aktif'`.
- [ ] **Step 6: Run tests and verify**
  Run: `npm test -- school-status`
  Expected: PASS
- [ ] **Step 7: Commit**
  ```bash
  git add src/lib/constants.js src/features/schools/SchoolList.jsx server/validation/entities.php server/lib/invoiceGenerator.php src/lib/__tests__/school-status.test.js
  git commit -m "feat(schools): add Aktif and Non-Aktif status classification and operational filtering"
  ```

---

### Task 3: Authenticated Password Change Modal in Profile Dropdown

**Files:**
- Create: `src/components/ChangePasswordModal.jsx`
- Modify: `src/components/AccountMenu.jsx:60-90`
- Modify: `src/App.jsx:360-370`
- Test: `src/components/__tests__/ChangePasswordModal.test.jsx`

**Interfaces:**
- Consumes: `changePassword` in `src/lib/auth.js`
- Produces: Profile dropdown menu item `"Ubah Kata Sandi"` and change password dialog.

- [ ] **Step 1: Write test for ChangePasswordModal component**
  Create `src/components/__tests__/ChangePasswordModal.test.jsx` asserting:
  - Form validates that current password, new password, and confirmation match.
  - Submits valid credentials and triggers `onSuccess` callback.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -- ChangePasswordModal`
  Expected: FAIL (`ChangePasswordModal` does not exist).
- [ ] **Step 3: Implement `src/components/ChangePasswordModal.jsx`**
  Use `Modal.jsx` and `PasswordField.jsx`. Fields: `currentPassword`, `newPassword`, `confirmPassword`. Policy hint: minimum 12 characters, uppercase, lowercase, and digit. Calls `changePassword(currentPassword, newPassword)`.
- [ ] **Step 4: Update `AccountMenu.jsx` and `App.jsx`**
  In `AccountMenu.jsx`, add `"Ubah Kata Sandi"` menu item (with key icon) above `"Keluar"`. Wire click to `onOpenChangePassword`. In `App.jsx`, render `<ChangePasswordModal open={changePasswordOpen} onClose={...} />`.
- [ ] **Step 5: Run tests and verify**
  Run: `npm test -- ChangePasswordModal`
  Expected: PASS
- [ ] **Step 6: Commit**
  ```bash
  git add src/components/ChangePasswordModal.jsx src/components/AccountMenu.jsx src/App.jsx src/components/__tests__/ChangePasswordModal.test.jsx
  git commit -m "feat(auth): add change password modal to profile account menu"
  ```

---

### Task 4: Database Migration, SMTP Configuration, and Mailer Helper

**Files:**
- Create: `server/migrations/2026-11-06-users-email-and-reset-token.sql`
- Create: `server/config.smtp.example.php`
- Create: `server/lib/mailer.php`
- Modify: `server/bootstrap.php`
- Test: `server/tests/mailer.contract.php`

**Interfaces:**
- Consumes: SMTP credentials from `server/config.smtp.php`
- Produces: `sendEmail(string $to, string $subject, string $htmlBody, array $headers = []): bool`

- [ ] **Step 1: Create SQL migration**
  In `server/migrations/2026-11-06-users-email-and-reset-token.sql`:
  ```sql
  ALTER TABLE users ADD COLUMN email VARCHAR(191) NULL UNIQUE AFTER display_name;
  ALTER TABLE users ADD COLUMN reset_token_hash VARCHAR(255) NULL AFTER must_change_password;
  ALTER TABLE users ADD COLUMN reset_token_expires_at DATETIME NULL AFTER reset_token_hash;
  CREATE INDEX idx_users_email ON users (email);
  ```
- [ ] **Step 2: Create `server/config.smtp.example.php`**
  Define constants or return array with: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` (`tls`/`ssl`), `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`.
- [ ] **Step 3: Implement `server/lib/mailer.php`**
  Socket-based SMTP mailer using `stream_socket_client` and RFC 5321 commands (`EHLO`, `STARTTLS`, `AUTH LOGIN`, `MAIL FROM`, `RCPT TO`, `DATA`, `QUIT`). If unconfigured or local, log mail dispatch gracefully.
- [ ] **Step 4: Write contract test `server/tests/mailer.contract.php`**
  Verify configuration loader and mail formatting.
- [ ] **Step 5: Run contract test**
  Run: `php server/tests/mailer.contract.php`
  Expected: PASS
- [ ] **Step 6: Commit**
  ```bash
  git add server/migrations/2026-11-06-users-email-and-reset-token.sql server/config.smtp.example.php server/lib/mailer.php server/tests/mailer.contract.php
  git commit -m "feat(smtp): add user email migration, smtp configuration, and mailer helper"
  ```

---

### Task 5: Forgot Password & Reset Password API Endpoints

**Files:**
- Create: `server/api/auth/forgot-password.php`
- Create: `server/api/auth/reset-password.php`
- Modify: `server/tests/endpoint.protection.php`
- Test: `server/tests/forgot-password.lifecycle.php`

**Interfaces:**
- `POST /api/auth/forgot-password.php`: body `{ "identity": "username or email" }` -> sends email, returns `{ "ok": true }`.
- `POST /api/auth/reset-password.php`: body `{ "token": "...", "newPassword": "..." }` -> resets password, returns `{ "ok": true }`.

- [ ] **Step 1: Write lifecycle test `server/tests/forgot-password.lifecycle.php`**
  Assert:
  - Generates token and 1-hour expiry.
  - Reset with valid token updates password and clears token.
  - Reset with expired token returns 422 with expiration error message.
- [ ] **Step 2: Run test to verify it fails**
  Run: `php server/tests/forgot-password.lifecycle.php`
  Expected: FAIL (endpoints do not exist).
- [ ] **Step 3: Implement `server/api/auth/forgot-password.php`**
  Lookup user by `username` OR `email`. Generate 32-byte secure random token (`bin2hex(random_bytes(32))`), hash token with `hash('sha256', $token)`, set `reset_token_expires_at = NOW() + INTERVAL 1 HOUR`. Send reset link via `sendEmail()`.
- [ ] **Step 4: Implement `server/api/auth/reset-password.php`**
  Accept `token` and `newPassword`. Hash token, query active user where `reset_token_hash = :hash AND reset_token_expires_at > NOW()`. If not found, return 422: `"Permintaan ubah kata sandi tidak valid atau sudah kedaluwarsa"`. Validate password policy, update `password_hash`, clear reset fields and `must_change_password`.
- [ ] **Step 5: Run test to verify it passes**
  Run: `php server/tests/forgot-password.lifecycle.php`
  Expected: PASS
- [ ] **Step 6: Commit**
  ```bash
  git add server/api/auth/forgot-password.php server/api/auth/reset-password.php server/tests/forgot-password.lifecycle.php
  git commit -m "feat(auth): implement forgot password and reset token endpoints with 1-hour expiration"
  ```

---

### Task 6: Forgot Password UI & User Email Configuration

**Files:**
- Create: `src/features/auth/ForgotPasswordModal.jsx`
- Create: `src/features/auth/ResetPasswordPage.jsx`
- Modify: `src/features/auth/LoginPage.jsx:88-115`
- Modify: `src/features/admin/BranchManager.jsx`
- Modify: `src/components/SettingsModal.jsx`
- Modify: `src/App.jsx`
- Test: `src/features/auth/__tests__/ForgotPassword.test.jsx`

**Interfaces:**
- Consumes: `POST /api/auth/forgot-password.php`, `POST /api/auth/reset-password.php`
- Produces: Forgot password trigger on login page, reset password page, email input on admin branch management and profile settings.

- [ ] **Step 1: Write unit test for Forgot Password flow**
  Create `src/features/auth/__tests__/ForgotPassword.test.jsx`.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -- ForgotPassword`
  Expected: FAIL
- [ ] **Step 3: Implement `ForgotPasswordModal.jsx` and `ResetPasswordPage.jsx`**
  - In `LoginPage.jsx`, place a button `<button type="button" onClick={() => setForgotOpen(true)} className="text-xs text-blue-600 hover:underline">Lupa kata sandi?</button>` below the password field.
  - In `App.jsx`, detect URL query parameter `?resetToken=...` and render `ResetPasswordPage`.
- [ ] **Step 4: Add Email field to BranchManager and SettingsModal**
  - In `BranchManager.jsx` (admin user form), add an `Email` input field.
  - In `SettingsModal.jsx` (profile tab), allow user to view and update their email.
- [ ] **Step 5: Run tests and verify**
  Run: `npm test -- ForgotPassword`
  Expected: PASS
- [ ] **Step 6: Commit**
  ```bash
  git add src/features/auth/ForgotPasswordModal.jsx src/features/auth/ResetPasswordPage.jsx src/features/auth/LoginPage.jsx src/features/admin/BranchManager.jsx src/components/SettingsModal.jsx src/App.jsx src/features/auth/__tests__/ForgotPassword.test.jsx
  git commit -m "feat(auth-ui): add forgot password dialog, reset page, and user email inputs"
  ```

---

### Task 7: Multi-Entry Invoice Follow-Up Schema & Folded Accordion UI

**Files:**
- Modify: `src/features/reports/InvoiceModal.jsx:53-75, 148-195, 370-525`
- Modify: `src/lib/invoices.js:40-60`
- Modify: `server/auth/authorize.php:30-40`
- Modify: `server/api/invoices.php:90-115`
- Test: `src/features/reports/__tests__/invoice-followup-ui.test.jsx`

**Interfaces:**
- Consumes: `inv.followUps` array on invoice payload
- Produces: Folded accordion listing past follow-up history with image preview thumbnail; form to add subsequent follow-ups; branch admin permission to update follow-ups for own branch.

- [ ] **Step 1: Write test for multi-entry follow-up UI**
  Create `src/features/reports/__tests__/invoice-followup-ui.test.jsx` testing:
  - Renders previous follow-ups in folded cards.
  - Clicking a folded follow-up expands it to show receipt image and note.
  - Submitting new follow-up appends to `followUps` without overwriting existing entries.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -- invoice-followup-ui`
  Expected: FAIL
- [ ] **Step 3: Update `server/auth/authorize.php` and `server/api/invoices.php`**
  Allow `admin_cabang` to update invoice follow-up records if `cabang_id === user.cabang_id`.
- [ ] **Step 4: Implement Folded Accordion UI in `InvoiceModal.jsx`**
  - Migrate single `inv.followUp` to `inv.followUps = [ ... ]`.
  - Add accordion card per follow-up: display date, recipient, WA, notes, nominal paid, and receipt preview thumbnail.
  - Add photo upload slot using `uploadPhotoToServer(compressed, { cabangId: sekolah.cabangId })`.
  - Add clean form below accordion for entering the next follow-up.
- [ ] **Step 5: Run tests and verify**
  Run: `npm test -- invoice-followup-ui`
  Expected: PASS
- [ ] **Step 6: Commit**
  ```bash
  git add src/features/reports/InvoiceModal.jsx src/lib/invoices.js server/auth/authorize.php server/api/invoices.php src/features/reports/__tests__/invoice-followup-ui.test.jsx
  git commit -m "feat(invoice): multi-entry follow-up accordion with receipt uploads and branch admin authorization"
  ```

---

### Task 8: Follow-Up Payment Ledger Integration, Cash Revenue, & Unpaid Carry-Over

**Files:**
- Modify: `src/lib/invoices.js:180-238, 255-320` (`invoiceSettlement`, `carryOverLines`)
- Modify: `src/features/reports/InvoiceModal.jsx:160-260`
- Modify: `src/lib/finance.js:120-140`
- Test: `src/lib/__tests__/invoice-followup-ledger.test.js`

**Interfaces:**
- Consumes: Follow-up nominal payments, `sppPayments`
- Produces: School-level payment row registration; `invoiceSettlement()` deducting follow-up payments; red unpaid balance indicator; carry-over of unpaid `sisa` to next invoice.

- [ ] **Step 1: Write integration tests for follow-up payments and carry-over**
  Create `src/lib/__tests__/invoice-followup-ledger.test.js`:
  - When invoice for Rp 5,000,000 receives a Rp 2,000,000 follow-up payment, `settlement.dibayar` is Rp 2,000,000 and `settlement.sisa` is Rp 3,000,000.
  - Creating a subsequent invoice generates carry-over line with `amount: 3000000`.
  - Payment is included in `FinanceReport` revenue.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -- invoice-followup-ledger`
  Expected: FAIL
- [ ] **Step 3: Update `src/lib/invoices.js` and `InvoiceModal.jsx`**
  - In `InvoiceModal.jsx:saveFollowUp`, if `fuForm.nominal > 0`, call `addSppPayment()` with `sumberDana: 'sekolah'`, `invoiceId: inv.id`, `sekolahId: inv.sekolahId`, `nominal: fuForm.nominal`, `buktiBayar: fuForm.buktiBayar`.
  - In `invoiceSettlement`, ensure school-level payments linked to the invoice are included in `dibayar`.
  - In `InvoiceModal.jsx`, display the remaining `sisa` in prominent red text (`text-rose-600 font-bold`) awaiting further follow-ups.
  - In `carryOverLines()`, carry over the remaining `sisa` to the next period.
- [ ] **Step 4: Update `src/lib/finance.js`**
  Include school-level SPP payments (`sumberDana === 'sekolah'`) in `pemasukanSpp`.
- [ ] **Step 5: Run tests and verify**
  Run: `npm test -- invoice-followup-ledger`
  Expected: PASS
- [ ] **Step 6: Commit**
  ```bash
  git add src/lib/invoices.js src/features/reports/InvoiceModal.jsx src/lib/finance.js src/lib/__tests__/invoice-followup-ledger.test.js
  git commit -m "feat(finance): integrate follow-up payments with school cash ledger and carry-over"
  ```

---

### Task 9: Full Regression Test & Production Build Verification

**Files:**
- Test: Full Playwright & Vitest suite
- Build: `npm run build`

- [ ] **Step 1: Run complete unit test suite**
  Run: `npm test`
  Expected: All tests PASS cleanly.
- [ ] **Step 2: Run production build**
  Run: `npm run build`
  Expected: Clean build without errors or warnings.
- [ ] **Step 3: Commit documentation and signoff**
  ```bash
  git add docs/
  git commit -m "docs: finalize admin dashboard enhancement plan and milestones"
  ```
