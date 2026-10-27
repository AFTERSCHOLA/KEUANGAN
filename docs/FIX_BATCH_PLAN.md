# Fix Batch Plan — 8 findings, severity order

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 reported findings on test-stage without breaking server RBAC or print parity.

**Architecture:** Smallest-slice frontend edits mirroring existing idioms (`initialPasswordDialog`, `Riwayat (N)`, `printable-report`), one server disclosure tweak for lockout, no new deps.

**Tech Stack:** React + Vite + Tailwind, PHP MySQL API, Playwright E2E.

**Spec:** This file + `docs/FIX_BATCH_MILESTONES.md` (microtasks M-F1..M-F8). Source evidence from 2026-10-27 audit.

## Global Constraints

- Indonesian copy preserved: `Batal / Simpan / Hapus / Cetak Invoice / Kembali / Dokumen Resmi / Hanya yang menunggak / Saya sudah catat, tutup`.
- Server RBAC is authoritative (`server/auth/authorize.php`, `server/api/users.php:385` gate); frontend gates are courtesy only.
- `sppPayments` / honor ledgers append-only; never inline-edit.
- No `console.log` in `src/`; `git status` clean of artifacts.
- Money: input plain digits, display `formatRupiah` (`150000` -> `150.000`).

## Review Focus

- Lockout vs wrong-password share `401 Nama pengguna atau kata sandi salah` — disclosure must not enumerate users.
- `admin_cabang` reset must never escape own `cabangId` / non-trainer roles (`users.php:385`).
- CSV `;` change must keep BOM + quoting, all 9 exports byte-compatible except delimiter.
- Print CSS must not break `.raport-sheet` fixed `794x1122` layout (`print.css:60-118`).
- Search/group must preserve `Riwayat (N)` expand + `Hanya yang menunggak` pill math.

---

## 1. Scope and boundary

Covers 8 findings from 2026-10-27 report. Excludes new business capability, server PDF generation, `xlsx` library.

## 2. Triage vs docs (taste #30, #31, #68)

| ID | Finding | Status | Where |
|----|---------|--------|-------|
| F1 | Password 2nd-login both-old-and-new 401 | Root: `login_attempts` throttle, identical 401 hides lock | `server/api/auth/login.php:11-12`, `server/auth/session.php:293-313` |
| F2 | No Admin Cabang Edit/Forgot for Trainer | Backend ready, no UI | `server/api/users.php:372-403`, `src/features/trainers/TrainerList.jsx:60-100` |
| F3 | Invoice missing footer logo + Afterschola | Top logo only | `src/features/reports/InvoiceTemplate.jsx:88-103`, `server/lib/invoiceDoc.php:278-284`, `public/invoice/logo.png` exists |
| F4 | Data Siswa no grouping/search | Only `Hanya yang menunggak` | `src/features/students/StudentList.jsx:309-320` |
| F5 | Login no show/hide | `type=password` static | `src/features/auth/LoginPage.jsx:87-96`, `MustChangePasswordPage.jsx:82-124` |
| F6 | Print breaks to 2 pages | Only `@page{margin:1.5cm}`, no break rules | `src/print.css:10-52`, `InvoiceTemplate.jsx:163-178` |
| F7 | Trainer Jadwal wall of text | `join(', ')` in one slot | `TrainerList.jsx:14-21,417-421` |
| F8 | CSV comma-string in Excel ID | `join(",")`, Excel ID expects `;` | `src/lib/csv.js:10-28` |

Already planned? None in `PRODUCTION_PLAN` / `SCOPE_EXPANSION_PLAN` / `AUDIT_FOLLOWUP_PLAN`. All new microtasks M-F1..M-F8.

## 3. Decisions

- **D1 — No disclosure, clear on change/reset:** keep 5-fails/15-min (`session.php:311`) AND the generic 401 on every branch — the throttle matrix (AA.B.2/D-AA6) forbids lock-state signals as enumeration oracles, and the spec wins. Fix = clear `login_attempts` on `change-password` + `reset_password` so the new password works immediately, plus diagnostics SQL. Residual cross-IP locks expire in <=15 min; per YAGNI no backoff, no schema change.
- **D2 — Reset reuses `initialPasswordDialog` idiom:** `TrainerList.jsx:452-509` copy, `writeRemote('users',{action:'reset'})`.
- **D3 — Footer mirrors header logo:** `h-8` + `Afterschola` bold, both client + `invoiceDoc.php`.
- **D4 — Search/groups client-only:** filter `nama/kelas/sekolahNama/wa`, group by `Sekolah Mitra/Status/Tingkat`, headers with counts.
- **D5 — CSV `;` delimiter:** keep BOM + quoting, all 9 exports via `downloadCSV`.
- **D6 — Print prefers `Dokumen Resmi`:** client fallback gets `thead` repeat + `tr avoid-break` + settlement `avoid-break`.

## 4. Rules

- **R1 — Server authoritative:** backend 403/401 wins; frontend never widens scope.
- **R2 — Mirror idiom, do not invent:** `initialPasswordDialog`, `Riwayat (N)`, `printable-report`, `formatRupiah`.
- **R3 — TDD red-green per task, narrowest check first, full suite + `npm run build` before done.**
