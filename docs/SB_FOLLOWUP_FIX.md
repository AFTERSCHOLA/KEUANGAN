# SB Follow-up Fix — short gate for the three SB-C gaps

**Status:** CLOSED 2026-09-18 — all three microtasks implemented and verified (MySQL prerequisite met mid-gate); §9 write-back recorded on `SPP_BILLING_MILESTONES.md` + `SCOPE_EXPANSION_MILESTONES.md`. This file is retired as the record (taste #40).
**Trigger:** post–Gate SB-C audit of `20d72b1..c451190` (branch `test-stage`) found three load-bearing gaps behind the DONE claim: print crashes on canonical invoices, invoice-level payments rejected by the server, and the installment spec testing a deleted flow.
**Position:** temporary, gate-by-gate fixing plan (taste #40). It does **not** replace `docs/SPP_BILLING_PLAN.md` / `docs/SPP_BILLING_MILESTONES.md`. On close, §9 writes completion back and this file is folded or retired.

---

## 1. Context and inputs

- SB.C.2 made `server/lib/invoiceGenerator.php` canonical (single `periode`, `items[]`, `grandTotal`, `nomorInvoice`). `InvoiceModal.jsx` now lists those records, and `SchoolList.jsx:383` passes them straight to `InvoiceTemplate.jsx` — which still assumes the legacy client shape.
- D-SB8 promised invoice-level payments (`siswaId` nullable when `invoiceId` present), and `invoiceSettlement()` already matches on `invoiceId` — but `validateSppPayment()` still hard-requires `siswaId`, so the server 422s the very rows the client logic supports.
- `tests/invoice-installment.spec.js` still drives the pre–SB.C.2 flow ("Simpan sebagai Draft" → per-row "Terbitkan" → "Tandai Lunas" absent). None of those controls exist anymore ("Buat & Terbitkan Invoice", direct `Terbit`, always-visible "Hapus").

## 2. Goals and non-goals

**Goals**

1. Canonical server invoices print without crashing and show the same totals as the history list.
2. Invoice-level payment rows validate on the server without breaking any legacy per-siswa row.
3. The installment spec proves the current flow again (derived badge flips Belum Lunas → Lunas, no manual lunas control).

**Non-goals (stay out of this gate)**

- Carry-over economics (whether carry joins the payable total) — needs a product decision, separate gate.
- Wiring `billingForSekolah()` into live totals — owned by the next billing chain (D-SB4).
- Restoring the deleted `server/tests/invoice.generation.php` tariff/audit matrix — deferred with owner (§8).
- SB.B.5 hydration documentation — deferred with owner (§8).

## 3. Findings registry (F-SBF)

| ID | Finding | Evidence |
|---|---|---|
| F-SBF1 | **Print crashes on canonical invoices.** `periodeLabel` reads `invoice.periodeList.length` and the table reads `uraian/jumlahSiswa/hargaSatuan/total` — all absent on server records (`periode`, `items[]`, `grandTotal`, no top-level `uraian`). Any Cetak on a post–SB.C.2 invoice throws. | `src/features/reports/InvoiceTemplate.jsx:21-23,88-100` vs `server/lib/invoiceGenerator.php:153-167`; `SchoolList.jsx:383` passes server records straight through |
| F-SBF2 | **Invoice-level payments impossible.** Client settlement matches `p.invoiceId === invoice.id` with `siswaId: null`, but the server rejects any row without a valid `siswaId`. The D-SB8 follow-up was never implemented. | `src/lib/invoices.js:186-190` vs `server/validation/entities.php:172-182`; factory `src/lib/sppPayments.js:6-30` has no `invoiceId` passthrough |
| F-SBF3 | **Installment spec tests a deleted flow.** Spec clicks Draft/Terbitkan controls removed by SB.C.2, so the gate's own regression proof is red/stale. | `tests/invoice-installment.spec.js:50-56` vs `src/features/reports/InvoiceModal.jsx:186-188,197-246` |

## 4. Decision set (D-SBF) — concrete picks (taste #17)

| # | Decision | Status |
|---|---|---|
| D-SBF1 | **Template normalizes both shapes, totals never diverge.** `periodeLabel` from `periodeList` OR single `periode`; `nomor` from `nomor \|\| nomorInvoice`; rows from server `items[]` (plus `carryOverLines` as extra display rows) or one legacy row; grand total via the existing `invoiceTotal()` (prefers `grandTotal`); carry lines stay display-only and never feed the total (preserves SB.B.4 rule). | Locked |
| D-SBF2 | **Minimal validator relaxation, non-destructive.** `siswaId` may be null/empty **iff** `invoiceId` is a non-empty string referencing an existing `invoices` row. When `invoiceId` is present and the row also carries `sekolahId`, it must equal the invoice's `sekolahId` (R-SB6); absent `sekolahId` is tolerated (no writer sends it yet — full `sekolahId`-required column is deferred to §8). Legacy per-siswa rows validate exactly as before. | Locked |
| D-SBF3 | **Update the spec in place, same label.** Keep the test title/label (`cicilan invoice …`) for traceability; drive the current flow (create via "Buat & Terbitkan Invoice", pay per-siswa by matching `periode`, assert derived badge). No new spec file, no coverage deletion. | Locked |

## 5. Rules (R-SBF)

- **R-SBF1** `sppPayments` stays append-only; this gate adds no update/delete ledger path.
- **R-SBF2** Derived totals stay derived: Template and Modal both read `invoiceTotal()` / `invoiceSettlement()`; no stored `status`/`sisa` field.
- **R-SBF3** One concern per edit (taste #4/R-SB4): Template, validator, spec are separate microtasks; no styling or scope changes ride along.
- **R-SBF4** Indonesian UI copy unchanged; verification language `Verified: <command> -> <result>` / `Unverified:` (taste #26/UNIVERSAL §Verification Language).

## 6. Microtasks

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-SBF references>
  RULES:   <R-SBF codes + existing invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

### SBF.1 Support server invoice shape in print template

```text
MICROTASK: Support server invoice shape in print template
  EDIT:    src/features/reports/InvoiceTemplate.jsx (only)
  FINDS:   F-SBF1; D-SBF1
  RULES:   R-SBF2, R-SBF3, R-SBF4; carry lines display-only, never added to total (SB.B.4); legacy client invoices keep rendering byte-identical rows
  DEPENDS: none
  OUTCOME: Cetak on a canonical server invoice renders items, grand total, terbilang, and settlement badge without throwing, and legacy invoices render as before.
  VERIFY:  npm test -- invoice-print-shape -> server-shape invoice (periode + items[] + grandTotal, no periodeList/uraian) renders rows/total/terbilang/badge; legacy-shape invoice renders its single row unchanged; missing periodeList never throws
  DONE-IF: verify passes; only intended files changed
```

### SBF.2 Accept invoice-level payment rows on the server

```text
MICROTASK: Accept invoice-level payment rows on the server
  EDIT:    server/validation/entities.php (validateSppPayment only), server/tests/entity.validation.php (new assertions), src/lib/sppPayments.js (optional invoiceId/sekolahId passthrough, no behavior change otherwise)
  FINDS:   F-SBF2; D-SBF2, D-SB8
  RULES:   R-SBF1, R-SBF3; legacy rows without invoiceId validate exactly as before (R-SB3); unknown invoiceId fails hard; mismatched sekolahId (when present) fails hard (R-SB6)
  DEPENDS: SBF.1
  OUTCOME: a payment row with siswaId null plus a real invoiceId validates, while fake invoiceId and mismatched sekolahId are rejected and legacy rows still pass.
  VERIFY:  php server/tests/entity.validation.php -> invoice-level row (null siswaId + real invoiceId) validates; fake invoiceId rejected; sekolahId mismatch rejected; legacy per-siswa row still validates; plus npm test -- invoice-status still green
  DONE-IF: verify passes; only intended files changed
```

### SBF.3 Update installment spec to the canonical flow

```text
MICROTASK: Update installment spec to the canonical flow
  EDIT:    tests/invoice-installment.spec.js (only)
  FINDS:   F-SBF3; D-SBF3, D-SB9
  RULES:   R-SBF3, R-SBF4; same test label kept; role-based locators first (taste/testing #5); zero pageerror assertion kept; no app-code change in this microtask (taste #13)
  DEPENDS: SBF.2
  OUTCOME: the installment spec drives "Buat & Terbitkan Invoice", records per-siswa payments against the generated periode, and the history badge flips Belum Lunas -> Lunas with no manual lunas control anywhere.
  VERIFY:  npx playwright test tests/invoice-installment.spec.js --workers=1 -> 1 passed; grep for "Tandai Lunas" in app DOM asserts zero; pageErrors empty
  DONE-IF: verify passes; only intended files changed
```

## 7. Gate exit criteria (gate closes when all hold)

1. Cetak works for both server and legacy invoice shapes with identical totals to the history list (SBF.1).
2. Server accepts invoice-level rows and still accepts every legacy row; fake/mismatched references fail hard (SBF.2).
3. Installment spec passes on the canonical flow with zero pageerrors (SBF.3).
4. `npm test` green and `npm run build` green; any unrelated failure proven pre-existing via stash comparison before moving on.
5. `src/` grep-clean of `console.log`/debug; `git status` shows only intended files.
6. Completion recorded per §9.

## 8. Deferred with owners

| Item | Owner / resolving venue | Why deferred |
|---|---|---|
| Whether carry-over joins the next invoice's payable total (currently display-only, single-predecessor) | Product decision + separate billing gate | Needs business sign-off, not a silent logic change here |
| Full `sekolahId`-required column on `sppPayments` + invoice picker UI for invoice-level payments | Next billing chain (D-SB4) | No writer sends `sekolahId` yet; SBF.2 only unblocks validation |
| Restore `server/tests/invoice.generation.php` tariff-grouping/audit matrix | Test-infra follow-up | E2E covers shape/idempotency only; full matrix needs its own microtask |
| SB.B.5 hydration (pending-wins) documentation + delete-tombstone + unit test | HYGIENE or next billing gate | Unplanned in SPP milestones; out of this gate's scope |
| Wire `billingForSekolah()` into live totals + `finance.js` header contract | Next billing chain (D-SB4) | Explicitly staged; claiming it here would repeat the SB-C overclaim |
| Legacy `openEdit` default polluting `null` → object (`SchoolList.jsx:84-92`) | Next billing gate | Dormant while formula unwired; fix with UI-only defaults there |

## 9. Completion recording (taste #43)

On close: append DONE records (with `Verified:` lines) to `docs/SPP_BILLING_MILESTONES.md` Gate SB-C follow-up note and `docs/SCOPE_EXPANSION_MILESTONES.md` Gate SB-C block; fold or retire this file per taste #40. Do not expand the long-term plan.

**Evidence so far (2026-09-18, working tree uncommitted):**
`Verified: npx vitest run src/lib/__tests__/invoice-print-shape.test.js -> 3 passed` · `Verified: npm test -> 33 files / 164 passed` · `Verified: npm run build -> green (418.43 KiB JS, 0 map)` · `Verified: php -l server/validation/entities.php + server/tests/entity.validation.php -> no syntax errors` · `Verified: src/ grep console.(log|debug) -> clean; git status -> only intended files`
**Close-out verification (MySQL active, PHP `:8000` started for the run then stopped):**
`Verified: D:\Games and Apps\xampp\php\php.exe server/tests/entity.validation.php -> all checks passed (M3.2 x6, SB.B.1, SBF.2 invoice-level)` · `Verified: npx playwright test tests/invoice-installment.spec.js --workers=1 -> 1 passed (pageErrors 0)`

## 10. Cross-references

- `docs/SPP_BILLING_PLAN.md` §3 (F-SB5/F-SB6), §4 (D-SB8/D-SB9/D-SB10), §7, §10
- `docs/SPP_BILLING_MILESTONES.md` SB.B.2/SB.B.3/SB.C.2/SB.C.3, Gate exit 1–6
- Code: `src/features/reports/InvoiceTemplate.jsx`, `src/features/reports/InvoiceModal.jsx`, `src/features/schools/SchoolList.jsx:383`, `src/lib/invoices.js`, `src/lib/sppPayments.js`, `server/validation/entities.php`, `server/tests/entity.validation.php`, `server/lib/invoiceGenerator.php`, `tests/invoice-installment.spec.js`
