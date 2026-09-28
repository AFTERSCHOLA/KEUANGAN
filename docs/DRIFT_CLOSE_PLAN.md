# Drift Close Plan — Sync-Queue Drop + D2/D3b/D4 + Full E2E

**Status:** DRAFT 2026-09-27 — Gates DC.A–DC.E open (no Verified lines yet; see `docs/DRIFT_CLOSE_MILESTONES.md`).
**Position:** Temporary scope-expansion chain per taste #40. It does **not** replace `IMPLEMENTATION_PLAN.md`, `SCOPE_EXPANSION_PLAN.md`, `SCOPE_EXPANSION_PRIVILEGES.md`, `SPP_BILLING_PLAN.md`, `COVER_SLOT_PLAN.md` / `COVER_SLOT_MILESTONES.md` (DONE 2026-09-27), `EVAL_FINANCE_PLAN.md` / `EVAL_FINANCE_MILESTONES.md`, `TRAINER_ATTENDANCE_PLAN.md`, `PENUGASAN_PLAN.md`, or `EXEMPLAR_MIGRATION.md` (ground truth, stays authoritative — the web adapts to it, never the reverse).
**Contract order:** `docs/UNIVERSAL.md` (primary contract, read first) → `docs/IMPLEMENTATION_PLAN.md` Part 2 → `docs/SCOPE_EXPANSION_PLAN.md` + `docs/SCOPE_EXPANSION_PRIVILEGES.md` → `docs/COVER_SLOT_PLAN.md` §4 (D-CS1–D-CS7) → `docs/EVAL_FINANCE_PLAN.md` §4 (D-EF1–D-EF7) → `docs/EXEMPLAR_MIGRATION.md` (G5, D2/D3, F9/F13, 2026-09-27 addendum D1–D4 drift) → this file.
**Locked inputs (not re-decided here):** D2 tiers (Senior 100k / Newbie 75k / Asisten-flat 50k); D3 per-session role on the row; Q1(a) bill school + pay substitute; Q2 dashboard follows invoice pipeline; ground-truth holes (F4/F14/Q8) carried as Ignored-for-now per 2026-09-27 user decision.

---

## 1. Context and inputs

- The trainer-attendance form already writes direct (`TrainerAttendanceForm.jsx:103` `writeRemote('absensiPengajar', …)`), and `store.js:334-341` documents the deliberate move off the manual queue — yet the E2E legs still wait for `/api/sync.php` (`trainer-attendance-form.spec.js:160-168…`, `-admin.spec.js:110-111`, `-summary.spec.js:102-103`), producing the 8-leg pre-existing failure cohort (proven identical on pristine HEAD via git-stash, CS.C.2).
- Five call sites still queue: `AttendanceForm.jsx:138` (`absensi`), `RiwayatAbsensi.jsx:67` (verify stamp), `TrainerHistory.jsx:49` (self-certify), `PaymentTable.jsx:87,121` (`honorPayments`), `sppPayments.js:66` (`sppPayments`) — all via `upsert()` → `queueSync()` (`store.js:300-315,495-501`), flushed by the `Sinkronisasi` menu item (`AccountMenu.jsx:72-78`, disabled when nothing pending) and a boot-time `syncPending()` (`App.jsx:202`).
- User decision 2026-09-27 (explicit, recorded here not silently patched): **drop the client queue entirely** — queueing is declared stupid; every write goes direct. Consequence owned openly: writes require network; offline capture is unsupported until re-planned (M7.2.1's offline goal is superseded for these entities, not silently kept).
- D3b (new app bug, found in the D1–D4 re-sweep): `TrainerAttendanceAdmin.jsx:104-113` rebuilds corrections without `peran`/`dicatatOleh` — correcting a Vazira-(A) row reprices it from 50k to her tier. Unit coverage is role-complete (9 tests green); zero E2E legs touch the `Peran sesi ini` picker.
- D2: server + union reads support `asistenIds` (D-CS4), but `PenugasanManager.jsx:518-521` offers only the single `Asisten` dropdown and `PenugasanTimetable.jsx:88` shows only `asistenId` — the 2nd assistant is API-only.
- D4: pipeline wrapper exists (`FinanceReport.jsx:86-102`, `OverviewCards.jsx:34-50`) with a unit guard, but no E2E leg proves invoice-Terbit → dashboard-moves on screen.

## 2. Goals and non-goals

**Goals**

1. Admin corrections preserve `peran`/`dicatatOleh` (D3b closed, silent repricing gone).
2. No client write queues: all five call sites go direct; `Sinkronisasi` UI + `syncStatus` plumbing removed; obsolete test legs updated (D1 closed by removal).
3. Two-assistant sessions fully representable: tests extended + 2nd-assistant picker in the assignment UI (D2 closed).
4. One E2E leg proves the pipeline switch on screen (D4 closed).
5. Full E2E green (or pre-existing triaged) + drift log for any further obsolete functionality found along the way (E2E was never updated; expect more drift).

**Non-goals**

- Server `/api/sync.php` removal — retained for old cached clients/PWA, marked legacy (removing it bricks offline-cached installs with no benefit).
- Offline-capture replacement — needs its own plan if the business ever wants it back.
- `asistenIds` on legacy `AttendanceForm` (siswa entity) — that entity is per-record single-assistant by design; F9 lives on `absensiPengajar` per-person rows.
- Honor-Payable/Payment economics — owned by EVAL_FINANCE (EF.B), read-only here.

## 3. Findings registry (F-DC)

| ID | Finding | Evidence |
|---|---|---|
| F-DC1 | **Admin correction drops the session role.** Rebuild omits `peran`/`dicatatOleh`; text-only correction reprices pay. | `TrainerAttendanceAdmin.jsx:88-113` (form state + rebuild) |
| F-DC2 | **Split-brain write paths.** `absensiPengajar` self-write is direct; legacy `absensi` + both payment ledgers still queue behind a manual button. | `store.js:300-315,495-501`; `AccountMenu.jsx:72-78`; `App.jsx:202`; 5 call sites (§1) |
| F-DC3 | **2nd assistant is API-only.** Union reads exist everywhere; the assignment UI has no 2nd-assistant control. | `PenugasanManager.jsx:27,518-521`; `PenugasanTimetable.jsx:88` vs `entities.php:243-262` |
| F-DC4 | **Pipeline proven in unit, not on screen.** No E2E leg shows Terbit → dashboard move. | `FinanceReport.jsx:86-102`; `finance-regression.test.js:224-327`; zero E2E pipeline legs |
| F-DC5 | **More obsolete functionality expected.** E2E was never updated against COVER_SLOT/EVAL_FINANCE behavior; each gate must log new drift found. | User directive 2026-09-27; drift log §10 |

## 4. Decision set (D-DC)

| # | Decision | Status |
|---|---|---|
| D-DC1 | **Drop the client queue (user-directed).** All §1 call sites → direct writes (idiom in `TrainerAttendanceForm.jsx:103`); remove `queueSync`/`syncPending`/sync-log/`getSyncStatus` plumbing, `Sinkronisasi` UI, boot flush; update every `sync.php`-waiting test leg. Server `sync.php` retained + marked legacy. Offline capture explicitly unsupported from here (M7.2.1 superseded for these entities). **Scope note (user-confirmed 2026-09-27):** the drop exposed queued edits/verify/certify on legacy `absensi` never reached the server (sync INSERTs; dups → `alreadyApplied`; `absensi.php` insert-only; zero `konfirmasiTrainer` server handling). Minimal server additions mirror the existing `verify` idiom: `absensi` `update` (admin own-branch/superadmin, audited) + `certify` (trainer own rows, server-stamped — `authorize.php` trainer `certify` lane already exists). No other server scope. | Locked |
| D-DC2 | **Correction carries role (concrete pick).** Extract pure `buildPengajarCorrection(original, form)` (mirror `trainerAttendance.js` helper idiom); carry `peran`/`dicatatOleh` unchanged — no role control added to the dialog (team picks control vs read-only line later). Unit-pin + keep existing correction E2E green. | Locked |
| D-DC3 | **D2 two-track.** Track A (this chain): extend tests with `asistenIds` legs (legacy `asistenId` assertions kept — union position 0). Track B (this chain): 2nd-assistant picker in `PenugasanManager.jsx` + timetable column, mirroring the existing dropdown idiom. | Locked |
| D-DC4 | **D4 one E2E leg.** Tarif school: generate + Terbit invoice → dashboard Potensi shows invoice figure with source label; Frozen school unchanged on the same run. Never assert pipeline figures from `financialData()` (layer contract — base stays flat). | Locked |
| D-DC5 | **Drift log discipline.** Every gate appends newly found obsolete behavior to §10 + `EXEMPLAR_MIGRATION.md` addendum; ground truth wins ties (fix tests, not web — unless a D3b-class app bug, then microtask it). | Locked |

## 5. Data model (extensions, additive only — except D-DC1 removal)

```text
buildPengajarCorrection(original, { status, keterangan, catatan })
  -> newAbsensiPengajar({ ...identity+scope from original, ...form fields,
       peran: original.peran ?? null, dicatatOleh: original.dicatatOleh ?? null })
  // role rides unchanged; server re-validates (shape gate already pins enums)

D-DC1 removal surface (client only):
  store.js: upsert() keeps local-cache write, drops queueSync() call;
    queueSync/readSyncLog/writeSyncLog/pendingRecordsForKey/syncPending
    (export) removed; getSyncStatus removed; LEDGER_KEYS retained as the
    direct-write entity set (or removed if unused — implementer verifies).
  AccountMenu.jsx: Sinkronisasi menuitem + badge removed.
  App.jsx: boot syncPending() flush + syncStatus props removed.
  Call sites: AttendanceForm / RiwayatAbsensi / TrainerHistory /
    PaymentTable(87,121) / sppPayments.js -> writeRemote direct
    (mirror TrainerAttendanceForm.jsx:103 idiom incl. forbidden/conflict paths).
  Server server/api/sync.php: RETAINED, header-marked legacy.
```

## 6. Rules (R-DC)

- **R-DC1** One concern per microtask; never restyle while fixing logic; classNames move verbatim.
- **R-DC2** Mirror, don't invent: `writeRemote` forbidden/conflict handling, `newAbsensiPengajar` factory, `Modal`/`AlertDialog` idioms, Rupiah/dropdown form idioms, Indonesian pinned copy (`Tersimpan`, `Sinkronisasi` removal must leave no orphan strings — grep gate).
- **R-DC3** Server authoritative (taste #61): no validation logic removed server-side; client removal only.
- **R-DC4** Additive except D-DC1: the queue removal is the single sanctioned deletion; everything else additive.
- **R-DC5** Verification language `Verified: <command> -> <result>`; one OUTCOME + one falsifiable VERIFY per microtask; narrowest check immediately after first edit; hygiene gate (`rg console.log src/` clean, `git status` intended files only); removal grep-gates must include module-local helper names (`pendingRecordsForKey`, `readSyncLog`, `SYNC_LOG` — DL-6 lesson), not just the public identifiers; full loop + pre-existing triage + acceptance re-run before done (taste #9/#10).

## 7. UI concept (pinned copy)

- Correction dialog unchanged visually (no new controls in this chain); role preservation is silent + unit-pinned.
- `Sinkronisasi` menu item disappears; no replacement copy (direct saves already confirm via `Tersimpan` + existing error paths `Kamu tidak punya izin mencatat absensi ini.` / `Sudah ada catatan…`).
- Assignment form gains `Asisten 2 (opsional)` select mirroring `Asisten (opsional)` (`PenugasanManager.jsx:518-521` idiom); validation `Asisten tidak boleh sama dengan instruktur.` extended to both positions; timetable `Asisten` column joins both names.

## 8. Alignment table — verify-the-verification gate (taste #68)

| Finding | Confirmed by docs (file/section) | Not documented / implied | Disposition |
|---|---|---|---|
| F-DC1 correction drops role | `trainerAttendance.js:66-69` (row-first labels); `finance.js:57-62` (role-first honor); `TrainerAttendanceAdmin.jsx:104-113` (rebuild omits role) | Carry-through shape never specified | New build D-DC2 (DC.A) |
| F-DC2 split-brain writes | `store.js:334-341` (direct-write decision recorded); CS.C.2 8-leg cohort; `EXEMPLAR_MIGRATION.md` 2026-09-27 D1 | Queue removal never decided until 2026-09-27 user call | Removal D-DC1 (DC.B) |
| F-DC3 API-only 2nd assistant | `COVER_SLOT_PLAN.md` D-CS4 (additive array + per-person rows); `EXEMPLAR_MIGRATION.md` F9 | Assignment-UI picker never built | Two-track D-DC3 (DC.C) |
| F-DC4 no on-screen pipeline proof | `EVAL_FINANCE_PLAN.md` D-EF7; `finance-regression.test.js:224-327` (unit guard) | E2E leg never assigned | New leg D-DC4 (DC.D) |
| F-DC5 further drift | `EXEMPLAR_MIGRATION.md` 2026-09-27 addendum (expect more) | Unknown until E2E runs | Log D-DC5 (DC.E) |

## 9. Access model (explicit, no broadening)

No privilege change in this chain. Direct writes reuse the existing `writeRemote` → endpoint → `authorize.php` path (assignment/branch gates unchanged); removing the queue removes no gate (the queue never gated — `sync.php` re-authorizes each entry). Trainer `correct` stays 403 (TA.B.4).

## 10. Drift log (append-only; implementer extends per D-DC5)

| ID | Obsolete behavior found | Ground-truth-correct behavior | Disposition |
|---|---|---|---|
| DL-1 | `absensiPengajar` tests wait for manual `/api/sync.php` flush | Direct `writeRemote` on save (`store.js:334-341`) | Legs removed (DC.B.4 ✓) |
| DL-2 | `absensi-outbox-prune.spec.js` contracts the deleted queue (`syncPending`, syncLog, Sinkronisasi button) | Direct writes; F-11 durability covered by real save→server legs (`e2e`, `r3-verify`, `phase567` Simpan Absensi legs) | Spec deleted (DC.B.4 ✓) |
| DL-3 | M7.2.1 offline-queue test (`m72-verify`) contracts deleted feature; offline-render has no dedicated leg | Offline capture explicitly unsupported (D-DC1); cache still renders on read failure by construction (`store.js read()` fallback) | Test deleted; offline-render leg gap open (DC.E triage) |
| DL-4 | Queued verify/certify/edit stamps never reached the server (sync INSERTs; dups → `alreadyApplied`; zero `konfirmasiTrainer` server handling) | New `absensi.php` `update` + `certify` actions mirroring `verify` (user-confirmed scope) | Shipped (DC.B.1 ✓, 13 endpoint legs) |
| DL-5 | Full-suite cross-test DB pollution (shared `afterschola_t3_test`, no per-test reset): duplicate names → strict-mode violations; foreign rows in date-scoped exports; seed-dependent aborts | Hermetic specs (unique suffixes + finally-cleanup); full-suite triage per leg in DC.E.1 log | Accepted debt; disposition table in DC.E.1 (DC.E ✓ 2026-09-27) |
| DL-6 | B.3 deletion missed `pullRemote`'s `pendingRecordsForKey` overlay (greppable only via the local name — gate pattern too narrow) → silent stale cache → AP.A.1 regression | Overlay removed; `pullRemote` unit-pinned (server-list verbatim) | Fixed + verified (AP.A.1 green); gate pattern widened below |
| DL-7 | `m512` pins 11 nav tabs; app has 13 since the Penugasan chain added 2 tabs | Tab-count ownership sits with the Penugasan chain, not this one | Flagged unplanned drift for owner; spec untouched |
| DL-8 | Destructive Temp seed scripts (`seed_users.php`, `seed_phase567.php`, …) absent from this machine → phase567 cannot run | Scripts live outside git (user Temp dir); reconstructing = fabrication | SUPERSEDED Lane-2 (user-directed retire): phase567 spec deleted (invoice flow predates SB.C.2 anyway); auth + stress Temp calls replaced with in-repo `db-reset.php` + new `server/tests/clear-throttle.php` (DB-guarded, refuses non-test DB); destructive set = auth-login-page + stress-simulation |
| DL-9 | phase567-exit-gate invoice flow (Draft/Tandai-Lunas buttons) contradicts the canonical generator path (SB.C.2 removed both) | Spec predates the invoice consolidation; seeds unrecoverable on top | Retired with coverage mapping (trainer-attendance-*, invoice-installment, penugasan-*, sim-full-flow all green); config + global-setup updated |
| DL-10 | auth #6/#10/#11 assumed the Keluar menuitem visible/clickable with the Akun menu closed (HY.5.1b Akun-dropdown omission) + #11 assumed seeded schools the in-repo reset never creates | Spec predates the dropdown UI + Temp sim seeds | Fixed: open Akun menu first; #11 seeds one school hermetically (deleted at end). `Verified: auth 11/11 green` |
| DL-11 | Boot failed 3 layers deep: (1) bare `getByText('Tahun Ajaran')` strict-violates vs the newer chart heading; (2) `absensiPengajar` missing from `getKeys()` serialized every row under a literal `"undefined"` localStorage key; (3) anonymous me.php 401 + no-logo logo-current 404 console errors | (1) UI evolved; (2) TA chain added the readable entity without a storage key — real app bug, silent; (3) by-design probes the old assertion never accounted for | Fixed: aria-label year select; `getKeys()` entry added; URL-precise response-listener tolerance. `Verified: Boot green` |
| DL-12 | stress-sim wedges at stacked-modal overlay (success alert over form modal; X click intercepted; no Escape handling) — same documented overlay-hang class | App modal layering vs script assumptions; 8-min iteration cycle on a non-CI exploratory artifact | STOPPED per taste #65: recorded Unverified with the product finding (stacked modals + no Escape = UX defect for the owning chain); script keeps the idiom-consistent dismissal attempt |
| DL-13 | Lane-2 rerun triage: AP.A.1 failed 3× on my tree while passing pristine → real B.3 gap (dangling overlay call in `pullRemote`), fixed + unit-pinned + re-verified green; trainer-honor-input failed mine once then passed mine on retry while passing pristine → login-landing flake (A2.5 family), not regression; Boot green isolated but slow in-run on dirty DB (14s vs 3s) → pollution-timing | Shared-DB load + residual login race | Fixed what was real; rest carried as flake/pollution with per-leg evidence |
| DL-14 | e2e.spec internal reds persist in-run (duplicate seeded names → strict violations; select/download timeouts) while Boot passes isolated | Legacy monolith: no inter-test cleanup + heavy shared-DB render | Open: repair-in-place vs quarantine decision for the file (owner UI chain); Boot/m512 legs individually green |
| DL-15 | In-run login-landing failures (e2e Boot + probe-logout show the login form despite loginViaApi POST 200; login_attempts table clean — no lockout) | A2.5 visitor-cookie race (boot me.php mints visitor session that overwrites the auth cookie in the shared jar), load-amplified under full runs; fixture drain logic predates current load profile | Carried as flake class (AUTH-chain territory to harden: verify landing in-fixture or serialize session issuance); isolated legs green; no app-code implication |
| _reserved_ | _append here_ | | |

## 11. Write-back contract (taste #43, on DC.E close)

Record `Verified:` lines per microtask in `DRIFT_CLOSE_MILESTONES.md`; mark Gates DC.A–DC.E; append closure row to `SCOPE_EXPANSION_MILESTONES.md` (no renumbering); append drift-log deltas to `EXEMPLAR_MIGRATION.md` 2026-09-27 addendum; note M7.2.1 offline supersede scope in `SCOPE_EXPANSION_PLAN.md` without rewriting history.

## 12. Cross-references

- `docs/UNIVERSAL.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/SCOPE_EXPANSION_PLAN.md`, `docs/COVER_SLOT_PLAN.md`, `docs/EVAL_FINANCE_PLAN.md`, `docs/EXEMPLAR_MIGRATION.md`
- `src/lib/store.js`, `src/lib/trainerAttendance.js`, `src/lib/constants.js`, `src/features/attendance/TrainerAttendanceForm.jsx`, `src/features/attendance/TrainerAttendanceAdmin.jsx`, `src/features/attendance/AttendanceForm.jsx`, `src/features/attendance/RiwayatAbsensi.jsx`, `src/features/attendance/TrainerHistory.jsx`, `src/features/penugasan/PenugasanManager.jsx`, `src/features/penugasan/PenugasanTimetable.jsx`, `src/features/payments/PaymentTable.jsx`, `src/lib/sppPayments.js`, `src/components/AccountMenu.jsx`, `src/App.jsx`
