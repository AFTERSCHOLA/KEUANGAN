# Eval Finance Milestones — Microtask Chain (EF.A → EF.D)

**Companion to `docs/EVAL_FINANCE_PLAN.md`.** Decomposes the finance tail (category locks + hygiene, Payable, Payment + deferral, generator upgrade + dashboard-last switch) into strictly ordered microtasks. Each microtask must VERIFY before the next begins; a failing check becomes a bounded follow-up, not a widened edit (taste #3/#4). Later work does not start until gates pass. No app code changes in this pair yet — this chain is the build order for implementers.

**Source of truth for findings/decisions:** `EVAL_FINANCE_PLAN.md` §3 (F-EF1–F-EF6) and §4 (D-EF1–D-EF7). The chain below does not restate plan prose; each `FINDS`/`RULES` line cites the registry. Violated invariant for the whole chain (taste bug rule, one hypothesis): *earned honor and billed tuition share single-stage numbers, so cash shortage can only shrink what is owed and the dashboard can only repeat one of two disagreeing answers — F-EF5/F-EF6*; EF.A–EF.D is the single slice that tests it.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-EF references>
  RULES:   <R-EF codes + existing invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

**Gate exit criteria (the chain closes when all hold):**

1. SchoolForm shows Frozen/Tarif labels + effective-bill preview; Frozen roster defaults to SMPN 18 only (F-EF1 closed, D-EF1).
2. A test fails if any honor/billing path branches on `keterangan` text; flat rupiah outputs are whole integers (F-EF2/F-EF3 closed, D-EF2/D-EF3).
3. Payable per trainer per period derives from attendance + role, memo-only, legacy rows byte-identical, labaRugi untouched (F-EF5 partially closed, D-EF4).
4. Payment statuses Unpaid/Partially Paid/Paid derive as Payable − paid with deferral display-only; ledger stays append-only; no role broadened (D-EF6).
5. Generator bills Tarif per-meeting and Frozen flat with Terbit freeze intact; dashboard Potensi follows the invoice pipeline only after that (F-EF4/F-EF6 closed, D-EF5/D-EF7).
6. `npm test` + `php server/tests/entity.validation.php` + `php server/tests/endpoint.protection.php` + `php server/tests/reconcile.check.php` + `npm run build` green; unrelated failures labeled pre-existing with stash evidence (taste #9); original acceptance legs re-run before done (taste #10).
7. Every microtask carries `Verified: <command> -> <result>`; §11 write-back recorded; no `console.log` in `src/`, no build artifacts in `git status`; Q8 stays explicitly `Unverified` with owner.

---

## Gate EF.A — Category locks + hygiene (F-EF1–F-EF3; D-EF1–D-EF3)

### EF.A.1 Label category switch

```text
MICROTASK: Label category switch
  EDIT:    src/features/schools/SchoolList.jsx (SchoolForm toggle labels + effective-bill preview only),
           tests/sekolah-metode-pembayaran.spec.js (extend: label + preview legs)
  FINDS:   F-EF1; D-EF1
  RULES:   R-EF1, R-EF2, R-EF3, R-EF4, R-EF6; no schema change; Frozen default SMPN 18 only; preview is read-only math, never stored; deploy/ untouched
  DEPENDS: none (SB.C.1 toggle exists and is green; if red, stop and re-plan per taste drift rule)
  OUTCOME: an admin sees Flat/Beku vs Tarif-per-Pertemuan labels with a live estimate, and a Frozen pick stores metodePembayaran null.
  VERIFY:  npx playwright test tests/sekolah-metode-pembayaran.spec.js --workers=1 -> label strings found by exact name; preview updates on tarif edit; save + refresh rehydrates; zero pageerror
  DONE-IF: verify passes; only intended files changed
```

### EF.A.2 Pin remarks never parsed

```text
MICROTASK: Pin remarks never parsed
  EDIT:    src/lib/__tests__/finance-pengajar-honor.test.js (extend: EXPO-text rows price by status+role only; no app-code edit)
  FINDS:   F-EF2; D-EF2
  RULES:   R-EF1, R-EF6; status determines honor, keterangan is free text; this microtask adds the pin, changes no pricing path
  DEPENDS: EF.A.1
  OUTCOME: a future keterangan.includes branch breaks a test instead of silently changing pay.
  VERIFY:  npm test -- finance-pengajar-honor -> Hadir+EXPO prices full per role; Izin+any-text prices 0; grep gate: rg -n "keterangan\.(includes|indexOf|match)" src/lib/finance.js src/lib/trainerAttendance.js server/lib/invoiceGenerator.php -> 0 hits
  DONE-IF: verify passes; only intended files changed
```

### EF.A.3 Round flat rupiah

```text
MICROTASK: Round flat rupiah
  EDIT:    src/lib/finance.js (Math.round once at flat targetSpp/Potensi derivation only),
           src/lib/__tests__/finance-regression.test.js (extend: fractional-spp fixture pins whole rupiah)
  FINDS:   F-EF3; D-EF3
  RULES:   R-EF1, R-EF2, R-EF4, R-EF6; per-meeting path untouched (uses tarif directly); legacy history byte-identical except fraction cleanup on the two semester schools
  DEPENDS: EF.A.2
  OUTCOME: flat Potensi and per-school targets render whole rupiah with no fractional leakage.
  VERIFY:  npm test -- finance-regression -> semester-legacy fixture (141666.67-style spp) yields integer targets; legacy no-metode fixture otherwise byte-identical; per-meeting billing fixture unchanged
  DONE-IF: verify passes; only intended files changed
```

---

## Gate EF.B — Payable + Payment (F-EF5; D-EF4/D-EF6)

### EF.B.1 Derive honor payable

```text
MICROTASK: Derive honor payable
  EDIT:    src/lib/finance.js (pure honorPayable + memo wiring on the finance result; labaRugi lines untouched),
           src/lib/__tests__/finance-honor-payable.test.js (new: I/A split, legacy-no-peran regression, D1 memo invariance),
           src/features/reports/FinanceReport.jsx (memo block only: Honor payable per trainer)
  FINDS:   F-EF5; D-EF4
  RULES:   R-EF1, R-EF2, R-EF3, R-EF4, R-EF6; A -> 50k (D2), I -> owner's trainer.honor (R-TA3); rows without peran price legacy byte-identically; payable never enters labaRugi; entry assumption COVER_SLOT CS.C.1 provides peran — without it this prices legacy rows only (record, do not block on CS red; re-plan if assumption breaks)
  DEPENDS: EF.A.3
  OUTCOME: each trainer shows earned payable split by role while cash-basis profit stays exactly as before.
  VERIFY:  npm test -- finance-honor-payable -> Senior-I 100k, same-person-A 50k, external-A 50k, legacy-no-peran per-person unchanged; labaRugi identical with and without the memo wired
  DONE-IF: verify passes; only intended files changed
```

### EF.B.2 Settle honor payments

```text
MICROTASK: Settle honor payments
  EDIT:    src/lib/honor.js (new pure honorSettlement: payable/dibayar/sisa/credit/status/deferral-note),
           src/lib/__tests__/honor-settlement.test.js (new: Unpaid/Partial/Paid + deferral-never-reduces-payable + distinct-value fixtures),
           src/features/payments/PaymentTable.jsx (status badge + Menunggu-kas line only; no ledger write path touched)
  FINDS:   F-EF5; D-EF6
  RULES:   R-EF1, R-EF2, R-EF3, R-EF4, R-EF5, R-EF6; existing honor_payments ledger append-only (no update/delete path added); deferral display-only; privilege matrix unchanged (AP.D.1 as-is); Q8 real-sample rows stay Unverified with manual runbook (taste testing #19) instead of forced green
  DEPENDS: EF.B.1
  OUTCOME: a trainer's period reads Unpaid, Partially Paid with remaining balance, or Paid, and a cash-short note never shrinks the recorded payable.
  VERIFY:  npm test -- honor-settlement -> 0 paid = Unpaid sisa penuh; partial = Partially Paid sisa benar; full = Paid sisa 0; overpay = Paid + credit; deferral fixture keeps payable intact; php server/tests/endpoint.protection.php -> honor write matrix unchanged
  DONE-IF: verify passes; only intended files changed
```

---

## Gate EF.C — Generator upgrade (F-EF4; D-EF5 + Q4/Q5/Q6)

### EF.C.1 Bill per-meeting in generator

```text
MICROTASK: Bill per-meeting in generator
  EDIT:    server/lib/invoiceGenerator.php (Tarif branch: tarif × pertemuanAktual × basis-count; Frozen null branch: legacy flat byte-identical),
           server/tests/invoice-billing.check.php (new: Tarif/Frozen/semester/trainer-basis/SMP-Sains-single-record/parity-with-billingForSekolah cases),
           src/lib/__tests__/finance-billing.test.js (extend: generator-parity expectations mirror billingForSekolah)
  FINDS:   F-EF4; D-EF5
  RULES:   R-EF1, R-EF4, R-EF5, R-EF6; pertemuanAktual predicate identical to billingForSekolah (Hadir only, D-SB13; cover = new Hadir row); Q4 semester = actuals (holiday unrecorded = unbilled); Q5 trainer-basis = no pupil multiplier; Q6 SMP Sains single record × SD roster; Terbit freeze + R-SB6 same-school + append-only untouched; no new tables
  DEPENDS: EF.B.2
  OUTCOME: the canonical generator emits per-meeting totals for Tarif schools and legacy-identical totals for Frozen schools on the same fixture billingForSekolah prices.
  VERIFY:  php server/tests/invoice-billing.check.php -> Tarif-siswa, Tarif-trainer, Frozen-flat, semester-actuals, SMP-Sains-single-record all HIT; Frozen legacy output byte-identical to pre-change generator; php server/tests/entity.validation.php + php server/tests/reconcile.check.php -> green
  DONE-IF: verify passes; only intended files changed
```

---

## Gate EF.D — Dashboard-last switch + write-back (F-EF6; D-EF7)

### EF.D.1 Switch dashboard last and write back

```text
MICROTASK: Switch dashboard last and write back
  EDIT:    src/features/reports/FinanceReport.jsx + src/features/overview/OverviewCards.jsx (Potensi per school: invoice-pipeline figure when Tarif, spp × pupils when Frozen; totals sum per school),
           src/lib/__tests__/finance-regression.test.js (extend: exemplar pins Potensi 53,535,011 pre-switch vs pipeline post-switch; premature-switch fails),
           docs/EVAL_FINANCE_PLAN.md + docs/EVAL_FINANCE_MILESTONES.md (Verified lines + status),
           docs/SCOPE_EXPANSION_MILESTONES.md (append closure row only — no renumbering),
           docs/SPP_BILLING_PLAN.md (append §10 upgrade note only — no SB history rewrite)
  FINDS:   F-EF1–F-EF6
  RULES:   R-EF6; full loop npm test + php server/tests/entity.validation.php + php server/tests/endpoint.protection.php + php server/tests/reconcile.check.php + npm run build; unrelated failures labeled pre-existing with git-stash evidence (taste #9); re-run original acceptance (EF.A.1 label leg + EF.B.1 payable leg + EF.B.2 settlement leg + EF.C.1 generator leg) before declaring done (taste #10); no console.log in src/ (grep gate), git status clean of artifacts; deploy/ only via npm run build:deploy; Q8 remains explicitly Unverified with owner (real samples or accepted-unverified)
  DEPENDS: EF.C.1
  OUTCOME: the dashboard reads the same pipeline the invoices bill from, with the exemplar two-answers gap closed and the source docs reflecting what shipped.
  VERIFY:  npm test -> green; npm run build -> green; node -e ID check -> every F-EF/D-EF/R-EF cited below exists in EVAL_FINANCE_PLAN.md
  DONE-IF: verify passes; only intended files changed
```

---

## Ordering rationale

- **EF.A before everything:** labels, no-parse pin, and rounding are falsifiable without any derivation or server change; building money math on unpinned inputs repeats P1/P2.
- **EF.A.2 before EF.A.3:** the no-parse invariant must hold before touching any finance derivation, so a rounding diff can only come from arithmetic, not hidden text logic.
- **EF.B.1 before EF.B.2:** Payable must exist before Payment settles against it; pricing unpersistable roles is untestable (taste #4).
- **EF.B before EF.C:** per-trainer earned totals are independent of the school-billing path; the generator upgrade serializes after the honor side is green (EVALUATION_LOG Stages 5–6 depend on Stages 2–3).
- **EF.C before EF.D:** the dashboard switches source only after the generator upgrade is green — dashboard-last (D-EF7/D-CS7); write-back only after every behavior above is green.

## Deferred with owners

| Item | Owner / venue | Why deferred |
|---|---|---|
| Slot-pick, cover link, per-session `peran`, multi-assistant, externals + recorder, role-first math | COVER_SLOT chain CS.A–CS.C (D-CS1–D-CS6) | Fully owned there; consumed here as entry assumption only (taste #53) |
| Invoice-level SPP payments / carry-over / credit rollover / Terbit mechanics | SPP_BILLING chain SB.B.4/SB.C.2 (D-SB8/D-SB11/R-SB6) | Closed and owned; read-only here |
| Trainer inline creation of externals | Future amendment + abuse review | Would broaden trainer write (taste #33) |
| Leavers / transfers with outstanding payable/credit | Manual admin handling | No genuine case yet (EVALUATION_LOG out-of-scope) |
| Q8 real samples (installments, carry-over, payouts) | Team data or accepted Unverified | No ground truth to HIT (I4); synthetic fixtures + runbook only |

## Completion contract

```text
labels + no-parse pin + rounding -> payable (memo, labaRugi untouched)
  -> payment settlement + display-only deferral -> per-meeting generator
  -> dashboard-last switch + regression + build + write-back (Q8 stays Unverified)
```
