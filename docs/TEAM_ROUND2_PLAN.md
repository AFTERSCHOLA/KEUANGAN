# Team Round-2 Plan — trainer sync + honor refresh + payment-history verifiability

**Status:** DONE 2026-09-29 — gates T2.A–T2.E closed (T2.E.3 write-back; Verified lines in `docs/TEAM_ROUND2_MILESTONES.md`, closure row in `docs/SCOPE_EXPANSION_MILESTONES.md`).
**Position:** Temporary gate-by-gate fix plan per taste #40. It does **not** replace `IMPLEMENTATION_PLAN.md`, `SCOPE_EXPANSION_PLAN.md`, `SCOPE_EXPANSION_PRIVILEGES.md`, `SPP_BILLING_PLAN.md` / `SPP_BILLING_MILESTONES.md`, `COVER_SLOT_PLAN.md` / `COVER_SLOT_MILESTONES.md`, `BULK_RECONCILE_PLAN.md`, or `EVAL_FINANCE_PLAN.md`. It revises nothing silently: every change is additive or display-only, and every already-decided item is recorded as disambiguation (§5), not rebuilt. When Gate T2.C closes, §11 records completion back on the source docs.
**Contract order:** `docs/UNIVERSAL.md` (primary contract, read first) → `docs/IMPLEMENTATION_PLAN.md` Part 2 → `docs/SCOPE_EXPANSION_PLAN.md` + `docs/SCOPE_EXPANSION_PRIVILEGES.md` (scope-expansion first-reads) → `docs/SPP_BILLING_PLAN.md` §4/§7 (D-SB8/D-SB9/D-SB11/D-SB12/R-SB1/R-SB2) → `docs/COVER_SLOT_PLAN.md` §4 (D-CS1/D-CS2/D-CS8/D-CS9) → `docs/BULK_RECONCILE_PLAN.md` (D-BR1) → `docs/EVAL_FINANCE_PLAN.md` F-EF5/item-15 → this file.
**Goal:** one sentence — a trainer sees their other-school students without re-login, honor updates without hard refresh, and every TEST 11/12 money claim is checkable in a visible payment-history list.
**Falsifiable check for this doc:** every `file:line` cited below exists, and `git status` shows only the two new files in this pair.

---

## 1. Findings registry (F-T2)

| ID | Finding | Evidence |
|---|---|---|
| F-T2-1 | **Cross-record wipe hides other-school students.** `read('trainer')` overwrites the local trainer cache with the server's own-record-only result, destroying the instructor-hosted assignment row the `siswa`/`sekolah` scope depends on. | `src/lib/store.js:244` (`writeRaw` full overwrite); `server/auth/authorize.php:153-155` (trainer reads own record only); `src/lib/store.js:84-98,131-135` (scope scans all cached trainer rows); `src/lib/__tests__/store-trainer-siswa-scope.test.js:32-54` (seeds both rows, never calls `read('trainer')` — masks the wipe); `tests/trainer-assignment-visibility.spec.js:82-92` (self-hosted shape only) |
| F-T2-2 | **Dashboard honor is snapshot-only.** `TrainerDashboard` never subscribes or refetches, so a pre-hydrate mount computes 0 and never updates; the sibling Summary self-heals. | `src/features/auth/TrainerDashboard.jsx:1,18-31` (no `subscribeStore`/`read`/`tick`/`hydrate`; grep `features/auth` = zero hits) vs `src/features/attendance/TrainerAttendanceSummary.jsx:16-29` (`tick+subscribeStore+read` on mount); `src/lib/finance.js:89-225` (pure, no persistence); `src/App.jsx:165-172,326-328` (hydrate on `currentUser.id` only, tab switch remounts without re-hydrate) |
| F-T2-3 | **Invoice has no per-payment history list.** Aggregate `Dibayar/Sisa` exists but individual transactions (nominal/tanggal/metode/diterimaOleh) are unrendered, so TEST 11 installments cannot be manually verified. | `src/features/reports/InvoiceModal.jsx:379-382` (aggregate only); `src/features/reports/InvoiceTemplate.jsx:163-177` (totals, no table); contrast `src/features/payments/PaymentTable.jsx:304-335` (`Riwayat` idiom to mirror); `sppPaymentsForSiswa` (`sppPayments.js:44-46`) has no UI caller |
| F-T2-4 | **Student has no per-payment history list.** Pill `Lunas/Sebagian/Belum` exists but the source transactions are unrendered, so TEST 12 "paid by Parent" cannot be proven from the UI. | `src/features/students/StudentList.jsx:334-351` (pill via `sppPaidForPeriode`); `src/lib/tunggakan.js:34-39` (sum ≥ tarif); `:665` ("otomatis dari riwayat pembayaran") — no expandable list anywhere |
| F-T2-5 | **Slot "all appear" is by design + card text.** `[null]` = unscoped = fan-out, and the trainer card renders the full school schedule regardless of scope. | `src/features/trainers/TrainerList.jsx:518-522,538-541` (`[null]` semantics, checking Semua wipes specifics); `src/lib/penugasan.js:284-287` (unscoped fans out); `TrainerList.jsx:14-21` (card renders full `formatJadwalList`); `docs/COVER_SLOT_PLAN.md:60,92` D-CS8/R-CS7 |
| F-T2-6 | **Cover invisible is date/scope/role mismatch, not missing rows.** Cover `periodeMulai=tanggal` with weekday+triple gate + date-driven, role-filtered timetable. | `src/features/penugasan/PenugasanManager.jsx:377` (`periodeMulai=tanggal`); `src/lib/penugasan.js:274-287` (date + weekday + exact-triple gate); `src/features/penugasan/PenugasanTimetable.jsx:36-39` (date-driven + `penugasanInvolvesTrainer` filter); `penugasan.js:218-221` (badge pairing stricter than row existence) |
| F-T2-7 | **Invoice total is server-computed, not an input.** TEST 11A "amount field" contradicts the canonical path. | `src/features/reports/InvoiceModal.jsx:81-82,287-336` (estimate display only; sole numeric input is cosmetic `Jumlah Pertemuan`); `src/lib/invoices.js:346-372` (sends `{periode,uraian,sekolahId}`, no amount); `server/lib/invoiceGenerator.php:174-182` (groups by `spp/sppOverride`); `SPP_BILLING_PLAN.md:43` F-SB3, D-SB10/D-SB11 |
| F-T2-8 | **Metode vs Sumber Dana are orthogonal by design, copy confuses.** Bulk dialog shows Metode only and hardcodes school source. | `src/features/payments/SppPaymentModal.jsx:10-11` (METODE kanal vs SUMBER_DANA asal dana); `src/features/reports/InvoiceModal.jsx:228` (hardcodes `sumberDana:'sekolah'`, D-BR1); `:430-435` (Metode select only); `docs/BULK_RECONCILE_PLAN.md:27` D-BR1 |
| F-T2-9 | **Credit auto-apply is a logged GAP, not a bug.** Detect + memo exist; deduct-from-next-invoice never built. | `src/lib/invoices.js:226` (credit), `:237-251` ("tidak mengubah total"), `:302-310` (memo lines); `InvoiceModal.jsx:381,392-393`; `docs/SPP_BILLING_MILESTONES.md:207` item 15; `docs/BULK_RECONCILE_PLAN.md:114`; `docs/EVAL_FINANCE_PLAN.md:44` F-EF5 |
| F-T2-10 | **Slot default contradicts A1 — user verdict TRUE BUG 2026-09-29 (regression).** Current: checking a school seeds `[null]` = all slots inherited. Expected: only admin-selected slots inherited (e.g. Mon 09:00 ✅ + 13:00 ✅, 11:00 not). Rule: inheritance must not copy all slots. Result: FAIL A1. | `src/features/trainers/TrainerList.jsx:48,118,123,519-522,528,538-541` (D-CS8 naive `[null]` default); user manual-test §B.3 + §F Priority-1.1; contradicts `COVER_SLOT_PLAN.md:60` D-CS8 — surfaced per taste #60, user resolved: fix to explicit pick |
| F-T2-11 | **External assistant missing from assignment picker — TRUE BUG.** External records creatable, but Asisten/Asisten-2 selects list `trainers` only, so externals can never be assigned → attendance/honor chain blocked. | `src/features/penugasan/PenugasanManager.jsx:567,579` (`trainers.filter(...)` only, no `eksternal`); `src/features/admin/EksternalManager.jsx` (creation exists); user manual-test §B.5 + §F Priority-1.2 |
| F-T2-12 | **Cover missing from Assignment Schedule — TRUE BUG (upgraded from disambiguation).** Cover rows creatable, but schedule must show `Trainer B Mon 09:00 Cover` replacing `Trainer A`. Proof-first: save-vs-retrieve split unknown. | `src/features/penugasan/PenugasanManager.jsx:352-401` (cover create); `src/features/penugasan/PenugasanTimetable.jsx:36-39` (date-driven + role filter); user manual-test §B.4 + §F Priority-1.3 |
| F-T2-13 | **Double-booking hard-block unverified.** Client pre-check returns before write + server re-checks, but no E2E proves the second save is rejected AND unsaved (warning-only would be FAIL). | `src/features/penugasan/PenugasanManager.jsx:234-260` (pre-check `return` + `conflict`/`forbidden` paths); `server/lib/assignments.php:219-316`; user manual-test §B.7 + §F Priority-2.6 |
| F-T2-14 | **Correction audit identity unverified.** Notes visible (PASS*), but `recordedBy`/`correctedBy` storage unproven — UI may show result/note only. | `src/lib/trainerAttendance.js:105-123` (correction preserves `dicatatOleh`); `src/lib/store.js:559-569` (`correctionOf` path); user manual-test §A.6 + §F Priority-2.7 |
| F-T2-15 | **Frozen billing untested.** Frozen = fixed amount, never recalculated on student/meeting changes; method selector (Rate vs Frozen) in School Data unproven. | `SPP_BILLING_PLAN.md` D-SB11 (total frozen at `Terbit` — already decided, needs proof); user manual-test §D.10 + §F Priority-3.8 |
| F-T2-16 | **Payable independent of SPP collection untested — CRITICAL (TEST 17).** `Honorarium Payable` (company debt) must stay full when tuition installments leave cash short; only `Payment` defers. A system that prices Payable at 1jt instead of 2jt is Major FAIL. | `src/lib/finance.js:89-225` (payable derives from attendance+role/tier, no SPP input — already designed, needs proof); user manual-test §D.17 + §F Priority-3.14 |

---

## 2. Decision set (D-T2, concrete picks)

| # | Decision | Status |
|---|---|---|
| D-T2-1 | **Trust-server scope + trainer-first hydrate (F-T2-1 fix).** `hydrateServerData` fetches `trainer` first, then the rest concurrently; `read(key)` for trainer-role returns the server-filtered `remote` array directly instead of re-filtering it against the possibly-stale local trainer cache (`readCached` keeps the client filter for offline/sync paths). No privilege change: server scope stays authoritative (taste #61). | Done 2026-09-29 |
| D-T2-2 | **Dashboard mirrors Summary subscription (F-T2-2 fix).** `TrainerDashboard` gains the `TrainerAttendanceSummary.jsx:16-29` idiom verbatim: `tick` state + `subscribeStore(bump)` + `read('absensiPengajar')`/`read('honorPayments')` on mount. No new derivation: `financialData` call unchanged, only its inputs refresh. | Done 2026-09-29 |
| D-T2-3 | **Mirror the honor `Riwayat` idiom for both money histories (F-T2-3/F-T2-4 fix).** Invoice row gains expandable `Riwayat pembayaran (N)` listing `matchedPaymentsForInvoice` rows (tanggal · nominal · metode · diterimaOleh · sumberDana); student row gains expandable `Riwayat (N)` listing `sppPaymentsForSiswa` rows for the selected periode. Display-only: `computeSppLunas`/`invoiceSettlement` untouched (R-SB1/R-SB2). | Done 2026-09-29 |
| D-T2-4 | **Bulk/credit/amount are disambiguations, not builds (F-T2-8/F-T2-9/F-T2-7).** No ledger or total math changes. Each gets one pinned sentence (§5): bulk dialog labels Metode as kanal, credit stays memo with frozen `grandTotal`, invoice create keeps estimate copy. Slot (F-T2-5) and cover (F-T2-6) disambiguations are SUPERSEDED by F-T2-10/D-T2-6 and F-T2-12/D-T2-8 below. | Locked on acceptance |
| D-T2-5 | **Credit auto-deduct stays deferred.** "Used X / Remaining Y" needs business sign-off on auto-deduct vs memo (owner: finance chain, EVAL_FINANCE item 15). This chain must not invent deduction math. | Locked |
| D-T2-6 | **Explicit slot pick — checking seeds nothing (F-T2-10 fix, re-plans D-CS8 client default).** Checking a school seeds `[]` (no boxes ticked, Semua unchecked); save maps a missing entry to `[]` (no rows, D-CS1 "No pick, no row" already on server, untouched). One unscoped row is minted ONLY when the admin explicitly ticks `Semua slot`. Current/Expected/Rule/Result per user §F: only selected slots inherited. | Done 2026-09-29 |
| D-T2-7 | **External in assignment picker (F-T2-11 fix).** Asisten/Asisten-2 selects offer the union `trainers` + `eksternal` (same-school scope, trainers reference-only idiom per `store.js:145`); saved ids ride the existing `asistenId`/`asistenIds` keys (max 2, server union gate already covers trainer/external in-branch). No new keys, no role broadening: externals gain no login. | Done 2026-09-29 |
| D-T2-8 | **Cover proof-first, then fix the failing side (F-T2-12 fix).** Reproduce first: create cover → assert server row exists (`readEntity trainer` shows `coverOf` row on substitute) AND timetable shows `B … (Pengganti)` on the cover tanggal. Fix whichever side fails (save path vs retrieve path), not both. | Done 2026-09-29 |
| D-T2-9 | **E2E expectation cycle (F-T2-13–F-T2-16).** Each Priority-2/3 item gets a failing-first E2E proof against the stated Expected before any code: double-booking second save rejected+unsaved; correction stores recorder identity; frozen invoice immune to student/meeting changes; payable full while SPP partial (TEST 17). Code only if the proof fails. | Done 2026-09-29 |

---

## 3. Rules (R-T2)

- **R-T2-1** One concern per edit (IMPLEMENTATION R1): scope-order, dashboard-subscribe, invoice-history, student-history are separate microtasks; never restyle while fixing logic; classNames move verbatim.
- **R-T2-2** Mirror, don't invent (taste #11): dashboard fix copies `TrainerAttendanceSummary.jsx:16-29`; history lists copy `PaymentTable.jsx:304-335` expandable-`Riwayat` idiom; Indonesian copy pinned (§6).
- **R-T2-3** Server authoritative (taste #33/#61): every scope/payment write stays gated in `authorize.php` + `entities.php`; UI mirrors, never guards alone; no role broadened.
- **R-T2-4** Ledger append-only + derived-only (R-SB1/R-SB2): history UI reads `sppPayments`/`invoices.js` helpers; no stored `dibayar/sisa/status`, no row edits, no total inputs.
- **R-T2-5** Verification language `Verified: <command> -> <result>` / `Unverified:` (UNIVERSAL); one OUTCOME + one falsifiable VERIFY per microtask (taste #2); narrowest check immediately after the first edit (taste #4); hygiene gate: no `console.log` in `src/`, `git status` clean of artifacts (taste #20); `deploy/` only via `npm run build:deploy` (taste #71/#72).
- **R-T2-6** Additive only: missing keys read as legacy; no renames; silently writing unvalidated scope is a defect.
- **R-T2-7** Every fix states Current/Expected/Rule/Result (user §F format) in its task + report — no "Bug number 4" shorthand.
- **R-T2-8** E2E expectation cycle: failing-first E2E proof before any code for F-T2-12–F-T2-16; code only the failing side (taste #4); the cycle repeats until expectations met.

---

## 4. UI concept (pinned copy, §6 binds tests)

- Dashboard: no copy change (behavior fix only; `Honor Saya` numbers update without hard refresh).
- Invoice row: toggle `Riwayat pembayaran (N)`; row line `29 Sep 2026 · Transfer · Rp2.000.000 · Diterima: <nama> · Sumber: Sekolah/Ortu`; footer `Total dibayar RpX · Sisa RpY` (reuse `invoiceSettlement` values, no new math).
- Student row: toggle `Riwayat (N)` under the pill; line `September 2026 · Rp500.000 · Sumber: Ortu langsung · Metode: Transfer`.
- Slot pick (D-T2-6 fix): school checkbox seeds nothing (`Semua slot` unchecked); specific slot boxes tick individually; `Semua slot` ticked explicitly = one unscoped row. Blocked copy when nothing picked: `Pilih minimal satu slot atau centang Semua slot.`
- Trainer card: under `Jadwal Mengajar` append `· Cakupan: Semua slot` when the link row is unscoped, else `· Cakupan: <Hari HH:MM–HH:MM>`.
- Assignment Asisten selects: options = trainers (minus chosen instruktur) + externals of the same school (`<nama> (Eksternal)` suffix).
- Timetable empty-state (disambiguation): `Tidak ada sesi pada <tanggal> (<hari>).` (names what was viewed).
- Bulk dialog (disambiguation): label `Metode (kanal)` + hint `Sumber dana baris ini: Sekolah (murid yang sudah lunas dilewati).`
- Invoice create (disambiguation, existing copy kept): `Total final dihitung server — lihat Riwayat Invoice setelah dibuat.`

---

## 5. Disambiguations recorded (expectation fixes, no build beyond §4 one-liners)

| # | Report | Correct expectation | Why |
|---|---|---|---|
| X-T2-1 | BUG 1 "student data not syncing on trainer dashboard" | Dashboard `Rekap Saya` never lists students by design (`TrainerDashboard.jsx:59-105` = schedule + honor only). The sync claim belongs to the `Data Siswa` scoped view (`readCached('siswa')`); plus the schedule gate `scheduleIncludesToday` (`:52`) can hide a correctly synced school. | Prevents testing the wrong screen. True bug F-T2-1 still fixed via D-T2-1. |
| X-T2-2 | BUG 3 "Fail A1 checked yet all slots appear" — SUPERSEDED 2026-09-29 | Was: fan-out by design (D-CS8). User verdict (manual-test §B.3, Current/Expected/Rule/Result): TRUE regression — admin must select specific slots; inheritance must not copy all. | Fixed via F-T2-10/D-T2-6 (explicit pick; D-CS8 client default re-planned, server D-CS1 untouched). Old timetable-vs-card note kept as test guidance, not as verdict. |
| X-T2-3 | BUG 4 "cover works but missing in schedule" — UPGRADED 2026-09-29 | Was: wrong tanggal/role. User verdict (manual-test §B.4): TRUE bug — schedule must show `Trainer B Mon 09:00 Cover`. Timetable-view guidance kept, but proof-first fix required. | Fixed via F-T2-12/D-T2-8 (save-vs-retrieve split, fix failing side only). |
| X-T2-4 | TEST 11A "input installment amount" | No amount input on invoice create by design (D-SB10/D-SB11): installments are N `sppPayments` rows (per-siswa modal or bulk), total frozen at `Terbit`. The bulk dialog intentionally has no nominal field (nominal = remaining, D-BR1). | An editable total would fork the canonical generator. |
| X-T2-5 | Bulk "Sumber Dana dropdown missing" | Bulk mints school-source rows only; per-row source choice lives in `SppPaymentModal` (`Sekolah`/`Ortu langsung`). `Metode` ≠ source. | Two dropdowns are orthogonal (D-SB12); merging them corrupts history. |
| X-T2-6 | Overpayment "credit not applied" | Current semantics: memo line + frozen `grandTotal` (SB.B.4/D-SB11). Auto-deduct is GAP item 15, needs sign-off. | Do not force PASS per team instruction. |

---

## 6. Alignment table — verify-the-verification gate (taste #68)

| Finding | Confirmed by docs (file/section) | Not documented / implied | Disposition in this chain |
|---|---|---|---|
| F-T2-1 cross-record wipe | `ASISTENIDS_SCOPE_FIX.md` (union membership F-AIS1/2 → D-AIS1/2); `authorize.php:153-155` own-only; `store.js:244` overwrite | Cache lifecycle / hydrate order never specified — union fix closed membership drift only | New fix D-T2-1 (this doc owns it) |
| F-T2-2 dashboard snapshot | `TRAINER_ATTENDANCE_PLAN.md` Summary `tick+subscribe` idiom exists for Summary only | Dashboard subscription never specified | New fix D-T2-2 (mirror, this doc owns it) |
| F-T2-3/F-T2-4 history lists | `PaymentTable.jsx:304-335` idiom exists for honor only; `SPP_BILLING_PLAN.md` §7 derives totals, never lists | Per-payment/per-student SPP list UI never specified | New build D-T2-3 (this doc owns it) |
| F-T2-5 slot fan-out | `COVER_SLOT_PLAN.md` D-CS8/R-CS7 + `PENUGASAN_SLOT_PLAN.md` D-PS2/D-PS4 | Card-vs-timetable expectation never written | SUPERSEDED by F-T2-10/D-T2-6 (user verdict TRUE BUG); X-T2-2 struck |
| F-T2-6 cover visibility | `COVER_SLOT_PLAN.md` D-CS2/D-CS9 + `penugasan.js` gates | Viewed-tanggal/role expectation never written | UPGRADED to F-T2-12/D-T2-8 (user verdict TRUE BUG, proof-first) |
| F-T2-10 explicit pick | `TrainerList.jsx:48,118,123,519-522,538-541` D-CS8 default; user manual-test §B.3/§F P1.1 (Current/Expected/Rule/Result) | Naive default contradicts A1 — D-CS1 server poles never chose a client default | New fix D-T2-6 (re-plans D-CS8 default only; D-CS1 Locked intact) |
| F-T2-11 external picker | `PenugasanManager.jsx:567,579` trainers-only; `EksternalManager.jsx` creation; `store.js:145` trainer reference-only externals | Picker union never specified; D-CS5 covers entity, not picker | New fix D-T2-7 (this doc owns it) |
| F-T2-12 cover schedule | `PenugasanManager.jsx:352-401` create; `PenugasanTimetable.jsx:36-39` retrieve | Save-vs-retrieve split never isolated | New fix D-T2-8 proof-first (this doc owns it) |
| F-T2-13 double-block | `PenugasanManager.jsx:234-260`; `assignments.php:219-316`; DOUBLE_BOOKING chain gates | Second-save rejection E2E never written | New proof D-T2-9 (code only if proof fails) |
| F-T2-14 correction audit | `trainerAttendance.js:105-123`; `store.js:559-569` | Recorder-identity E2E never written | New proof D-T2-9 (code only if proof fails) |
| F-T2-15 frozen | `SPP_BILLING_PLAN.md` D-SB11 (frozen at Terbit — already decided) | Frozen-immune E2E never written | New proof D-T2-9 (already decided, proof only) |
| F-T2-16 payable vs payment | `finance.js:89-225` payable has no SPP input (already designed) | Full-payable-while-partial-SPP E2E never written | New proof D-T2-9 TEST 17 CRITICAL (already designed, proof only) |
| F-T2-7 server total | `SPP_BILLING_PLAN.md` F-SB3/D-SB10/D-SB11 | Editable-total expectation contradicts plan | Disambiguation X-T2-4, no build |
| F-T2-8 metode/source | `SPP_BILLING_PLAN.md` D-SB12 + `BULK_RECONCILE_PLAN.md` D-BR1 | Bulk label copy never pinned | Disambiguation X-T2-5 + one-line label |
| F-T2-9 credit memo | `EVAL_FINANCE_PLAN.md` F-EF5 + `SPP_BILLING_MILESTONES.md:207` item 15 + `BULK_RECONCILE_PLAN.md:114` | Auto-apply never built | Deferred D-T2-5, no build |

---

## 7. Access model (explicit, no broadening)

| Action | Superadmin | Admin Cabang | Trainer |
|---|---|---|---|
| Read scoped students/schools | ✅ all | 🟡 own branch | 🟡 assigned schools only (D-T2-1 preserves server scope) |
| Read honor/attendance history | ✅ all | ✅ own branch | 🟡 own rows only |
| Read invoice/student payment history (D-T2-3) | ✅ all | 🟡 own branch (existing scope) | 🟡 own rows (existing scope; invoices stay unreadable per `authorize.php:14-29`) |
| Mint payments / edit scope | unchanged (R-SB5/R-BR3) | unchanged | ❌ never (reference-only) |

---

## 8. Deferred with owners

| Item | Owner / venue | Why deferred |
|---|---|---|
| Credit auto-deduct ("Used/Remaining") | Finance chain / EVAL_FINANCE item 15 | Needs business sign-off; memo semantics Locked (D-T2-5) |
| Editable invoice totals | SPP_BILLING chain D-SB10/D-SB11 | Would fork the canonical generator (X-T2-4) |
| Trainer inline external creation | Future amendment + abuse review | Would broaden trainer write (taste #33) |
| Dashboard source switch | After generator upgrade (Q2/P2) | P1/P2 lesson: Dashboard last |
| `invoices.php:38-46` delete-guard gap (Lunas-via-modal deletable) | Finance chain (`SPP_BILLING_MILESTONES.md:208` follow-up) | Noted 2026-09-28, chain ended; extend guard or document acceptance |

---

## 9. Write-back contract (taste #32/#43, on T2.E close)

Record `Verified:` lines per microtask in `TEAM_ROUND2_MILESTONES.md`; mark Gates T2.A–T2.E; append one closure row to `SCOPE_EXPANSION_MILESTONES.md` (no renumbering — this pair is the temporary gate doc per taste #40/#74); note the D-T2-3 history-UI addition + D-T2-6 slot-default reversal scope (CS stays otherwise intact) in `SPP_BILLING_PLAN.md` §10 / `COVER_SLOT_PLAN.md` without rewriting history; link disambiguations X-T2-1–X-T2-6 (incl. X-T2-2 supersede + X-T2-3 upgrade) in `EVALUATION_LOG.md` addendum without expanding the long-term plan.

**Write-back executed 2026-09-29 (T2.E.3):** Gates T2.A–T2.E marked DONE with `Verified:` lines per microtask in `TEAM_ROUND2_MILESTONES.md`; closure row appended to `SCOPE_EXPANSION_MILESTONES.md` (no renumbering); D-T2-3 history-UI addition noted in `SPP_BILLING_PLAN.md` §10 (no SB rewrite); D-T2-6 slot-default reversal scope noted in `COVER_SLOT_PLAN.md` (no CS rewrite). Full evidence in `.superpowers/sdd/team-round2/task-E3-report.md`.

---

## 10. Cross-references

- `docs/UNIVERSAL.md`, `docs/IMPLEMENTATION_PLAN.md` (Part 2), `docs/SCOPE_EXPANSION_PLAN.md`, `docs/SCOPE_EXPANSION_PRIVILEGES.md`
- `docs/SPP_BILLING_PLAN.md` §4/§7/§10, `docs/SPP_BILLING_MILESTONES.md:200-208` (SB.G 12–15), `docs/BULK_RECONCILE_PLAN.md`, `docs/COVER_SLOT_PLAN.md` §4, `docs/EVAL_FINANCE_PLAN.md` F-EF5, `docs/ASISTENIDS_SCOPE_FIX.md`
- `src/features/auth/TrainerDashboard.jsx`, `src/features/attendance/TrainerAttendanceSummary.jsx`, `src/lib/store.js`, `src/lib/finance.js`
- `src/features/reports/InvoiceModal.jsx`, `src/features/students/StudentList.jsx`, `src/features/payments/SppPaymentModal.jsx`, `src/lib/sppPayments.js`, `src/lib/invoices.js`, `src/features/payments/PaymentTable.jsx`
- `server/api/read.php`, `server/auth/authorize.php`, `server/validation/entities.php`
