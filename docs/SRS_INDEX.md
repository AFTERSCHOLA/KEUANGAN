# SRS Index — Synthesized from Code + Docs (Read-Only, No Fixes)

**Goal:** One `docs/SRS_INDEX.md` that indexes what the system *does* (FR), how well (NFR), and under what rules (C), with drift/bugs recorded only.

**Falsifiable check:** Every live entity (`cabang,sekolah,siswa,trainer,absensi,absensiPengajar,sppPayments,honorPayments,invoices,settings,users`) + every `server/api/*.php` endpoint + every role (`superadmin,admin_cabang,trainer`) maps to ≥1 row below; `git status --porcelain src/ server/` stays clean (index-only).

**Sources treated as SRS (user pick: synthesize):** `src/**/*`, `server/**/*`, `docs/SCOPE_EXPANSION_PLAN.md`, `docs/SCOPE_EXPANSION_PRIVILEGES.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/UNIVERSAL.md`.
**Method (taste #13, #44, #59, #61, #68):** frontend + backend inventories grounded in `file:line`; server-side validation is authoritative; UI gaps reported separately, never double-counted; drift recorded, not patched.
**ID conventions:** `FR-#` functional, `NFR-#` non-functional, `C-#` constraint/rule, `DRIFT-#` record-only anomaly, `AMB-#` open ambiguity. Matches `docs/` single-file style per taste #69 (short doc task → one file under `docs/`).

---

## 1. Functional Requirements (FR)

### 1.1 Auth, roles, shell

| ID | Requirement | UI evidence | Server evidence (authoritative) | Status |
|----|-------------|-------------|---------------------------------|--------|
| FR-01 | Cookie-session login `{username,password}`, 5-fail lockout, 12-char policy, CSRF on POST, `mustChangePassword` gate | `src/features/auth/LoginPage.jsx:11-30,56-110`, `src/features/auth/MustChangePasswordPage.jsx:20-48`, `src/App.jsx:236-256`, `src/lib/auth.js:91-152` | `server/api/auth/login.php:5-44`, `server/auth/session.php:4-10,38-81,123-145,187-190` | ✅ solved |
| FR-02 | Role split: `superadmin` (all + `Data Cabang` tab), `admin_cabang` (base tabs), `trainer` (`TRAINER_TABS[6]`, default `rekap`) | `src/App.jsx:33-55,95-102,221-227,258,336-349`, `src/lib/role.js:4-30` | `server/auth/authorize.php:4-20,150-216` | ✅ solved (UI mirror + server enforce) |
| FR-03 | Trainer landing `Rekap Saya`: today schedule + pending + own honor summary | `src/features/auth/TrainerDashboard.jsx:8-57,59-106` | Derived via `financialData` + assignment reads (no dedicated endpoint) | ✅ solved UI; backend = filtered reads |
| FR-04 | Persist UI state `{activeTab,sidebarCollapsed,selectedYear/Month,selectedCabangId}` | `src/lib/store.js:34,538-550,561-618`, `src/App.jsx:143-144,201-213` | N/A (client-only) | ✅ solved |
| FR-05 | User provisioning: branch onboarding creates `admin_cabang`; trainer onboarding creates `trainer` + one-time password dialog | `src/features/admin/BranchManager.jsx:95-175,406-482`, `src/features/trainers/TrainerList.jsx:40-48,105-154,387-441` | `server/api/users.php:31-50,58-80` (admin_cabang→own-branch trainers only) | ✅ solved |

### 1.2 Cabang / Sekolah / Siswa / Trainer CRUD

| ID | Requirement | UI evidence | Server evidence | Status |
|----|-------------|-------------|-----------------|--------|
| FR-06 | `cabang` CRUD (superadmin-only UI), assign schools, guards (default seed + non-empty undeletable) | `src/features/admin/BranchManager.jsx:177-191,235-241,258-306,484-506` | `server/schema.sql:1-11`, `server/api/cabang.php:18,34,175-181`, `server/validation/entities.php:89-98` | ✅ solved |
| FR-07 | `sekolah` card grid + `SchoolForm{cabangId,nama,alamat,foto,fotoEntry,jadwalList[],spp,metodePembayaran{...}}`, validations (`nama` non-empty, `cabangId` resolves, `endTime>time`) | `src/features/schools/SchoolList.jsx:99-128,307-357,408-808` | `server/schema.sql:118-126` (`cabang_id NOT NULL`), `server/api/_master.php:37-236` | ✅ solved |
| FR-08 | School delete with reassign flow; rename syncs `siswa.sekolahNama` locally | `src/features/schools/SchoolList.jsx:166-176,182-240,839-862` | `server/api/sekolah.php:179,205-206` (optimistic `version` 409) | 🟡 partial — local sync only, see DRIFT-09 |
| FR-09 | `siswa` table + `SiswaForm{nama,kelas,wa→normalize,sekolahId,status Trial/Aktif/Berhenti,trialMulai,sppLunas pills}`, WA tagihan link, `SppPaymentModal` entry | `src/features/students/StudentList.jsx:232-477,532-708,517-527`, `src/lib/format.js:14-26` | `server/schema.sql:138-146`, `server/validation/entities.php:223-253` | ✅ solved UI; backend validates `status∈{Aktif,Trial,Berhenti}` |
| FR-10 | Student delete nullifies `absensi.siswaList[].siswaId`, leaves `sppPayments` untouched | `src/features/students/StudentList.jsx:122-134` | No cascade endpoint | 🟡 partial — ledger append-only by design (C-04) |
| FR-11 | `trainer` cards + `TrainerForm{nama,wa,honor(RupiahInput),sekolahIds[],createAccount,username}`, `canEdit=admin_cabang\|superadmin`, `canCreateOrDelete=admin_cabang only` | `src/features/trainers/TrainerList.jsx:14-21,54-55,284-345,449-526` | `server/schema.sql:128-136`, `server/validation/entities.php:100-221` (`tipePengajar∈{instruktur,asisten}`, `penugasanPengajar[]` branch-match) | ✅ solved (see DRIFT-10 for superadmin-create nuance) |
| FR-12 | Branch-prefixed IDs `prefix-BRANCH-Date.now()-rand7` (`cbg/skl/trn/sw/pay/spp/inv`), default `cbg-PST-default` | `src/lib/constants.js:18-32` | `server/lib/backupRestore.php:68`, `server/bin/create-superadmin.php:61` (`usr-hex24`, `bkp-*`, photo `hex32.ext`) | ✅ solved |

### 1.3 Absensi (kegiatan `absensi` = legacy, `absensiPengajar` = new)

| ID | Requirement | UI evidence | Server evidence | Status |
|----|-------------|-------------|-----------------|--------|
| FR-13 | Kegiatan form `{tanggal,sekolahId,trainerId,asistenId,trainerStatus,siswaStatus,catatan,fotoKehadiran,fotoKegiatan}` + tap-toggle + `QuickSession{Semua Hadir}` + invoice-lock + quota warnings | `src/features/attendance/AttendanceForm.jsx:12-26,83-142,184-276`, `src/features/attendance/QuickSession.jsx:1-25`, `src/features/attendance/index.jsx:26-44` | `server/schema.sql:61-70`, `server/api/absensi.php:10-46`, `server/validation/entities.php:255-269` | ✅ solved |
| FR-14 | `RiwayatAbsensi`: exception queue (`buildReviewQueue`: no-photo, >20% deviation, first-appearance, edited-after-verify + weekly sample) vs all; verify (`canVerify`) + `Muat untuk Koreksi` | `src/features/attendance/RiwayatAbsensi.jsx:38-69,100-168`, `src/lib/attendance.js:38-95` | `authorize()` verify path `server/auth/authorize.php:179,185-187` | ✅ solved |
| FR-15 | Trainer own legacy history + photos + weekly `konfirmasiTrainer` self-certification | `src/features/attendance/TrainerHistory.jsx:16-47,49-123` | `authorize()` certify own `trainerId` `server/auth/authorize.php:193-194` | ✅ solved |
| FR-16 | Pengajar self-input `{tanggal,sekolahId(assignments only),status Hadir/Izin/Alpa,keterangan EXPO/Pengganti/Lainnya,catatan}` + own summary matrix | `src/features/attendance/TrainerAttendanceForm.jsx:15-80,93-167`, `src/features/attendance/TrainerAttendanceSummary.jsx:13-27,33-104`, `src/lib/trainerAttendance.js:22-80` | `server/schema.sql:72-83`, `server/api/absensiPengajar.php:16-85`, `server/validation/entities.php:271-309` | ✅ solved |
| FR-17 | Pengajar admin view `Daftar\|Rekap Matriks (sekolah×days)` + correction modal via `correctLedgerEntry(correctionOf)` | `src/features/attendance/TrainerAttendanceAdminView.jsx:13-50`, `src/features/attendance/TrainerAttendanceAdmin.jsx:72-132,212-278`, `src/features/attendance/TrainerAttendanceRecap.jsx:22-95` | `server/migrations/2026-09-22-absensi-pengajar-schema.sql:35-43`, `2026-09-23-absensi-pengajar-correction.sql`, see DRIFT-03 | 🟡 partial — see DRIFT-03 (`sync.php` drops `absensiPengajar.correction_of`) |

### 1.4 Payments, invoices, reports

| ID | Requirement | UI evidence | Server evidence | Status |
|----|-------------|-------------|-----------------|--------|
| FR-18 | Honor table per-trainer `{hadirSesi,tarif,bebanHonor,dibayar,sisaHonor}` + `Lunaskan` + manual `{nominal,tanggalBayar}` + overpay confirm + history `SlipHonor` + delete via negative correction | `src/features/payments/PaymentTable.jsx:50-141,162-293,59-93` | `server/schema.sql:96-107`, `server/api/honorPayments.php:7-33`, `server/validation/entities.php:311-318` | ✅ solved |
| FR-19 | SPP collect modal `{periode,nominal,tanggal,metode[Tunai-Sekolah/Trainer/Admin/Transfer],sumberDana[sekolah/ortu],diterimaOleh,bukti}` → ledger + `recomputeSppLunas` | `src/features/payments/SppPaymentModal.jsx:16-115`, `src/lib/sppPayments.js:6-97` | `server/schema.sql:85-94`, `server/api/sppPayments.php:7-12`, `server/validation/entities.php:320-356` | ✅ solved |
| FR-20 | SPP status derived `GET ?periode → [{siswaId,sekolahId,periode,status,dibayar,total,sisa}]` (no raw invoice leak) | `src/features/students/StudentList.jsx:27,46-50` (via `isTunggakan/elapsedPeriods`) | `server/api/spp-status.php:29-244` | ✅ solved (backend authoritative) |
| FR-21 | Invoice per school: `InvoiceModal{mode bulanan/semester,...}` + history `{Cetak,Hapus}` + `InvoiceTemplate` printable + server doc fallback | `src/features/reports/InvoiceModal.jsx:29-40,138-254`, `src/features/reports/InvoiceTemplate.jsx:66-178`, `src/lib/invoices.js:30-60,130-169,388-421`, `src/lib/terbilang.js:18-23` | `server/schema.sql:148-156`, `server/api/invoices.php:7-100`, `server/api/invoices-generate.php:8-16`, `server/api/invoices-doc.php:21-68`, `server/lib/invoiceGenerator.php:45-80` (`nomor BRANCH-YYYYMM-SEQ`) | ✅ solved |
| FR-22 | FinanceReport modes `tunggal\|rentang\|semester\|tahunAjaran`, 8-tile cash/memo, period comparison (Δ vs prev month/year), per-sekolah/per-trainer breakdown | `src/features/reports/FinanceReport.jsx:66-135,147-429` | `financialData()` client aggregation (no dedicated endpoint) | ✅ solved UI; backend = raw reads |
| FR-23 | Overview cards `{pemasukanSpp(kas),bebanHonor(memo),dibayar(kas),labaRugi(kas)}` + SVG charts + `ExecutiveSummary{labaRugi,kolektibilitas,3 red flags}` | `src/features/overview/OverviewCards.jsx:21-37,78-131,207-349`, `src/features/reports/ExecutiveSummary.jsx:50-133` | Same — client aggregation over `read.php` | ✅ solved |
| FR-24 | Aging `computeAging → buckets {bulanIni,1 bulan,2+}`, `sumberDana` from `sekolah.metodePembayaran`, per-sekolah + footer totals | `src/features/reports/AgingReport.jsx:21-58,96-146` | Client-only (reads + `elapsedPeriods` `src/lib/tunggakan.js:14-28`) | ✅ solved |
| FR-25 | Export hub: 6 CSVs from FinanceReport + per-report CSV + print (`window.print`, `.printable-report`, `@page 1.5cm`) + `SlipHonor` printable | `src/features/reports/FinanceReport.jsx:335-343`, `src/lib/csv.js:10-119`, `src/components/PrintButton.jsx:7-22`, `src/print.css:10-52`, `src/features/reports/SlipHonor.jsx:10-68` | `POST /api/invoices-doc.php → blob` fallback `src/lib/invoices.js:388-421` | ✅ solved |
| FR-26 | Backup JSON `{version,exportedAt,data}` + `v4-import dryRun/commit` (superadmin); server snapshot + full-replace restore transaction | `src/lib/backup.js:7-71,81-172`, `src/components/BackupRestorePanel.jsx:17-284` | `server/lib/backupRestore.php:12-161`, `server/api/backup-*.php`, `server/api/restore.php:8-14`, `server/api/v4-import.php:10,44` | 🟡 partial — see DRIFT-05 (both omit `absensiPengajar`) |
| FR-27 | Photos outside localStorage: IDB bytes only, pointers `{idb\|server}`, 500KB cap + 4MB warn, `photo-upload/download`, `logo-upload/download/current` | `src/lib/photoStorage.js:1-13,59-306`, `src/components/PhotoSlot.jsx:5-100` | `server/lib/photoStore.php:16-56`, `server/api/photo-*.php`, `server/api/logo-*.php`, `server/schema.sql:184-194`, `server/validation/entities.php:30-39` (200KB payload limit) | ✅ solved |
| FR-28 | Settings modal `{logoUrl/logoEntry,title,alamatUsaha,rekeningBank/Nomor/AtasNama,penandatangan}` superadmin-write, others read-only | `src/components/SettingsModal.jsx:14-133` | `server/schema.sql:158-165`, `server/api/settings.php:7-96` (`manage_settings` gate) | ✅ solved |

---

## 2. Non-Functional Requirements (NFR)

| ID | Category | Requirement (as built) | Evidence | Status |
|----|----------|------------------------|----------|--------|
| NFR-01 | Security/authz | Server is authority: `authorize()` (superadmin bypass; deny-list `restore,manage_users,manage_branch,manage_settings,manage_backup,edit_tarif,write_honor_payment,settle_honor`; branch scoping; trainer-own + date-bounded assignment). Client is filter-only (`isWithinScope`, `prepareWritePayload` strips `cabangId`, `filterEntitiesByBranch`). UI hides, server 403s. | `server/auth/authorize.php:22-33,57-94,111-216`, `src/lib/store.js:40-61,95-137,188-341`, `src/lib/branchScope.js:1-25`, `docs/SCOPE_EXPANSION_PRIVILEGES.md:119-126` | ✅ enforced |
| NFR-02 | Security/credentials | No prod defaults; test-only seeds; CLI refuses if superadmin exists; 12-char mixed policy; lockout 5→15min; generic 401; HttpOnly/Lax/secure session (1800s idle, 28800s absolute) + 32B CSRF | `server/tests/db-reset.php:113-154`, `server/bin/create-superadmin.php:12-61`, `server/auth/session.php:4-10,38-81,123-145,187-190` | ✅ enforced |
| NFR-03 | Data integrity | Append-only ledgers (`honorPayments`, `sppPayments` via `upsert+queueSync`); corrections via `correction_of` negative entries, not inline edits; optimistic `version` 409 on master writes | `src/lib/sppPayments.js:65-68`, `src/lib/constants.js:279-295`, `server/api/_master.php:114-120`, `server/api/absensiPengajar.php:52-64` | ✅ enforced (see DRIFT-03 gap) |
| NFR-04 | Storage hygiene | Photos never in `localStorage`/payload; MySQL source of truth; `localStorage afterschola_v4_*` offline cache; IDB photo bytes; payload 200KB cap | `src/lib/store.js:139-163,195-233`, `src/lib/photoStorage.js:4,239-295`, `server/validation/entities.php:30-39` | ✅ enforced |
| NFR-05 | Usability/i18n | Indonesian copy (`Batal/Lanjutkan/Hapus/Simpan/OK`, `wajib diisi`, `Nama sekolah tidak boleh kosong`); Rupiah inputs plain-digit entry → `150.000` display, numeric storage; shared `inputClass/labelClass/selectClass`, `RupiahInput`, `PhotoSlot`, `AppModal/AlertDialog/ConfirmDialog` | `src/lib/ui.js:7-14`, `src/components/RupiahInput.jsx:15-62`, taste `taste.md:16,18` | ✅ enforced |
| NFR-06 | Reporting fidelity | Cash-basis (D1 kept): `pemasukanSpp(kas)`, `bebanHonor(memo)`, `dibayar(kas)`, `labaRugi(kas)` labeled; invoice preview `sekolah.spp×bulan` explicitly estimate, server recomputes per-`sppOverride` | `src/features/overview/OverviewCards.jsx:108-131`, `src/features/reports/FinanceReport.jsx:73-113`, `src/features/reports/InvoiceModal.jsx:16-27,47-52`, `docs/SCOPE_EXPANSION_PLAN.md:157-164` | ✅ enforced |
| NFR-07 | Academic time | Engine `MONTHS Jul→Jun`, `periodeKey YYYY-MM`, `shiftPeriode`, `elapsedPeriods`; UI `PeriodFilter{Tahun Ajaran,Bulan}` | `src/lib/constants.js:1-11,379-419`, `src/lib/tunggakan.js:14-28`, `src/components/PeriodFilter.jsx:7-48` | ✅ enforced |
| NFR-08 | Operability | One-command local: `npm run setup` (Node≥18, PHP 8.2+ `pdo_mysql,mbstring,json`, XAMPP candidates), `php -S 127.0.0.1:8000 -t server` + `npm run dev` (5173, `/api→8000` proxy), `VITE_AUTH_MODE=production` | `scripts/setup-local.mjs:38-50,160-197,313-336`, `scripts/start-php-server.bat:1`, `vite.config.js:36-43`, `server/config.php:27-32` | ✅ enforced |
| NFR-09 | Maintainability | Factory functions + sparse maps + ID-join discipline; branch scope helpers; `billingForSekolah` standalone (not wired into `financialData` — intentional split, see DRIFT-07) | `src/lib/constants.js:24-114`, `src/lib/finance.js:189-228`, `src/lib/store.js:95-137` | ✅ enforced |
| NFR-10 | Portability | Tailwind v4 tokens + `print.css` (`@page 1.5cm`, `.printable-report`/`.no-print`); server doc endpoint returns standalone HTML for PDF | `src/index.css:11-32,40-81`, `src/print.css:10-52`, `server/api/invoices-doc.php:21-68` | ✅ enforced |
| NFR-11 | Testability (planned gate) | Unit tests mandatory for pure `finance.js,tunggakan.js,constants.js,backup.js` before new features touch them (SCOPE_EXPANSION_PLAN Part 5 revision) | `docs/SCOPE_EXPANSION_PLAN.md:150-155` | ❌ not solved — no `*.test.*` gate found in `src/lib/` (record-only) |
| NFR-12 | Source hygiene | No `console.log` in `src/`, `git status` clean of artifacts at handoff | taste `taste.md:20` | 🟡 process gate — verify per change |

---

## 3. Constraints / Business Rules (C)

| ID | Rule | Source |
|----|------|--------|
| C-01 | Cash-basis accounting (D1) + append-only ledger (D3) + academic year Jul→Jun (D4) survive unchanged | `docs/SCOPE_EXPANSION_PLAN.md:157-164` |
| C-02 | Privilege: a role may only write what it is answerable for; write flows downhill only (pusat defines structure, cabang fills events, nobody edits sideways) | `docs/SCOPE_EXPANSION_PRIVILEGES.md:8-15`, enforced `server/auth/authorize.php:150-216` |
| C-03 | `cabang` create/edit/disable, global settings, tarif/contract terms (`trainer.honor`, `sekolah.spp`, `sppOverride`), `honorPayments` write, `restore` → superadmin-only | `docs/SCOPE_EXPANSION_PRIVILEGES.md:45-51,63-80`, `server/auth/authorize.php:157-177` |
| C-04 | Ledgers stay append-only; no inline editing of payment rows (correction entries only) | `server/api/honorPayments.php:7-33`, `server/api/absensiPengajar.php:52-64`, taste evaluation rule |
| C-05 | Photos never in `localStorage`; >100KB → IDB or server; payload cap 200KB | `docs/SCOPE_EXPANSION_PLAN.md:150-155`, `server/validation/entities.php:30-39` |
| C-06 | Branch-prefixed IDs irreversible — decide before first multi-branch deployment | `docs/SCOPE_EXPANSION_PLAN.md:304-307`, `src/lib/constants.js:18-22` |
| C-07 | Verification is tiered (photo at capture + save-time count prompt + trainer weekly self-cert + Head exception-queue + random sample; paper retained 1 academic year; no OCR/models) — not review-everything | `docs/SCOPE_EXPANSION_PLAN.md:46,70,124` |
| C-08 | Trial billing rule OPEN (Option A free vs Option B back-billed) — blocks trial release (M5.4 gate) | `docs/SCOPE_EXPANSION_PLAN.md:133-141,275` |
| C-09 | Deferred (not in Phase A–C scope unless milestone starts): email password reset (P1), realtime/websocket (P2), soft-delete/trash (P3), branch honor matrix w/o business case (P4), prototype cleanup (visual gate) | `docs/SCOPE_EXPANSION_PLAN.md:266-278` |
| C-10 | Explicit non-goals for first release: JWT/signed-header/`.htaccess` per-branch, Firebase/`afterschola_v3_*`/prototype creds/Node prod backend | `docs/SCOPE_EXPANSION_PLAN.md:277-278` |
| C-11 | Blocked prerequisite: cPanel access/capability (D7.1 → D7.2–D8.3); server-first storage required for multi-branch; child PII must not live per-browser | `docs/SCOPE_EXPANSION_PLAN.md:148-155,276` |
| C-12 | `siswa` must carry `cabangId == sekolah.cabangId` (`cabang_id NOT NULL`); factory gap documented server-side | `server/schema.sql:138-146`, `server/validation/entities.php:20-28,223-253` |
| C-13 | `absensiPengajar.cabangId` required; `status∈{Hadir,Izin,Alpa}`, `keterangan∈{EXPO,Pengganti,Lainnya}\|null`; trainer write requires active assignment (date-bounded, `periodeSelesai=null`=ongoing) | `server/validation/entities.php:271-309`, `server/auth/authorize.php:57-94,195-205` |
| C-14 | Invoice canonical: one per `YYYY-MM` per `sekolah`, groups by effective tariff, `nomor BRANCH-YYYYMM-SEQ`; delete guarded if paid | `server/lib/invoiceGenerator.php:45-80`, `server/api/invoices.php:7-100` |
| C-15 | Scope divergence is intentional: `spp-status.php` scopes trainer via `sekolah.trainerIds` while `read.php` scopes via `penugasanPengajar` — indexed as constraint to reconcile, not to patch here | `server/api/spp-status.php:59-89`, `server/api/read.php:67-120` |

---

## 4. Alignment vs Plan (taste #30/#31/#68 — verify-the-verification)

| Plan item | Indexed as | Verdict |
|-----------|------------|---------|
| Phase A A1 role split + soft-login | FR-01–FR-05, C-02 | ✅ solved (server session, no soft-login — supersedes old plan per Part 5) |
| Phase A A2–A5 attendance upgrade + tiered verification | FR-13–FR-17, C-07 | ✅ solved except DRIFT-03 |
| Phase B B1 SPP ledger, B2 slips, B3 invoices, B4 MTD/YTD/ranges, B5 aging, B6 executive | FR-18–FR-26 | ✅ solved except DRIFT-05/DRIFT-07 |
| Phase C C1–C6 branches, prefixed IDs, server-first, photos-out, unit tests, PWA | FR-06, FR-12, FR-27–FR-28, NFR-04, NFR-11 | 🟡 partial — NFR-11 (unit tests) + PWA remain `Remaining` |
| Eight-item disposition #4 trial billing | C-08 | ❌ open decision (M5.4 gate) |
| Deferred/non-goals table | C-09–C-10 | Accepted as `just a matter of time / consciously excluded` — no fix proposed (taste #31) |

---

## 5. Drift / Bug / Illogicality Ledger (record-only — taste #13, no fixes)

Ordered per taste #45 (bugs → permission/logic → redundancy → UX → additions).

| ID | Severity | Note | Evidence |
|----|----------|------|----------|
| DRIFT-01 | Bug | `deploy/api/` missing 6 live files (`absensiPengajar.php`, `invoices-doc.php`, `logo-upload/download/current.php`, `spp-status.php`): 32 vs 26 — deploy would 404 those routes | `server/api/` listing vs `deploy/api/` listing |
| DRIFT-02 | Bug | `deploy/api/validation/entities.php` diverges from canonical `server/validation/entities.php` — deployed validation may not match authoritative rules | path comparison |
| DRIFT-03 | Bug | `sync.php:51` hardcodes `correction_of` only for `honorPayments`, drops `absensiPengajar.correction_of` despite allow-listing it; canonical is `entityConfig()['hasCorrectionOf']` in `bootstrap.php:185-202,222-227` | `server/api/sync.php:32,51`, `server/bootstrap.php:185-227` |
| DRIFT-04 | Logic | Spec memory says `v5_*` keys; codebase has zero `v5_`, only `afterschola_v4*` + `afterschola-photo-*` | `src/lib/store.js:5,139-152`, `src/lib/photoStorage.js:5-16` |
| DRIFT-05 | Logic | Both backup key sets omit live `absensiPengajar` (client `ENTITY_KEYS`, server `BACKUP_ENTITY_TABLES`); client also omits `users` (by design server-side) | `src/lib/backup.js:9`, `server/lib/backupRestore.php:12-22`, `src/lib/store.js:11,24-28` |
| DRIFT-06 | Logic | `exportSiswaCSV` reads stale `sppLunas[periode]` while ledger truth is `sppPaidForPeriode` | `src/lib/csv.js:44-52`, `src/lib/tunggakan.js:34-39` |
| DRIFT-07 | Logic | `billingForSekolah` standalone, explicitly not wired into `financialData` (intentional split or drift — needs owner ruling) | `src/lib/finance.js:189-228` |
| DRIFT-08 | Permission | `spp-status.php` vs `read.php` use two trainer-scope sources (`sekolah.trainerIds` vs `penugasanPengajar`) | `server/api/spp-status.php:59-89`, `server/api/read.php:67-120` |
| DRIFT-09 | Logic | `newSiswa` factory stamps no `cabangId` while DB `NOT NULL` + validator require it (gap explicitly documented server-side) | `src/lib/constants.js:84-114`, `server/schema.sql:138-146`, `server/validation/entities.php:20-28` |
| DRIFT-10 | Permission | `TrainerList` says `superadmin create blocked` while matrix says superadmin overseer-only for trainer writes — consistent but UI/server wording differs; needs single phrasing | `src/features/trainers/TrainerList.jsx:94-116`, `docs/SCOPE_EXPANSION_PRIVILEGES.md:57` |
| DRIFT-11 | Redundancy | Trainer sees both legacy `riwayat/TrainerHistory(absensi)` and new `ringkasanPengajar/Summary(absensiPengajar)`; comments acknowledge label clash | `src/App.jsx:57-102`, `src/features/attendance/TrainerHistory.jsx:16-24` |
| DRIFT-12 | Redundancy | Vestigial `ROLE_KEY=afterschola_v4_role` (`setRole()` throws by design); `RiwayatAbsensi` uses legacy `getRole()` while store uses `getSafeIdentityContext` | `src/lib/role.js:3-26`, `src/features/attendance/RiwayatAbsensi.jsx:35,60-64` |
| DRIFT-13 | UX | `StudentList.save/doRemove` silent `forbidden/conflict` return vs `School/Trainer` `AlertDialog` — inconsistent feedback idiom | `src/features/students/StudentList.jsx:79-114`, `src/features/schools/SchoolList.jsx:133-142` |
| DRIFT-14 | UX | `InvoiceTemplate` hardcodes `/invoice/logo.png\|signature.png` + `settings.logoUrl`, ignoring `logoEntry`/IDB path used elsewhere | `src/features/reports/InvoiceTemplate.jsx:7-8,91-96`, `src/components/SidebarLayout.jsx:13-41` |
| DRIFT-15 | Logic | `AttendanceForm` builds `newAbsensi` without `cabangId` while `newAbsensiPengajar.cabangId` required and scope checks use it | `src/features/attendance/AttendanceForm.jsx:97-119`, `src/lib/constants.js:345-366`, `src/lib/store.js:109-113` |

---

## 6. Open Ambiguities (taste #60 — flagged, not silently resolved)

| ID | Ambiguity | Why it matters |
|----|-----------|----------------|
| AMB-01 | Trial conversion billing (C-08 Option A vs B) — which ledger writes happen on convert? | Changes `sppPayments`/`sppLunas` write count |
| AMB-02 | `admin_cabang` gets base `TABS` (no `cabang` tab) while `BranchManager` hard-guards `superadmin` — intended hide or missing branch-scoped branch view? | `src/App.jsx:258` vs `src/features/admin/BranchManager.jsx:235-241` |
| AMB-03 | `InvoiceModal` preview estimate vs server recompute per-`sppOverride` — is preview allowed to disagree, or must it call server preview? | `src/features/reports/InvoiceModal.jsx:16-27,47-52` |

---

## 7. Verification / Remaining (taste #26, UNIVERSAL.md §Verification Language)

- `Verified: read docs/SCOPE_EXPANSION_PLAN.md (311 lines) + SCOPE_EXPANSION_PRIVILEGES.md (154) + UNIVERSAL.md + CONFIG.md -> index sources pinned`
- `Verified: parallel frontend+backend inventory -> every entity/endpoint/role mapped to FR/NFR/C with file:line`
- `Verified: Test-Path docs/ -> exists (read directory listing, 45 entries) before writing this file`
- `Changed: docs/SRS_INDEX.md (new) only; no src/ or server/ edits per scope (taste #13)`
- `Unverified: full E2E suite + production build (not required for docs-only index; run on next code change per taste #9)`
- `Remaining: owner rulings on DRIFT-07/08/10, decisions on AMB-01..03, NFR-11 unit-test gate + PWA (Phase C carry-overs)`

---

*End of SRS Index — record-only. Fixes, if approved, go through plan-mode `PLAN + MILESTONES` per taste #69, one hypothesis per edit per taste #6.*
