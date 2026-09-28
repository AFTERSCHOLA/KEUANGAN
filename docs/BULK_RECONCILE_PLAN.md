# Bulk Reconcile Plan — school bulk settlement without overwriting parent source

**Status:** DRAFT 2026-09-29 — no microtask executed. Short-task amendment doc per taste #69 (single file, no new `*_MILESTONES.md` pair).
**Position:** Amends `SPP_BILLING_PLAN.md` D-SB8 (school-level reconciliation) with the per-pupil propagation rule D-SB8 never specified. It does **not** replace `IMPLEMENTATION_PLAN.md`, `SCOPE_EXPANSION_PLAN.md`, `SCOPE_EXPANSION_PRIVILEGES.md`, `SPP_BILLING_PLAN.md` / `SPP_BILLING_MILESTONES.md`, or `EVAL_FINANCE_PLAN.md` (item 15 credit automation stays a logged GAP there). When BR.2 closes, §7 records completion back on the source docs.
**Contract order:** `docs/UNIVERSAL.md` (primary contract, read first) → `docs/IMPLEMENTATION_PLAN.md` Part 2 → `docs/SCOPE_EXPANSION_PLAN.md` + `docs/SCOPE_EXPANSION_PRIVILEGES.md` → `docs/SPP_BILLING_PLAN.md` §4 (D-SB8/D-SB12/R-SB1/R-SB6) → this file.
**Goal:** one sentence — a school bulk payment settles only unsettled pupils and never rewrites who paid for an already-settled pupil.
**Falsifiable check for this doc:** every `file:line` cited below exists, and `git status` shows only this file as new.

---

## 1. Finding (F-BR1)

**Bulk settlement has no propagation rule.** Proven 2026-09-29 against `docs/exemplar/afterschola_t3_test.sql` (isolated scratch DB, 397 pupils, 0 finance-ledger rows — no bulk ground truth exists anywhere) plus a 9/9 exemplar-backed vitest gate (since removed per taste #15):

- `computeSppLunas()` (`src/lib/sppPayments.js:64-76`) sums only rows with `p.siswaId === siswaId`, so an invoice-level bulk row (`siswaId: null`, the only bulk shape the server accepts today per `server/validation/entities.php:558-594`) is **invisible** to student pills — B/C would *not* reconcile. No UI writes `invoiceId` on payments at all (`SppPaymentModal.jsx` never passes it; only `newSppPayment` accepts it at `sppPayments.js:16,34`; the sole writer-shaped UI is the per-siswa modal).
- `siswa.sppLunas` is a boolean map with no source field, so "Source remains Parent" is unrepresentable in state — it can only hold by construction (never minting a competing row), never by storage.
- `matchedPaymentsForInvoice()` (`src/lib/invoices.js:180-213`) matches an `invoiceId` row exactly once (first branch), so per-pupil rows carrying `invoiceId` are double-count-safe — but nothing mints them.

---

## 2. Decision (D-BR1, concrete pick, Locked on acceptance)

**Skip-settled per-pupil mint.** A school bulk settlement for one invoice mints one `sppPayments` row per **unsettled** (siswa, periode) cell covered by the invoice, and nothing else:

- Cell tarif = numeric `siswa.sppOverride` ?? `sekolah.spp` (override-aware, same source the generator groups by in `server/lib/invoiceGenerator.php:174-182`).
- Cell remaining = tarif − Σ existing rows for that (siswa, periode); mint nominal = remaining; **skip when remaining ≤ 0** (already-settled pupils — e.g. parent-paid A — get no row, so their ledger keeps parent rows only and any source read stays "Parent" by construction).
- Every minted row carries `{ siswaId, invoiceId, sekolahId, periode, sumberDana: 'sekolah' }` (`metode` + `diterimaOleh` + `tanggalBayar` from the dialog, same required-receiver idiom as `SppPaymentModal.jsx:50-54`); a bare `siswaId: null` row for the same settlement is **forbidden** (it would double-count against the minted rows in `invoiceSettlement`).
- Bulk never overpays: minted nominal is exactly remaining (overpay stays possible only via manual per-siswa rows → item-15 credit path, unchanged).
- Source display (no schema change): new pure `sumberPelunasan({ siswaId, periode, payments, tarif })` → `sumberDana` of the threshold-crossing row in (`tanggalBayar`, `id`) order, else `null`. Pills stay boolean; `computeSppLunas` callers untouched.
- Idempotency: confirm dialog previews the mint count (`Buat N baris pelunasan sekolah Rp X untuk invoice …?`); re-running settles nothing new (all cells skip) — second run must write 0 rows.

Considered-and-rejected: (a) bare invoice-level row + teach `computeSppLunas` to allocate shares — allocation basis ambiguous, rewrites pill derivation history (R-SB3 risk); (b) `sumberDana` column on `siswa.sppLunas` — schema change + migration for a concern the ledger already records (ledger stays single source of truth, R-SB1/R-SB2).

---

## 3. Rules (R-BR)

- **R-BR1** Append-only (R-SB1): mint = new rows via existing `writeRemote('sppPayments', …)` → `validateSppPayment` (invoiceId+siswaId + R-SB6 same-school check already enforced, `entities.php:571-582`). No server change, no new endpoint.
- **R-BR2** Additive only: missing keys read as legacy; no renames; `computeSppLunas`/`invoiceSettlement` untouched.
- **R-BR3** Privilege unchanged (taste #33, R-SB5): bulk UI superadmin-only, mirroring the invoice write role (`InvoiceModal.jsx:50-51`); server 403s anyone else.
- **R-BR4** Indonesian copy pinned (§4); `ConfirmDialog` + `Ya, Lanjutkan` idiom mirrored from `InvoiceModal.jsx:115-119,195`.
- **R-BR5** Verification language `Verified: <command> -> <result>` / `Unverified:` (UNIVERSAL); narrowest check immediately after the first edit (taste #4); no `console.log` in `src/`, `git status` shows only intended files (taste #20).

---

## 4. Microtasks (strictly ordered; N+1 starts only when N's VERIFY passes)

```text
MICROTASK BR.1: pure preview + source helpers
  EDIT:    src/lib/sppPayments.js (+ src/lib/__tests__/spp-bulk.test.js)
  RULES:   R-BR1, R-BR2, R-BR5
  OUTCOME: bulkSettlePreview({ invoice, siswa, sekolah, sppPayments }) ->
           per-cell [{ siswaId, periode, tarif, paid, remaining }] + mintable rows
           (remaining > 0 only); sumberPelunasan() per §2.
  VERIFY:  npx vitest run src/lib/__tests__/spp-bulk.test.js -> green on the
           A(parent-paid)/B(unpaid)/C(unpaid) fixture: preview mints B,C only,
           A skipped; sumberPelunasan(A) = 'ortu'; re-preview after applying
           the mint writes 0 rows.
  DONE-IF: VERIFY passes; git diff shows only the lib + its test.
  VERIFIED 2026-09-29: narrow spec 9/9 -> full suite 47 files / 287 tests green
           -> production build green; no console.log in src/; status shows
           only sppPayments.js (M) + spp-bulk.test.js + this doc (new).

MICROTASK BR.2: per-invoice bulk-settle button
  EDIT:    src/features/reports/InvoiceModal.jsx (+ tests/invoice-bulk-settle.spec.js)
  RULES:   R-BR1, R-BR3, R-BR4, R-BR5
  OUTCOME: Each non-legacy invoice row in Riwayat gains superadmin-only
           "Catat pelunasan sekolah" -> dialog (metode select default
           'Transfer', Diterima Oleh required, tanggal default today) ->
           ConfirmDialog preview (count + total, §2 copy) -> sequential
           writeRemote per minted row (submitting flag, existing errorMsg
           slot) -> read('sppPayments') + tick refresh.
  VERIFY:  targeted Playwright spec: A stays parent-sourced in ledger,
           B/C pills flip lunas, invoice flips Lunas, second run mints 0;
           then full npm test + production build green, unrelated failures
           labeled pre-existing before moving on (taste #9).
  DONE-IF: VERIFY passes; nothing else changed.
  VERIFIED 2026-09-29: tests/invoice-bulk-settle.spec.js 1/1 green (A ledger
           stays ortu-only, B/C settle via sekolah rows with invoiceId,
           second run shows "Semua murid sudah lunas untuk invoice ini.");
           neighboring invoice specs 6/6 green (incl. pipeline-dashboard
           Tarif/Frozen); npm test 47/287 green; production build green;
           no console.log in touched files.
  NOTE 2026-09-29: first spec attempt failed at seeding with
           "cabangId tidak ditemukan" — the shared test DB's cabang table
           was empty because the earlier endpoint.protection.php run
           (restore section, hard replace) left master data wiped. Recovered
           via sanctioned `npm run db:reset` (canonical seed) after backing
           up the 5-row users table to Temp; non-canonical user
           test_trainer_a was dropped by the reset and is restorable from
           that backup on request.

MICROTASK BR.3: write-back (§7)
  EDIT:    docs/ (SCOPE_EXPANSION_MILESTONES.md closure row, SPP_BILLING_PLAN.md
           §10 D-SB8 extension pointer) — doc-only, no code.
  RULES:   taste #32/#43/#74 (append-only row, no renumbering).
  OUTCOME: Gate BR recorded complete with Verified: lines.
  VERIFY:  grep each referenced ID resolves in both documents (taste #53).
  DONE-IF: VERIFY passes; plan docs and code agree.
```

---

## 5. Alignment table (taste #68)

| Finding | Confirmed by docs | Not documented / implied | Disposition |
|---|---|---|---|
| Bulk rows invisible to pills | `sppPayments.js:64-76` (siswaId-only sum); `entities.php:558-594` (invoice-level shape exists, no propagation) | Per-pupil mint + skip rule never specified; D-SB8 stops at "row carries invoiceId" | New decision D-BR1 (this doc owns it) |
| Source unrepresentable in state | `constants.js` sparse `sppLunas` map (boolean) | Source-memory rule never picked | Pinned: construction (skip), display via `sumberPelunasan`, no schema change |
| No bulk UI writes invoiceId | `SppPaymentModal.jsx` (no invoiceId path); grep `invoiceId` in `src/` (readers + tests only) | Bulk entry point never assigned | New build BR.2 in `InvoiceModal.jsx` Riwayat rows |
| Credit rollover | `invoices.js:221-235,253-314`; `EVAL_FINANCE_PLAN.md` F-EF5/D-EF6 | Auto-application never built | Deferred, stays GAP in EVAL_FINANCE (not this doc) |

---

## 6. Access model (explicit, no broadening)

| Action | Superadmin | Admin Cabang | Trainer |
|---|---|---|---|
| Bulk-settle one invoice (mint school rows) | ✅ (session authority, existing `sppPayments` create) | ❌ UI hidden; server 403 via invoice-write role | ❌ never |
| Read resulting pills/settlement | ✅ all | 🟡 own branch (existing scope) | 🟡 own rows (existing scope) |

---

## 7. Write-back contract (taste #32/#43, on BR.2 close)

Record `Verified:` lines in this file §4; append one closure row to `SCOPE_EXPANSION_MILESTONES.md` (no renumbering — this is a short-task amendment per taste #40/#69, not a milestone-chain expansion); append one D-SB8 extension pointer in `SPP_BILLING_PLAN.md` §10 (bulk now mints per-pupil skip-settled rows; SB history otherwise intact).

---

## Cross-references

- `docs/UNIVERSAL.md`, `docs/IMPLEMENTATION_PLAN.md` (Part 2, R1–R8), `docs/SCOPE_EXPANSION_PLAN.md`, `docs/SCOPE_EXPANSION_PRIVILEGES.md`, `docs/SPP_BILLING_PLAN.md` §4/§9–§10, `docs/EVAL_FINANCE_PLAN.md` F-EF5/§10 (item-15 GAP owner)
- `src/lib/sppPayments.js`, `src/lib/invoices.js`, `src/features/reports/InvoiceModal.jsx`, `src/features/payments/SppPaymentModal.jsx`
- `server/validation/entities.php:558-594`, `server/lib/invoiceGenerator.php:174-182`, `docs/exemplar/afterschola_t3_test.sql` (negative evidence: 0 ledger rows)
