# Admin Dashboard Enhancement Plan (Round 3)

**Goal:** Implement 5 key operational enhancements and bugfixes: fix the "Harga Satuan" `NaN` bug, add "Aktif" / "Non-Aktif" school status with operational isolation, add authenticated Change Password in the profile menu, add Forgot Password via SMTP with 1-hour expiration and user email configuration, and build multi-entry Invoice Follow-Up with folded accordion UI, receipt proof uploads, and school-level payment ledger integration with carry-over.

**Architecture:** Frontend enhancements in React (`src/features/` and `src/components/`), financial calculations in `src/lib/invoices.js` and `src/lib/finance.js`, backend endpoints in PHP (`server/api/`), zero-dependency socket-based SMTP mailer in `server/lib/mailer.php`, and schema migrations in `server/migrations/`.

**Tech Stack:** React 18, Tailwind CSS, PHP 8+, MySQL (InnoDB + JSON payloads), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-admin-dashboard-enhancements-design.md`

---

## 1. Context & Background

Following hands-on operational evaluation by the team, 5 areas were identified:
1. In `Data Sekolah` -> Invoice history: follow-up currently overwrites the previous entry, cannot record payment nominals or upload receipt images, and cannot reflect partial payments in the remaining balance or future carry-over.
2. In `InvoiceTemplate.jsx` and `invoiceDoc.php`: unit price (`Harga Satuan`) renders as `RpNaN` for invoices generated under meeting tariffs or missing top-level `hargaSatuan`.
3. In `Data Sekolah`: partner schools need to be classified as `Aktif` or `Non-Aktif`, hiding inactive schools and their students from current operations and dropdowns.
4. User management: logged-in Superadmin and Admin Cabang lack an on-demand "Ubah Kata Sandi" menu.
5. Login screen: unauthenticated users lack a "Lupa kata sandi?" mechanism backed by SMTP email delivery with expiration.

---

## 2. Key Decisions

- **D1 (Invoice Follow-Up History & Settlement):** Store follow-ups as an array (`followUps: [...]`) on the invoice JSON payload. Display past follow-ups in an expandable accordion with receipt thumbnails. Recording a payment nominal generates an `sppPayments` row with `sumberDana: 'sekolah'`, reducing `settlement.sisa` and displaying the unpaid amount in red text. `carryOverLines()` carries the remainder forward to the next period.
- **D2 (Harga Satuan Defense):** Use multi-tiered fallback: `it.hargaSatuan ?? it.tarifPerPertemuan ?? invoice.hargaSatuan ?? sekolah.spp ?? 0`. Guard `formatRupiah()` to return `"Rp 0"` whenever an input is not a finite number.
- **D3 (School Operational Isolation):** Add `status: 'Aktif' | 'Non-Aktif'` to school records, defaulting to `'Aktif'`. Filter inactive schools from active views, student registration dropdowns, timetable creation, and automated invoice generators.
- **D4 (Authenticated Change Password):** Add `"Ubah Kata Sandi"` to `AccountMenu.jsx` for Superadmin and Admin Cabang, calling `/api/auth/change-password.php`.
- **D5 (Forgot Password via SMTP):** Add `email`, `reset_token_hash`, and `reset_token_expires_at` to `users`. Provide `server/config.smtp.example.php` and `server/lib/mailer.php`. Issue 32-byte secure tokens with 1-hour expiration.

---

## 3. Global Rules

- **R1:** UI copy and dialog buttons are strictly in Indonesian (`Simpan`, `Batal`, `Ubah Kata Sandi`, `Lupa kata sandi?`, `Aktif`, `Non-Aktif`).
- **R2:** All currency fields store plain numeric values; formatted for display via `formatRupiah()`.
- **R3:** Non-destructive data migration: legacy rows without `status`, `email`, or `followUps` work seamlessly without data patches.
- **R4:** Scoped privileges: `admin_cabang` is authorized to record follow-up and upload receipts for schools in their own `cabangId`.
- **R5:** Zero new external runtime dependencies.
- **R6:** Each milestone has an explicit VERIFY command and observable OUTCOME.


---

## 4. Execution & Verification Signoff

All microtasks E3.1 through E3.9 have been implemented and independently verified under subagent-driven development:

| Milestone | Scope | Commits | Test Suite Status | Build Status |
|:---|:---|:---|:---|:---|
| **E3.1** | Fix "Harga Satuan" `NaN` bug & guard `formatRupiah` | `b87c563` | 11/11 pass | Clean |
| **E3.2** | School status "Aktif" & "Non-Aktif" operational isolation | `eb04beb` | 5/5 pass | Clean |
| **E3.3** | Authenticated Change Password modal in profile menu | `5db34f8` | 7/7 pass | Clean |
| **E3.4** | Users email migration, SMTP config template, & socket mailer | `dd4ef66`, `df04c03` | 5/5 contract pass | Clean |
| **E3.5** | Forgot & reset password backend API with 1h expiration | `25953af` | 12/12 lifecycle pass | Clean |
| **E3.6** | Forgot password modal, reset page, & user email admin UI | `c6a5b46` | 9/9 pass | Clean |
| **E3.7** | Multi-entry invoice follow-up accordion & receipt uploads | `99c2db8` | 16/16 pass | Clean |
| **E3.8** | Follow-up payment ledger integration, cash revenue, & carry-over | `ed21019` | 7/7 pass | Clean |
| **E3.9** | Full regression suite & production build verification | Final | 330/330 unit tests pass, 18/18 server suites pass | 5.02s clean build |

All requirements delivered with zero breaking changes and zero external runtime dependencies.
