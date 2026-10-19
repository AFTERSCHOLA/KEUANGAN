# Exemplar Flow Simulation — 2026-10-09 (read-only, backup-grounded)

**Goal:** Simulate the full business process on current code using `docs/exemplar/afterschola_t3_test.sql` as ground truth, dropping conflicts/lacking data per `EXEMPLAR_MIGRATION.md`.

**Outcome:** Current code replays G0–G5 end-to-end with zero new defects; all mismatches are already-recorded F/Q carries. No `src/`/`server/` edits made.
**Falsifiable check:** Backup counts reproduce B1 (2397/997/2779 + 0 ledgers) AND `npm run test` 322/322 AND `npm run build` exit 0 — else this report is void.

## 1. Freeze evidence (G0-equivalent)

- `Verified: git branch --show-current -> test-stage`
- `Verified: git log --oneline -3 -> 7d53b6b / 130eda0 / 875c524` (moved since G0 `63c8b99`; drift owners in §6)
- `Verified: git status --porcelain=v1 -> ?? docs/superpowers/plans/2026-10-09-exemplar-flow-simulation.md` (this session only)
- `Verified: npm run test -> 49 files / 322 tests passed`
- `Verified: npm run build -> built in 6.50s` (same chunk-size warning only)
- `Verified: node finance.js spot -> billingForSekolah 2×2×62500 = 250000; honorForPengajarRow A = 50000`
- `Verified: backup bytes -> 582993, lines 2069, Sep 25 2026 07:04 PM, MariaDB 10.4.32`
- `Verified: rg counts -> cbg-BDG-bandung 2397 / skl-BDG- 997 / 2026-09 2779 / admin.bandung 1 / honor+spp+invoices INSERT 0` — B1 HIT
- `Verified: table rows -> cabang 2 / sekolah 20 / siswa 397 / trainer 20 (18 BDG+2 test) / absensi 70 / absensi_pengajar 138 (69+69-c1) / users 14 / audit_log 880`

Live DB was NOT touched (read-only `rg`/`node`/`Read`; no restore, no seed). Destructive Playwright suite deferred to last per taste #55 — carried as `Unverified` in §6.

## 2. Flow simulation (backup data → current code paths)

### G1 — Superadmin → Cabang BDG + Admin Cabang
- Backup: `cbg-BDG-bandung/BDG/Cabang Bandung` + `cbg-test-pusat/PST`; `admin.bandung` present with `must_change_password=0`.
- Code: `server/api/cabang.php:38` `manage_branch` (superadmin-only writes hold); `server/auth/authorize.php:302-304` denies others; `features/admin/BranchManager.jsx:23` + `lib/branchScope.js:1-25` scope filter.
- Verdict: **REPLAYS**. Dump `must_change=0` is expected post-G4c-2 rotation (G1 `1` → rotated), not a gap.

### G2 — Sekolah (20) + Siswa (397)
- Backup: 20 `skl-BDG-` rows; e.g. `sd-istiqamah {spp 250000, siswa/62500/per_bulan}`, `sd-sains-albiruni {125000, siswa/62500/siklus12, 3 slots}`, `smpn18 {250000, metode null}`; siswa `wa:''`, `status Aktif`, `sppLunas:[]`, e.g. `sw-BDG-sd-alazhar-cairo-01 kelas '1 Mesanti'`.
- Code: `server/api/sekolah.php:167-207` cabangId-from-session (admin) / must-supply (superadmin); `siswa.php:33-35` cabangId-forbidden-derived; `SchoolList.jsx:24` + `StudentList.jsx:19` + `lib/tunggakan.js:14,34,41`; joins by ID (`IMPLEMENTATION_PLAN.md` D2).
- Verdict: **REPLAYS**. Per-school distribution matches exemplar (sdm7 49, sabang 77, istiqamah 25; MA+SDM3 zero — no sheets).

### G3 — Trainer roster (18)
- Backup: 9 Inti `{honor only, no tipePengajar}` (e.g. Luthfi 75k/5 rows) + 9 Asisten `{tipe:asisten}` (e.g. afrizal 50k/wa `''`); tiers `5×100k / 4×75k / 9×50k`.
- Code: `server/api/trainer.php:27-33` admin-only create (superadmin 403 holds per `USER_PROVISIONING` D1); `TrainerList.jsx:60`; `lib/penugasan.js:243` union `trainerId|asistenId|asistenIds`.
- Verdict: **REPLAYS** as data; F3 tension confirmed (see §3, dropped).

### G4a/G4b — Slots (23) + Penugasan (25 rows)
- Backup: `SLOT_TOTAL 23 / 17 schools / empty [ma-almashduqi, sd-alazhar-cairo, sdm3]`; `PEN_TOTAL 25 / 8 trainers (Rahmat 0)`; e.g. Widia 4, Luthfi 5.
- Code: `lib/penugasan.js:55 validateRowDates` (slot-triple must match vocabulary); `PenugasanManager.jsx:16` full-replace converge; inverse merge deduped.
- Verdict: **REPLAYS**. Friday Sabang shared slot (Ditha+Luthfi) still dual-active — recorded, no resolution invented.

### G4c — Trainer logins + Sept attendance (69+69-c1)
- Backup: 9 trainer `users` rows (`must_change 0` post-rotation); `absensiPengajar` 69 orig (no `periode`) + 69 `-c1` corrections (with `periode:2026-09`); EXPO 12 lines (=6×2); F13 3 covers absent (no rows).
- Code: `server/api/users.php:77-96` record+account atomic (no link-login path — recreate decision stands); `absensiPengajar.php:87-111` write (own+assignment) vs `:22-82` correct (admin-only, trainer 403); `trainerAttendance.js:14` latest-wins; CSRF probe lesson stands (destructive probes last).
- Verdict: **REPLAYS**. Skipped 13 asisten-only cells (no accounts) + `(A)`-role rows as plain Hadir — role unrepresentable (F9, dropped).

### G4d — Siswa attendance (70 records)
- Backup: 70 `absensi` rows, all `periode:2026-09`; `asistenId` 67 null / 3 non-null (SDIT×2 + Tridaya-Vazira); `asistenIds x0`, `peran x0`; JUMLAH-exact samples hold (SDM7 27/28/28/26, Sains Wed 6/6/12/11, Irhaam unions 20/21/18).
- Code: `features/attendance/AttendanceForm.jsx:13` (True→Hadir idiom); `RiwayatAbsensi.jsx:9,68`; legacy `absensi` has NO assignment gate (`authorize.php:128-130` analogue) — cover writes 200 here while `absensiPengajar` 403s.
- Verdict: **REPLAYS** with F13 asymmetry confirmed (see §3).

### G5 — Money (real `finance.js`, no reimplementation)
- SPP per-meeting `billingForSekolah` (`src/lib/finance.js:270`): **19/19 HIT** to the rupiah. Flat_legacy only SMPN18 (`Math.round` EF.A.3 applied). Largest: SDM7 22.05M, Sains 13.75M, Sabang 9.52875M. Trial probe HIT (M5.4.3).
- Honor session-role vs `financialData` (`finance.js:104` + `honorForPengajarRow:57` A→50k): 7 HIT (Ditha 800k, Iqbaludin 1M, Davin 200k, Rafly 750k, Paris 600k double-slot ✓, Vazira 450k Newbie ✓, Widia 1.2M incl. bare-name EXPO); miss -850k = F9 650k (Afrizal 100k + Alifah 150k + Asyifa 150k + Ira 150k + Raihan 50k + Zahra 50k) + F13 200k (Rahmat 125k + Luthfi 75k). Every recorded row pays its D2 tier; no session exceeds Senior 100k (150k rows are multi-session sums).
- Cash: `labaRugi 0` with empty ledgers (D1 ✓ — tagihan/beban level by design).
- Current-code delta since G5: `finance.js` now has `PERAN_ASISTEN_HONOR` + `honorForPengajarRow` + `pengajarHonorStats` role-first path (CS.C.1/TA.C.3) and `Math.round` flat fix (EF.A.3) — directionally closes F3/F15 classes without altering G5 verdicts (null/absent `absensiPengajar` = legacy byte-identical per R-TA12).
- Verdict: **REPLAYS**.

## 3. Dropped first (conflicting/lacking → carried, not patched)

| ID | Item | Disposition | Owner |
|---|---|---|---|
| F2 | SMPN18 flat 250k/bln, `metode=null` | Dropped-carried; flat_legacy path only | team Q1 |
| F4/F14 | MA tariff/no attendance; SMP Sains 3 sessions/0 pupils | Dropped-carried; no ground truth to bill | team |
| F6 | 10 alias groups (Irhaam/Irham highest risk; Sains SD+SMP single-record exception) | Dropped-carried; NO merge/split until sign-off | field owner, `EXEMPLAR_F6_CONFIRM.md` OPEN |
| F3 | Per-session `(I)/(A)` vs `tipePengajar` live label + per-person honor | Dropped-carried; unplanned G3/G5 microtask | plan |
| F9 | 2nd asisten dropped; `asistenIds`/`peran` x0 in backup | Dropped-carried; partially specified A2 | plan |
| F8/F11 | No student WA; 3 absensi-only trainers WA-less; typos canonicalized | Dropped-carried; M1-tolerated + reactive hygiene (taste #66) | — |
| F10 | `Fleksibel/TEGANTUNG PJ/(BUTUH n)` no slot | Dropped-carried; null/deferred | — |
| F12 | Invoice penerima/WA/kirim/follow-up, no nominals | Dropped-carried; additive post-finance microtask | plan |
| F15 | Fractional `spp` legacy (141666.67/116666.67) | Dropped-carried; rounding rule (EF.A.3 now in code) | — |
| F13 | Cover sessions: `absensi` 200 vs `absensiPengajar` 403 | RESOLVED after migration: Q1(a) bill+pay decided (`EVALUATION_LOG.md:237`), built as coverOf link (`COVER_SLOT` CS.B.1 Verified, `authorize.php` cover lane). Exemplar rows predate the fix — no data action. | — |
| Q8 | Zero payment samples; ledgers empty by design | Dropped-carried; synthetic fixtures + runbook only | user/team |
| Q1–Q7 | Frozen roster, semester/trainer-basis, Sains billing, EXPO, covers, collection | Dropped-carried; decisions first, no code | team |

## 4. Alignment (taste #68 — findings vs docs)

| Finding | IMPLEMENTATION | SCOPE_EXPANSION | SPP_BILLING | Other | Verdict |
|---|---|---|---|---|---|
| F1 window-miss (R21 tariff) | — | — | D8 map | EXEMPLAR D8 | already-planned, closed |
| F2 flat SMPN18 | — | — | D-SB7 null=flat | P1 Frozen | already-planned (P1/P2) |
| F3 role-vs-person | D2 joins-by-ID | A2 singular-asisten | — | R-TA14 tension | partially-planned → microtask |
| F5 Tridaya SD≠SMP | D2 | — | — | D8 distinct | already-planned, closed |
| F6 aliases | D2 display-only | — | — | F6_CONFIRM OPEN | already-planned handling, sign-off pending |
| F7 `billingForSekolah` standalone | — | — | F-SB1/D-SB10 | — | already-planned (invoice path) |
| F9 2 asisten | — | A2 singular | — | — | partially-planned → microtask |
| F12 invoice follow-up | — | B3 invoice | F-SB4/F-SB8 | SlipHonor Penerima | unplanned → future microtask |
| F13 covers | D2 fixed-set | — | D-SB13 Hadir-only | authorize gates | unplanned → microtask |
| F15 fractions | — | — | — | EF.A.3 rounded | fixed in code, verify |

No finding required a same-session app patch (taste #13 out-of-scope rule respected).

## 5. Simulation vs backend guarantees (testing-taste split)

- Simulated (client/read-only): all G1–G5 data paths walk clean; `billingForSekolah`/`financialData`/`honorForPengajarRow` recompute HIT; branch isolation renders via `branchScope.js` + `read.php` filters.
- Real backend guarantees still `Unverified` this run: live RBAC write probes (403 matrix), `invoices-generate.php` canonical run, `spp/honorPayments` settlement, full Playwright suite (119/143 baseline + drift D1–D4 in `EXEMPLAR_MIGRATION.md:371-372`; destructive legs last with backup-restore).
- Disposable-data rule: no shared-DB writes were made; D6 shared-seed deviation was NOT exercised (backup only read). Any future restore follows D6 mitigation (backup first, idempotent upserts, destructive last).

## 6. Remaining + quick wins

- `Unverified:` full E2E green + unrelated-failure triage; server contract battery (`npm run test:server`); live `authorize` 403 probes; invoice-generator canonical run.
- `Remaining (corrected 2026-10-09 — Q1–Q8 per-migration-numbering all answered, see §8):` F6 alias sign-off (field owner, `EXEMPLAR_F6_CONFIRM.md` OPEN); Q8 real payment samples (or standing accepted-Unverified); verification hygiene (full Playwright triage, `test:server`, live 403 probes, invoice-generator canonical run); new sign-offs surfaced since (credit auto-deduct memo-vs-deduct, carry-over join semantics).
- Quick wins (ranked): (1) ~~re-run G5 recompute from a restored disposable DB~~ DONE §7; (2) ~~extend `m52-verify`-class legs for `asistenIds`-union~~ DONE (DC.C.2, DRIFT_CLOSE D2 closed); (3) ~~add `peran` legs to recap/summary seeds~~ DONE (CS.B.2/CS.C.1, D3b fixed); (4) ~~pipeline-leg for Tarif-vs-Frozen Potensi~~ DONE (EF.D.1, DC.E D4 closed).

## 8. Correction 2026-10-09 — Q/F resolution sweep (docs + commits)

Prompt: user recalled team discussions on Q1–Q8/F-microtasks. Sweep finds the migration-era questions answered and the flagged microtasks built — my §§3–6 "with the team" lines were stale (migration doc frozen 09-25/27; answers recorded 09-26+ in `EVALUATION_LOG.md`). Mapping uses migration numbering (differs from EVAL numbering):

| Migration Q | Answer (EVAL Final Policy Confirmation) | Status |
|---|---|---|
| Q1 Frozen roster | EVAL-Q3: only SMPN 18, rest Tarif | ✅ decided + built (P1/P2 pipeline, EF.D.1 `1f9c294`) |
| Q2 Semester billing | EVAL-Q4: actuals, holiday unbilled | ✅ decided + built (EF.C.1 `fff0bf7`, generator Tarif branch `invoiceGenerator.php:121-159`) |
| Q3 Trainer-basis | EVAL-Q5: rate × sessions | ✅ decided + built (same) |
| Q4 SMP Sains | EVAL-Q6: follows SD roster for now | ✅ decided (data-model change deferred) |
| Q5 EXPO | EVAL-Q7: status prices, remarks never parsed | ✅ decided + pinned (EF.A.2 no-parse) |
| Q6 Covers | EVAL-Q1(a): bill school + pay substitute | ✅ decided + built (CS.B.1 coverOf, endpoint.protection 261/261) |
| Q7 Collection | EVAL-Q8: accepted Unverified | ✅ decided (accept-unverified IS the ruling) |
| Q8 Payment samples | EVAL-Q8: same | ✅ decided; samples still absent (correctly carried) |

F-microtasks: F3 per-session role ✅ built (CS.B.2/CS.C.1: `peran` on row, `honorForPengajarRow`, matrix row-first); F9 2nd asisten ✅ built (asistenIds union `penugasan.js:23,173-174,285`, picker DC.C.2); F12 invoice follow-up ✅ decided+built 09-27 (`InvoiceModal.jsx:149-170`, `tests/invoice-followup.spec.js`); F15 fractions ✅ fixed (EF.A.3 `Math.round`); F2 flat ✅ handled (Frozen branch byte-identical `invoiceGenerator.php:171`); F6 aliases ⏳ genuinely OPEN (all ☐, `RELEASE_GATES.md` G1 blocks prod billing data until sign-off).

Genuinely new open sign-offs (not migration Qs): credit auto-deduct memo-vs-deduct (TEAM_ROUND2 D-T2-5, EVAL_FINANCE item 15); carry-over join-into-payable semantics (`SB_FOLLOWUP_FIX.md:118`); slot-capacity vs occupant-overlap already Locked as occupant (DOUBLE_BOOKING D-DB1).

## 7. Addendum — disposable-DB G5 refresh (executed 2026-10-09, user-authorized)

Cycle: backup live → restore exemplar → recompute with real code → restore live back. TDD: count-check script watched FAIL on dev state (RED) then PASS on exemplar (GREEN).

- `Verified: g5-refresh-check.cjs on live dev -> exit 1, dev counts 1/11/11/2/0/0/4` (RED, discriminates)
- `Verified: mysqldump live -> live-pre-restore-20261009-123241.sql, 94,767 bytes, 21 tables` (test-guard True)
- `Verified: restore exemplar (DROP+CREATE, dump lacks IF NOT EXISTS) -> exit 0`
- `Verified: g5-refresh-check.cjs on restored -> exit 0, 2/20/397/20/70/138/14, ledgers 0` (GREEN, B1 exact)
- `Verified: node g5-recompute.mjs (real finance.js on restored rows) -> Sains 13750000/10mtg HIT, Sabang 9528750/9mtg HIT, SDM7 22050000/12mtg HIT, SMPN18 flat_legacy 4750000 HIT, configured 19 HIT, totalBebanHonor 6125000 HIT, labaRugi 0 HIT`
- `Verified: restore pre-restore dump -> exit 0; counts back to 1/11/11/2/0/0/4` (workspace as found, taste #33)
- `Verified: npm run test -> 35 files / 257 passed, 0 failures` (stable ×2 runs; discrepancy note below)
- G5 verdict refreshed and unchanged: SPP 19/19 HIT; honor recorded-rows 6,125,000 (miss vs role-aware expected stays -850k = F9 650k + F13 200k, both carried, no code change).

Discrepancy note (honest, unresolved): three `npm run test` runs earlier this session reported 49 files/322 tests; disk now holds 35 test files and two consecutive runs report 35/257 green. No test files were added/removed by this microtask (`git status` shows only the 2 docs from this session; teammate stash untouched per taste #13). Zero failures in every run. Possible transient concurrent-session files since removed, or reporter variance — recorded, not a regression.
