# Admin Dashboard Enhancements & Bugfixes Design

**Date:** 2026-11-06  
**Status:** APPROVED — ready for planning (`writing-plans`).  
**Scope:** 5 enhancements & fixes across invoice follow-up ledger, harga satuan bug, school active/inactive classification, authenticated password change, and SMTP-driven forgot password.

---

## 1. Intent and The Why

The partner team identified 5 critical operational needs and fixes:
1. **Invoice Follow-Up Tracking & Aggregate Payments:** Multiple follow-up contacts must be recorded without overwriting past entries. When an installment or full payment is received during follow-up, recording the nominal and receipt image must register a school-level payment, reduce the invoice's remaining balance (`sisa`), visually display the remaining unpaid balance in red awaiting another follow-up, and automatically carry over any unpaid remainder to subsequent invoices upon generation.
2. **"Harga Satuan" NaN Bugfix:** Invoices generated under per-meeting tariff schemes (or without top-level `hargaSatuan`) render `Harga Satuan` as `"RpNaN"` in `InvoiceTemplate.jsx` and `InvoiceModal.jsx`. This must be permanently fixed with defensive fallbacks and guards.
3. **School Active / Non-Active Classification:** Schools can now be marked `Aktif` or `Non-Aktif`. Inactive schools—and their affiliated students—must be operationally isolated from active views, calculations, and selection dropdowns across the application while preserving historical audit data.
4. **On-Demand Password Change for Admins:** Superadmin and Admin Cabang currently have no UI to change their password while logged in unless forced by `must_change_password`. An accessible, policy-compliant change password dialog must be provided in the profile menu.
5. **Forgot Password via SMTP with Expiration:** Allow unauthenticated users on the login page to request a password reset via email. Requests must expire if left incomplete, user emails must be configurable in management & profile, and SMTP configuration must be decoupled into a ready-to-edit configuration file.

---

## 2. Goals

1. **Multi-Entry Follow-Up with Payment & Proof:**
   - Store follow-ups as an array (`followUps: [...]`) on the invoice payload, preserving backward compatibility with legacy `followUp` objects.
   - Each follow-up entry captures: `id`, `createdAt`, `penerima`, `wa`, `tanggalKirim`, `tanggalFollowUp`, `nominal`, `buktiBayar` (server photo entry), and `catatan`.
   - In `InvoiceModal.jsx`, render past follow-ups in a collapsible/folded accordion list (each displaying metadata, nominal paid, and clickable receipt image preview), accompanied by an input form to submit subsequent follow-ups.
   - Authorize both `superadmin` and `admin_cabang` (scoped to own branch) to record follow-up entries and upload payment receipts.
   - Register school-level payments (`sumberDana: 'sekolah'`, `invoiceId: inv.id`) so payments appear in `FinanceReport` income and reduce `settlement.sisa`.
   - Display unpaid remaining balance in clear red status awaiting further follow-ups. When the next period invoice is generated, existing `carryOverLines()` automatically picks up `settlement.sisa > 0`.
2. **Robust Harga Satuan Resolution:**
   - In `InvoiceTemplate.jsx` and `invoiceDoc.php`, resolve unit price via multi-tiered fallback:
     `harga = it.hargaSatuan ?? it.tarifPerPertemuan ?? invoice.hargaSatuan ?? sekolah.spp ?? 0`.
   - In `formatRupiah()`, add defensive coercion so non-finite or `NaN` inputs safely format as `Rp 0` rather than `RpNaN`.
   - In `InvoiceModal.jsx`, sanitize `sekolah.spp` string/number parsing.
3. **Complete Active/Inactive School Isolation:**
   - Add `status: 'Aktif' | 'Non-Aktif'` to school records (`newSekolah` defaults `'Aktif'`; missing status on legacy rows defaults to `'Aktif'`).
   - In `SchoolList.jsx`, add a filter bar (`Aktif` [default], `Non-Aktif`, `Semua`) and status selection in `SchoolForm`.
   - In other modules (`Siswa` registration, `Penugasan` timetable, `Absensi` creation, and invoice generation), filter out `Non-Aktif` schools and treat affiliated students as dynamically inactive to prevent stale calculations or orphaned assignments.
   - Preserve historical closed invoices, past attendance, and past reports intact.
4. **Authenticated Change Password in Profile Dropdown:**
   - Add `"Ubah Kata Sandi"` to `AccountMenu.jsx` for `superadmin` and `admin_cabang`.
   - Opens a modal with current password, new password, and confirmation, backed by the existing `POST /api/auth/change-password.php` endpoint.
5. **Forgot Password Flow & SMTP Integration:**
   - Add database fields/migration for `email`, `reset_token_hash`, and `reset_token_expires_at` in `users`.
   - Add optional `email` field in user creation/edit forms (`BranchManager.jsx`, `users.php`) and in the logged-in user profile/settings modal.
   - Add `server/config.smtp.example.php` (and optional `server/config.smtp.php`) with host, port, credentials, and encryption.
   - Provide `server/lib/mailer.php` to handle email delivery via direct SMTP socket.
   - Endpoints:
     - `POST /api/auth/forgot-password.php`: generates a cryptographically random token, hashes and stores it with a 1-hour expiration, and dispatches a reset link.
     - `POST /api/auth/reset-password.php`: validates token existence and non-expiration, sets the new password, clears the token, and resets `must_change_password`.
   - Frontend:
     - Text link `"Lupa kata sandi?"` on `LoginPage.jsx` below the password field.
     - Forgot Password request dialog & Reset Password entry screen when navigated with `?resetToken=...`.

---

## 3. Non-Goals

- Refactoring the entire SPP student ledger: student-level vs aggregate school payments are kept as-is; follow-up payments reconcile at the school/invoice payment level without retroactively mutating historic per-student rows.
- Full email inbox management: the app will only send outgoing transactional reset emails, not receive or sync incoming email.
- Changing password policy complexity: retains the existing 12+ character mixed-case + digit server validation rule in `server/bootstrap.php`.
- Destructive cascades on database: setting a school to `Non-Aktif` does not irreversibly overwrite `siswa.status` in the DB.

---

## 4. Anti-Goals

- Storing raw base64 images inside the invoice JSON payload (all images must go through `/api/photo-upload.php` and persist as lightweight `{ type: 'server', id }` references).
- Re-inventing custom UI patterns: all modals, dropdowns, alerts, and accordions must mirror existing Tailwind and component conventions (`Modal.jsx`, `ConfirmDialog.jsx`, `PhotoSlot.jsx`, `RupiahInput.jsx`).
- Breaking existing school or invoice data without status or follow-up fields (must be 100% non-destructive and backward compatible).

---

## 5. Architectural & Technical Decisions

### Decision 1: Invoice Follow-Up Schema, Multi-Entry Accordion, & Ledger Integration
- **Schema on Invoice Payload:**
  ```json
  {
    "followUps": [
      {
        "id": "fu-abc12345",
        "createdAt": "2026-11-06T12:00:00Z",
        "penerima": "Ibu Siti",
        "wa": "08123456789",
        "tanggalKirim": "2026-11-06",
        "tanggalFollowUp": "2026-11-13",
        "nominal": 2500000,
        "buktiBayar": { "type": "server", "id": "pht-xxx" },
        "catatan": "Pembayaran termin 1 via transfer Mandiri"
      }
    ]
  }
  ```
- **Settlement & Ledger Integration:**
  - Recording a payment nominal via Follow-Up generates a school-level payment record in `sppPayments` (`sumberDana: 'sekolah'`, `invoiceId: inv.id`, `sekolahId: inv.sekolahId`, `nominal: ...`, `buktiBayar: ...`).
  - This cash receipt is recognized in `FinanceReport` income and simultaneously settles the invoice.
  - The remaining balance (`sisa`) is displayed in red text. If unpaid balance remains when generating next period's invoice, `carryOverLines()` automatically carries forward `settlement.sisa`.
- **Authorization:**
  - `authorize.php` and `InvoiceModal.jsx` allow `admin_cabang` to manage follow-ups for invoices belonging to their own `cabangId`.
- **UI Accordion:**
  - Folded card header: `[Tanggal] · [Penerima] · [Nominal] · [Bukti Bayar preview]` with an expand/collapse chevron.
  - Expanded view: reveals note details, full timestamp, and click-to-enlarge payment receipt.
  - Form section below: clean form for adding a new follow-up with `RupiahInput` for nominal and image uploader via `uploadPhotoToServer`.

### Decision 2: Fix "Harga Satuan" `NaN`
- In `src/features/reports/InvoiceTemplate.jsx`:
  ```js
  const rowHarga = Number(
    it.hargaSatuan ?? it.tarifPerPertemuan ?? invoice.hargaSatuan ?? sekolah?.spp ?? 0
  ) || 0;
  ```
- In `src/lib/format.js`:
  ```js
  export function formatRupiah(amount) {
    const num = Number(amount);
    const safeAmount = Number.isFinite(num) ? num : 0;
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(safeAmount);
  }
  ```
- In `server/lib/invoiceDoc.php`: ensure `$it['hargaSatuan'] ?? $it['tarifPerPertemuan'] ?? $invoice['hargaSatuan'] ?? 0` is passed to the official printable document.
- In `InvoiceModal.jsx`: sanitize `sekolah.spp` string/number parsing.

### Decision 3: School "Aktif" & "Non-Aktif" Lifecycle & Operational Isolation
- Field on `sekolah`: `status: 'Aktif' | 'Non-Aktif'` (defaults to `'Aktif'`).
- `SchoolList.jsx`:
  - Filter pills: `Aktif` (active by default), `Non-Aktif`, `Semua`.
  - When filtering `Aktif`, any school where `s.status !== 'Non-Aktif'` is displayed.
  - `SchoolForm`: Toggle / select between `Aktif` and `Non-Aktif`.
- **Operational Isolation:**
  - Students of inactive schools are dynamically filtered out from active counts and billing in current periods.
  - Inactive schools are excluded from school selection dropdowns in Student registration/edit, Trainer assignments (`PenugasanManager` / `QuickSession`), and automated invoice generation (`invoices-generate.php`).
  - Historical data (past closed invoices, past attendance, past reports) remains intact.

### Decision 4: Authenticated Password Change
- In `src/components/AccountMenu.jsx`, add item `"Ubah Kata Sandi"` for roles `superadmin` and `admin_cabang`.
- Creates a dedicated `ChangePasswordModal.jsx` requesting:
  - `currentPassword`
  - `newPassword`
  - `confirmPassword`
- Calls `changePassword(currentPassword, newPassword)` in `src/lib/auth.js` against `/api/auth/change-password.php`.
- Shows feedback toast / alert upon successful change and closes the modal.

### Decision 5: Forgot Password via SMTP
- **DB Migration (`server/migrations/2026-11-06-users-email-and-reset-token.sql`):**
  - Add `email VARCHAR(191) NULL UNIQUE` to `users`.
  - Add `reset_token_hash VARCHAR(255) NULL` to `users`.
  - Add `reset_token_expires_at DATETIME NULL` to `users`.
- **User Provisioning & Profile:**
  - Add optional `email` input in `BranchManager.jsx` (when creating/editing branch admin users).
  - Add `email` field in profile settings modal so existing users can update their email.
- **Configuration (`server/config.smtp.example.php`):**
  - Defines `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`.
  - Loaded dynamically if `server/config.smtp.php` exists.
- **Mailer Helper (`server/lib/mailer.php`):**
  - Implements lightweight, zero-dependency SMTP client via `fsockopen` / `stream_socket_client` supporting SSL/TLS (`STARTTLS` or `smtps`).
- **Reset Flow:**
  - Request: user inputs username or email on login page.
  - Token generation: `bin2hex(random_bytes(32))` with 1-hour expiry.
  - Dispatch email containing password reset link.
  - Verification & Reset: opening the link lets user enter new password. Server verifies hash and checks `NOW() < reset_token_expires_at`.
  - If expired: rejects with clear message *"Permintaan ubah kata sandi sudah kedaluwarsa. Silakan ajukan ulang."*
  - On success: updates password, clears token and expiry, unlocks user if locked, and resets `must_change_password`.

---

## 6. Verification & Test Plan

1. **Invoice Follow-Up & Carry-Over Tests:**
   - Unit test in `src/lib/__tests__/invoice-followup.test.js`:
     - Follow-up payment summation into settlement.
     - Carry-over calculation carrying forward `sisa` to next period.
     - Multi-entry follow-up array appending without overwriting.
     - Permission test for `admin_cabang` on own branch follow-up.
2. **Harga Satuan Non-NaN Test:**
   - Unit tests in `src/lib/__tests__/invoice-harga-satuan.test.js` and `format.test.js`:
     - `formatRupiah(undefined)`, `formatRupiah(NaN)`, `formatRupiah(null)` all return `"Rp 0"`.
     - Invoice template with `tarifPerPertemuan` correctly renders unit price instead of `RpNaN`.
3. **School Active/Inactive Filter & Scope Tests:**
   - Verify `newSekolah()` default status is `'Aktif'`.
   - Test filtering in `SchoolList`: selecting `Aktif` excludes `Non-Aktif` schools; selecting `Non-Aktif` shows only inactive schools.
   - Verify inactive schools are omitted from student creation dropdowns, timetable assignments, and automated invoice generator.
4. **Change Password Test:**
   - Integration test verifying logged-in user can change password and immediately authenticate with new credentials.
5. **Forgot Password & Expiry Test:**
   - Test `forgot-password.php` token creation and expiry enforcement.
   - Test expired token rejection in `reset-password.php`.
   - Production build check: `npm run build` succeeds cleanly.
