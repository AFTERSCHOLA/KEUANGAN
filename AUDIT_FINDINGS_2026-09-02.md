# Audit Findings — 2026-09-02

Per taste rule #45, findings are ordered by severity. Each finding cites the
specific file:line or live DOM snapshot. The audit was driven by two
exploratory Playwright specs (`tests/audit-crud-styling.spec.js`,
`tests/audit2-crud-deep.spec.js`) that are filtered out of CI by
`playwright.config.js#testIgnore` (taste rule #34).

## P1 — Broken behavior / privilege drift

### P1.1 Sidebar active-item color clashes with the rest of the palette
- **Where**: `src/components/SidebarLayout.jsx` — active tab uses an amber/yellow background (`bg-amber-400`/`bg-yellow-400`).
- **Evidence**: `audit2-tab-Overview.png`, `audit2-tab-Data-Sekolah.png`, `audit2-tab-Data-Cabang.png` — every active sidebar item is highlighted yellow while every other accent (buttons, account avatar, links) is blue. The dual-color active state reads as a UI defect, not a feature.
- **Fix**: change `bg-yellow-400` (or `bg-amber-400`) on the active nav button to `bg-blue-600 text-white` (matching the rest of the app's primary accent).

### P1.2 School card image is broken / never renders
- **Where**: `src/features/schools/SchoolList.jsx` — every card has a top image placeholder (broken-image icon visible on all 12 cards in the audit screenshot).
- **Evidence**: `audit2-tab-Data-Sekolah.png` — every card shows the alt text "SD ..." with a broken-image glyph and a tall empty gray rectangle below.
- **Fix**: either (a) make the photo field optional in the Sekolah factory + SchoolList card, and hide the `<img>` when no `fotoUrl` is set, or (b) ship a default placeholder image asset.

### P1.3 Data Absensi page renders the title twice
- **Where**: `src/features/attendance/index.jsx` (or its wrapper).
- **Evidence**: `audit2-tab-Data-Absensi.png` — "Lembar Absensi Harian Kelas" appears as both the top H1 card and an H2 card directly below it.
- **Fix**: remove the duplicated `<h2>Lembar Absensi Harian Kelas</h2>` sub-card or merge it into the top H1.

### P1.4 Branch creation requires Admin Cabang fields; no "branch without admin" path
- **Where**: `src/features/admin/BranchManager.jsx:119-152` — the `createAdminAccount` checkbox defaults to `true` and is required before submit; the audit's first Cabang-create attempt failed silently with "Nama Admin Cabang wajib diisi untuk membuat akun login" until I filled the Admin fields.
- **Evidence**: AUDIT2 Cabang create run #1 returned `visible=0` (no card after save); run #2 with admin fields filled returned `visible=1`.
- **Fix**: change `createAdminAccount` default to `false`, OR allow save to proceed with a clear error message ("Uncheck 'Buat akun Admin Cabang' to create a branch without one").

## P2 — UX polish / consistency

### P2.1 Export buttons on Data Keuangan use green while the rest of the app uses blue
- **Where**: `src/features/reports/FinanceReport.jsx` — "Cetak Laporan" + the six CSV export chips (`Sekolah`, `Siswa`, `Trainer`, `Absensi`, `Pembayaran`, `Ringkasan`) all use emerald/green.
- **Evidence**: `audit2-tab-Data-Keuangan.png` — top button is green, all export chips are green, vs the rest of the app's blue accent.
- **Fix**: switch the export-chip palette to blue (`bg-blue-600 hover:bg-blue-700`) for visual consistency.

### P2.2 `Umur Piutang` table has no per-school drill-down
- **Where**: `src/features/reports/AgingReport.jsx` — the table lists `SEKOLAH / BULAN INI / 1 BULAN / 2+ BULAN / TOTAL PIUTANG` but the school row is static text, not clickable.
- **Evidence**: `audit2-tab-Umur-Piutang.png` — three rows shown, no interaction affordance.
- **Fix (future)**: clicking the school row should open a per-student tunggakan detail; defer per scope.

## P3 — Misc styling / minor

### P3.1 Data Trainer card actions are sparse for superadmin
- **Where**: `src/features/trainers/TrainerList.jsx:36-37` — superadmin sees Edit (because of `canEditTrainers`) but no Delete (because of `canCreateOrDeleteTrainers`); the top-right corner shows a lone caret-like icon.
- **Evidence**: `audit2-tab-Data-Trainer.png` — three trainer cards, each with a single tiny icon at top-right and no visible Hapus button.
- **Status**: by design per privilege matrix; the icon is likely the Edit pencil. No fix needed if the Edit pencil is intentional; the screenshot looks ambiguous because the icon has no `title` attribute surfacing the affordance.

### P3.2 Inconsistent button shapes across tabs
- **Where**: most tabs use `rounded-xl` with `px-5 py-2.5`; some use `rounded-lg px-3 py-2` (AccountMenu submenu items, Backup/Restore card actions). Not a defect — visual hierarchy is intentional — but worth a sweep if a unified button spec is desired.

## Verified CRUD functionality (no defects)

The following flows were driven end-to-end against the live PHP + Vite
stack and **passed**:

| Tab | Surface | Operation | Result |
| --- | --- | --- | --- |
| Data Sekolah | Card CRUD | Create "SD Audit Sim" → card visible | ✅ |
| Data Sekolah | Card CRUD | Edit modal → rename → card updated | ✅ |
| Data Sekolah | Card CRUD | Delete confirm dialog → card removed | ✅ |
| Data Cabang | Modal form | Create "Cabang Audit Sim" (with Admin account) → card visible | ✅ |
| Data Absensi | Form | Date / Sekolah / Trainer / Asisten / Catatan / Foto fields render | ✅ |
| Data Keuangan | Period toggle | "Periode Tunggal / Rentang Kustom / Semester / Tahun Ajaran" all render | ✅ |
| Data Pembayaran | Bayar Manual + Lunaskan buttons | Render correctly with current period data | ✅ |
| Data Siswa | Tambah Siswa Baru | Modal opens, 8 form fields render | ✅ |
| Data Trainer (admin_cabang) | Tambah Trainer Baru | Modal opens, 6 form fields render | ✅ |
| admin_cabang nav | Data Cabang hidden | Correct privilege boundary | ✅ |
| trainer nav | 4 nav buttons (Absensi, Riwayat, Siswa, Rekap Saya) | Correct scope | ✅ |
| trainer Data Siswa | Tambah Siswa Baru hidden | Read-only enforced | ✅ |
| trainer Rekap Saya | Heading "Rekap Saya" visible on direct load | ✅ |

## Privilege matrix sanity check

| Role | Nav tabs | Can create sekolah | Can create trainer | Can create siswa | Sees Data Cabang |
| --- | --- | --- | --- | --- | --- |
| superadmin | 10 (incl. Data Cabang) | ✅ | ❌ (correct — Branch Admin creates trainers) | ✅ | ✅ |
| admin_cabang | 9 (no Data Cabang) | ✅ | ✅ | ✅ | ❌ |
| trainer | 4 (Absensi, Riwayat, Siswa, Rekap Saya) | ❌ | ❌ | ❌ (read-only Siswa) | ❌ |

The superadmin "no trainer create" rule matches the user's directive —
Branch Admin owns trainer onboarding; superadmin only edits existing
records. This is by design, not a defect.