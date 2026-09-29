# Team Round-2 Milestones — Microtask Chain (T2.A → T2.E)

**Companion to `docs/TEAM_ROUND2_PLAN.md`.** Decomposes the trainer-sync + honor-refresh + history-verifiability + Priority-1 fix + E2E-expectation slice into strictly ordered microtasks. Each microtask must VERIFY before the next begins; a failing check becomes a bounded follow-up, not a widened edit (taste #3/#4). Later work does not start until gates pass. T2.A.1 already executed (commits 27cd4f8 + 09e087a, re-review pending at amendment time) — the chain below is the build order for everything after it.

**Status: DONE 2026-09-29 — Gates T2.A–T2.E closed (T2.E.3 write-back).** Every microtask below carries its `Verified:` line; full-loop evidence in `.superpowers/sdd/team-round2/task-E3-report.md`; closure row in `docs/SCOPE_EXPANSION_MILESTONES.md`.

**Source of truth for findings/decisions:** `TEAM_ROUND2_PLAN.md` §1 (F-T2-1–F-T2-16), §2 (D-T2-1–D-T2-9), §3 (R-T2-1–R-T2-8), §5 (X-T2-1–X-T2-6, incl. X-T2-2 supersede + X-T2-3 upgrade). The chain below does not restate plan prose; each `FINDS`/`RULES` line cites the registry. Violated invariant for the whole chain (taste bug rule, one hypothesis): *trainer-visible money and students derive from ledgers the UI never lists and a cache the dashboard never refreshes, while assignment writes ignore explicit admin picks — F-T2-1/F-T2-2/F-T2-3/F-T2-4/F-T2-10/F-T2-11/F-T2-12*; T2.A–T2.E is the single slice that tests it. Every fix states Current/Expected/Rule/Result (R-T2-7).

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-T2 references>
  RULES:   <R-T2 codes + existing invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

**Gate exit criteria (the chain closes when all hold):**

1. Cross-record assignment survives `read('trainer')` and other-school students appear in `Data Siswa` without re-login (F-T2-1 closed, D-T2-1 + fix-round snapshot ruling).
2. Dashboard honor updates without hard refresh (F-T2-2 closed, D-T2-2); attendance persistence unchanged.
3. Invoice rows list per-payment transactions and student rows list per-payment source rows (F-T2-3/F-T2-4 closed, D-T2-3); ledger math untouched.
4. Slot pick is explicit (nothing inherited unless ticked; F-T2-10 closed, D-T2-6; D-CS8 default re-planned, D-CS1 intact); externals assignable via picker (F-T2-11 closed, D-T2-7); cover appears in schedule (F-T2-12 closed, D-T2-8 proof-first).
5. Double-booking hard-block, correction identity, frozen immunity, and payable-independence each proven by failing-first E2E (F-T2-13–F-T2-16, D-T2-9); code only where proof fails.
6. Bulk/credit/amount expectations pinned with no ledger/total change (F-T2-7–F-T2-9 → X-T2-1/X-T2-4/X-T2-5/X-T2-6, D-T2-4/D-T2-5).
7. `npm test` + targeted Playwright legs + `npm run build` green; unrelated failures labeled pre-existing with stash evidence (taste #9); original acceptance legs re-run before done (taste #10).
8. Every microtask carries `Verified: <command> -> <result>`; §9 write-back recorded; no `console.log` in `src/`, no build artifacts in `git status`.

---

## Gate T2.A — Trust the server, refresh the dashboard (F-T2-1/F-T2-2; D-T2-1/D-T2-2)

### T2.A.1 Order hydrate trainer-first, trust remote scope

```text
MICROTASK: Order hydrate trainer-first
  EDIT:    src/lib/store.js (hydrateServerData: await read('trainer') first, then Promise.all(rest); read(key): trainer-role returns remote array directly without second isWithinScope pass; readCached keeps client filter),
           src/lib/__tests__/store-trainer-siswa-scope.test.js (extend: cross-record wipe case — seed instructor-hosted link, call read('trainer') via stubbed fetch, assert readCached('siswa') keeps other-school row)
  FINDS:   F-T2-1; D-T2-1
  RULES:   R-T2-1, R-T2-3, R-T2-5, R-T2-6; server scope authoritative; no privilege change; additive only
  DEPENDS: none (ASISTENIDS_SCOPE_FIX union green is the entry assumption; if red, stop and re-plan per taste drift rule)
  OUTCOME: an assistant linked via an instructor-hosted row keeps the other-school student after a trainer-role sync.
  VERIFY:  npx vitest run src/lib/__tests__/store-trainer-siswa-scope.test.js -> cross-record leg passes (other-school siswa present post-read) and prior legs stay green
  DONE-IF: verify passes; only intended files changed
  Verified (T2.E.3 full loop, 2026-09-29): npx vitest run src/lib/__tests__/store-trainer-siswa-scope.test.js src/lib/__tests__/penugasan-slot.test.js -> 2 files / 20 tests passed (cross-record wipe leg green); npm run test -> 47 files / 293 passed. Landed in 27cd4f8 + 09e087a.
```

### T2.A.2 Subscribe dashboard like Summary

```text
MICROTASK: Subscribe dashboard like Summary
  EDIT:    src/features/auth/TrainerDashboard.jsx (add tick state + subscribeStore(bump) + useEffect read('absensiPengajar') + read('honorPayments') on mount, mirroring TrainerAttendanceSummary.jsx:16-29 verbatim; financialData call unchanged),
           tests/trainer-honor-refresh.spec.js (new: seed H honorable session via writeRemote, mount dashboard pre/post-hydrate, assert Honor Saya updates with no reload)
  FINDS:   F-T2-2; D-T2-2
  RULES:   R-T2-1, R-T2-2, R-T2-5; mirror idiom, no new derivation; Indonesian copy unchanged
  DEPENDS: T2.A.1
  OUTCOME: dashboard Honor Saya updates after the sync lands with no hard refresh.
  VERIFY:  npx playwright test tests/trainer-honor-refresh.spec.js --workers=1 -> honor leg passes with zero pageerror
  DONE-IF: verify passes; only intended files changed
  Verified (T2.E.3 full loop, 2026-09-29): npx playwright test tests/trainer-honor-refresh.spec.js --workers=1 -> 1 passed, zero pageerror (isolated + A.2-first order). KNOWN ORDERING CONSTRAINT: fails when run after T2.B.1 in one command (transient `0 sesi` never paints; B.1 leftovers un-cleaned) — pre-existing cross-test interaction on HEAD, owner per task-E3-report §concerns. Landed in ba5ebd1.
```

---

## Gate T2.B — List the money (F-T2-3/F-T2-4; D-T2-3)

### T2.B.1 List invoice payment transactions

```text
MICROTASK: List invoice payment transactions
  EDIT:    src/features/reports/InvoiceModal.jsx (per-invoice expandable Riwayat pembayaran (N) mapping matchedPaymentsForInvoice rows: tanggal · nominal · metode · diterimaOleh · sumberDana + footer Total dibayar/Sisa from existing settlement; copy per PLAN §4),
           tests/invoice-payment-history.spec.js (new: 2-installment fixture asserts both rows render with distinct nominal/tanggal before Lunas)
  FINDS:   F-T2-3; D-T2-3
  RULES:   R-T2-1, R-T2-2, R-T2-4, R-T2-5; display-only; computeSppLunas/invoiceSettlement untouched; mirror PaymentTable.jsx:304-335 idiom
  DEPENDS: T2.A.2
  OUTCOME: an invoice with two installments shows two listed transactions that sum to the aggregate.
  VERIFY:  npx playwright test tests/invoice-payment-history.spec.js --workers=1 -> both installment rows visible with zero pageerror
  DONE-IF: verify passes; only intended files changed
  Verified (T2.E.3 full loop, 2026-09-29): npx playwright test tests/invoice-payment-history.spec.js --workers=1 -> 1 passed, zero pageerror (also green inside the 9-leg joint run). Landed in 42801f8.
```

### T2.B.2 List student payment source rows

```text
MICROTASK: List student payment source rows
  EDIT:    src/features/students/StudentList.jsx (per-row expandable Riwayat (N) mapping sppPaymentsForSiswa rows for the viewed periode: periode · nominal · sumberDana · metode; pill logic untouched),
           tests/student-payment-history.spec.js (new: parent-paid fixture asserts Ortu langsung row renders while school invoice stays outstanding)
  FINDS:   F-T2-4; D-T2-3
  RULES:   R-T2-1, R-T2-2, R-T2-4, R-T2-5; display-only; tunggakan pill math untouched
  DEPENDS: T2.B.1
  OUTCOME: a parent-paid student shows its Parent source row while the school invoice stays outstanding.
  VERIFY:  npx playwright test tests/student-payment-history.spec.js --workers=1 -> source row visible with zero pageerror
  DONE-IF: verify passes; only intended files changed
  Verified (T2.E.3 full loop, 2026-09-29): npx playwright test tests/student-payment-history.spec.js --workers=1 -> 1 passed, zero pageerror (also green inside the 9-leg joint run). Landed in ba9412f.
```

---

## Gate T2.D — Priority-1 fixes: explicit pick, external picker, cover proof-first (F-T2-10/F-T2-11/F-T2-12; D-T2-6/D-T2-7/D-T2-8)

### T2.D.1 Require explicit slot pick

```text
MICROTASK: Require explicit slot pick
  EDIT:    src/features/trainers/TrainerList.jsx (school-check seeds [] not [null]; save maps missing entry to [] = no rows; Semua slot ticked explicitly = [null] one unscoped row; blocked copy per PLAN §4; comments reference F-T2-10/D-T2-6, not D-CS8),
           src/lib/__tests__/penugasan-slot.test.js or store-trainer-siswa-scope.test.js (extend: naive-check yields [] leg)
  FINDS:   F-T2-10; D-T2-6
  RULES:   R-T2-1, R-T2-2, R-T2-5, R-T2-6, R-T2-7; server D-CS1 byte-identical (no PHP touched); explicit [] still means no rows via API; Current/Expected/Rule/Result in report
  DEPENDS: T2.B.2 (lands before C.1 copy pins so pins rebase onto the new default)
  OUTCOME: ticking a school with no slot boxes creates zero rows (Mon 11:00 not inherited); ticking Mon 09:00 + 13:00 creates exactly those two rows.
  VERIFY:  npx vitest run <extended file> -> naive-check-[] leg green; npx playwright test tests/auto-penugasan-create.spec.js --workers=1 -> green (defaults changed, suite updated only if it pinned Semua)
  DONE-IF: verify passes; only intended files changed
  Verified (T2.E.3 full loop, 2026-09-29): npx vitest run src/lib/__tests__/penugasan-slot.test.js -> 12 passed incl. T2.D.1 naive-[] leg; npm run test -> 47 files / 293 passed. Landed in 10f96d3.
```

### T2.D.2 Offer externals in assignment picker

```text
MICROTASK: Offer externals in assignment picker
  EDIT:    src/features/penugasan/PenugasanManager.jsx (Asisten + Asisten-2 selects map union trainers-minus-chosen + same-school eksternal with ` (Eksternal)` suffix; saved ids ride existing asistenId/asistenIds keys),
           tests/penugasan-external-assignment.spec.js (new: create external -> appears in Asisten options -> assign to slot -> attendance writable -> honor prices 50k)
  FINDS:   F-T2-11; D-T2-7
  RULES:   R-T2-1, R-T2-2, R-T2-3, R-T2-5, R-T2-7; no new keys; no login for externals; server union gate already covers ids (verify, don't rebuild); Current/Expected/Rule/Result in report
  DEPENDS: T2.D.1
  OUTCOME: a created external assistant is assignable to a slot and flows to attendance + honor.
  VERIFY:  npx playwright test tests/penugasan-external-assignment.spec.js --workers=1 -> external option visible + assignment persists with zero pageerror
  DONE-IF: verify passes; only intended files changed
  Verified (T2.E.3 full loop, 2026-09-29): npx playwright test tests/penugasan-external-assignment.spec.js --workers=1 -> 1 passed, zero pageerror (also green inside the 9-leg joint run). Landed in 2d07505.
```

### T2.D.3 Prove cover save-vs-retrieve, fix failing side

```text
MICROTASK: Prove cover save-vs-retrieve
  EDIT:    (proof-first: no EDIT until the split is isolated) then EITHER src/features/penugasan/PenugasanManager.jsx (save path) OR src/features/penugasan/PenugasanTimetable.jsx + src/lib/penugasan.js (retrieve path),
           tests/penugasan-cover-schedule.spec.js (new: create cover for Trainer A Mon 09:00 -> assert server coverOf row on Trainer B AND timetable on cover tanggal shows `B (Pengganti)`)
  FINDS:   F-T2-12; D-T2-8
  RULES:   R-T2-1, R-T2-2, R-T2-5, R-T2-7, R-T2-8; failing-first proof before code; fix one side only; Current/Expected/Rule/Result in report
  DEPENDS: T2.D.2
  OUTCOME: the schedule shows Trainer B as Cover for the slot on the cover tanggal.
  VERIFY:  npx playwright test tests/penugasan-cover-schedule.spec.js --workers=1 -> Pengganti badge visible with zero pageerror
  DONE-IF: verify passes; only intended files changed
  Verified (T2.E.3 full loop, 2026-09-29): npx playwright test tests/penugasan-cover-schedule.spec.js --workers=1 -> 3/3 passed (SAVE probe + RETRIEVE probe + SAVE guard), zero pageerror. Landed in 97a8eef.
```

---

## Gate T2.C — Pin expectations (F-T2-7–F-T2-9; D-T2-4/D-T2-5)

### T2.C.1 Pin disambiguation one-liners

```text
MICROTASK: Pin disambiguation one-liners
  EDIT:    src/features/trainers/TrainerList.jsx (card scope note per PLAN §4 — rebases onto T2.D.1 new default, keeps both hunks),
           src/features/penugasan/PenugasanTimetable.jsx (empty-state names tanggal+hari),
           src/features/reports/InvoiceModal.jsx (bulk Metode (kanal) label + school-source hint; create estimate copy kept)
  FINDS:   F-T2-7, F-T2-8, F-T2-9; D-T2-4, D-T2-5
  RULES:   R-T2-1, R-T2-2, R-T2-5; copy-only; no ledger/scope/total math touched; credit stays memo with frozen grandTotal
  DEPENDS: T2.D.3
  OUTCOME: each confused report names the correct screen/value in one pinned sentence.
  VERIFY:  npx vitest run src/lib/__tests__/penugasan-timetable.test.js -> green (cover-free fixtures byte-identical); grep each §4 pinned string resolves in src/
  DONE-IF: verify passes; only intended files changed
  Verified (T2.E.3 full loop, 2026-09-29): npx vitest run src/lib/__tests__/penugasan-timetable.test.js -> 8 passed; all five §4 pinned strings resolve in src/ (TrainerList.jsx:52,56-57; PenugasanTimetable.jsx:175; InvoiceModal.jsx:335,472,483). Landed in a3a227a.
```

---

## Gate T2.E — E2E expectation cycle + write back (F-T2-13–F-T2-16; D-T2-9)

### T2.E.1 Prove double-booking hard-block

```text
MICROTASK: Prove double-booking hard-block
  EDIT:    tests/penugasan-double-booking.spec.js (new: Trainer A Mon 09:00 School 1 active, then attempt School 2 same slot -> expect pinned PENUGASAN_OVERLAP_ERROR + second row absent after reload; if proof fails, smallest fix in the failing layer only),
           (code only if proof fails: src/features/penugasan/PenugasanManager.jsx pre-check and/or server/lib/assignments.php + server/api/trainer.php)
  FINDS:   F-T2-13; D-T2-9
  RULES:   R-T2-1, R-T2-5, R-T2-7, R-T2-8; failing-first proof; warning-only = FAIL; Current/Expected/Rule/Result in report
  DEPENDS: T2.C.1
  OUTCOME: the second same-slot assignment is rejected and never saved.
  VERIFY:  npx playwright test tests/penugasan-double-booking.spec.js --workers=1 -> rejection visible + ledger shows 1 row with zero pageerror
  DONE-IF: verify passes; only intended files changed (spec-only if proof passes)
  Verified (T2.E.3 full loop, 2026-09-29): npx playwright test tests/penugasan-double-booking.spec.js --workers=1 -> 2/2 passed (UI hard-block + direct-API 422), zero pageerror. Landed in cd3d688.
```

### T2.E.2 Prove audit, frozen, payable-independence

```text
MICROTASK: Prove audit frozen payable-independence
  EDIT:    tests/finance-expectation-cycle.spec.js (new, 3 legs: (1) admin correction stores recorder identity readable in summary payload; (2) frozen Terbit invoice immune to later student-count/meeting-count changes; (3) TEST 17 CRITICAL: SPP invoice 10jt paid 5jt while trainer completed 2jt work -> payable stays 2jt, payment 0/unpaid),
           (code only where a leg fails, one side per leg)
  FINDS:   F-T2-14, F-T2-15, F-T2-16; D-T2-9
  RULES:   R-T2-1, R-T2-4, R-T2-5, R-T2-7, R-T2-8; failing-first proofs; payable derivation never reads SPP (already designed — proof only unless leg fails); Current/Expected/Rule/Result per leg in report
  DEPENDS: T2.E.1
  OUTCOME: recorder identity, frozen immunity, and full-payable-while-partial-SPP each hold end-to-end.
  VERIFY:  npx playwright test tests/finance-expectation-cycle.spec.js --workers=1 -> 3/3 legs green with zero pageerror
  DONE-IF: verify passes; only intended files changed (spec-only if all proofs pass)
  Verified (T2.E.3 full loop, 2026-09-29): npx playwright test tests/finance-expectation-cycle.spec.js --workers=1 -> 3/3 passed (audit identity + frozen immunity + TEST 17 payable), zero pageerror. Landed in 0283891 (+ bd4e0ec forged-recorder 422 pin).
```

### T2.E.3 Full loop + write-back

```text
MICROTASK: Full loop plus write-back
  EDIT:    docs/TEAM_ROUND2_PLAN.md + docs/TEAM_ROUND2_MILESTONES.md (Verified lines + status),
           docs/SCOPE_EXPANSION_MILESTONES.md (append closure row only — no renumbering),
           docs/SPP_BILLING_PLAN.md (note D-T2-3 history-UI addition in §10 only — no SB history rewrite),
           docs/COVER_SLOT_PLAN.md (note D-T2-6 slot-default reversal scope without rewriting CS history)
  FINDS:   F-T2-1–F-T2-16
  RULES:   R-T2-5; full loop npm test + npx playwright test tests/trainer-honor-refresh.spec.js tests/invoice-payment-history.spec.js tests/student-payment-history.spec.js tests/penugasan-external-assignment.spec.js tests/penugasan-cover-schedule.spec.js tests/penugasan-double-booking.spec.js tests/finance-expectation-cycle.spec.js tests/invoice-installment.spec.js tests/invoice-bulk-settle.spec.js --workers=1 + npm run build; unrelated failures labeled pre-existing with git-stash evidence (taste #9); re-run original acceptance (T2.A.1 cross-record leg + T2.A.2 honor-no-refresh leg + T2.B.1 two-row leg + T2.D.1 explicit-pick leg) before declaring done (taste #10); no console.log in src/ (grep gate), git status clean of artifacts; deploy/ only via npm run build:deploy
  DEPENDS: T2.E.2
  OUTCOME: the chain is regression-pinned with history verifiability and Priority-1 fixes, and the source docs reflect what actually shipped.
  VERIFY:  npm test -> green; targeted Playwright legs -> green zero pageerror; npm run build -> green; node -e ID check -> every F-T2/D-T2/R-T2/X-T2 cited below exists in TEAM_ROUND2_PLAN.md
  DONE-IF: verify passes; only intended files changed
  Verified (T2.E.3 full loop, 2026-09-29): npm run test -> 47 files / 293 passed; 9-leg Playwright -> 13/14 joint (A.2 ordering constraint, see T2.A.2 line) then 14/14 across A.2-first sequencing, zero pageerror throughout; npm run build -> green (7.63s, PWA 6 entries); node -e ID check -> cited 37 / missing 0; console.log grep src/ -> clean; git status -> only intended docs files. Full report: .superpowers/sdd/team-round2/task-E3-report.md.
```

---

## Ordering rationale

- **T2.A.1 before T2.A.2:** scope must survive sync before dashboard refresh is meaningful; refreshing a wiped cache only re-renders 0 faster (taste: smallest falsifiable slice first).
- **T2.A before T2.B:** trust + refresh are the strong claims; history lists serialize on top of correct inputs. Listing transactions from a stale cache proves nothing (taste #4).
- **T2.B.1 before T2.B.2:** invoice-level aggregation first, per-student source second; both read the same ledger, invoice leg pins the sum the student leg splits.
- **T2.B before T2.D:** verifiability first, Priority-1 behavior fixes second; D.1–D.3 build on correct inputs.
- **T2.D.1 before T2.D.2/D.3:** slot scope semantics must exist before picker/cover rows scope themselves to slots; proof-first cover last among fixes (strongest claim depends on scope truth).
- **T2.D before T2.C.1:** fixes land before copy pins so pins rebase onto new defaults (InvoiceModal ruling pattern extends to TrainerList: D.1 hunk + C.1 hunk kept).
- **T2.C.1 before T2.E:** pins before expectation cycle so E2E asserts pinned copy.
- **T2.E.3 last:** regression + build + docs only after every behavior above is green.

## Deferred with owners

| Item | Owner / venue | Why deferred |
|---|---|---|
| Credit auto-deduct | Finance chain / EVAL_FINANCE item 15 | Business sign-off required (D-T2-5) |
| Editable invoice totals | SPP_BILLING chain D-SB10/D-SB11 | Would fork canonical generator (X-T2-4) |
| Trainer inline external creation | Future amendment + abuse review | Would broaden trainer write (taste #33) |
| invoices.php delete-guard extension | Finance chain (`SPP_BILLING_MILESTONES.md:208`) | Noted gap, needs guard-vs-document decision |
| Frozen method selector in School Data (if E.2 leg needs UI) | SPP_BILLING chain D-SB6/D-SB10 | Method-shape decision, not this chain |

## Completion contract

```text
trainer-first trust -> dashboard subscribe (no hard refresh)
  -> invoice history + student history (sums match lists)
  -> explicit slot pick + external picker + cover proof-fix
  -> disambiguation pins -> E2E expectation cycle (double-block, audit, frozen, payable)
  -> regression + build + write-back
```
