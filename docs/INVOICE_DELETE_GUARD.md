# Invoice Delete Guard — short doc for the "SPP list delete pop-up" carry-over

**Status:** IN PROGRESS 2026-09-20 — INV.1 + INV.2 implemented and verified per §9 below; the two browser-click legs stay `Unverified` (no guarded invoice seed in the dev DB; creating a ledger row to seed one would permanently pollute finance totals since SPP is append-only). No app edit beyond the five files + one regression test listed in §9.
**Trigger:** teammate: "Data Pembayaran ... spawned several pending SPP. Then, in this SPP lists, there is a delete button which resulted in a pop-up which is not functional if i'm not wrong." + "School Logo is not fit to the thumbnail card and it also stretches by the zoom."
**Position:** temporary short doc (taste #40). It does **not** replace `docs/SPP_BILLING_PLAN.md` / `docs/SPP_BILLING_MILESTONES.md`, `docs/TEAM_FEEDBACK_PLAN.md` / `docs/TEAM_FEEDBACK_MILESTONES.md`, or `docs/SCOPE_EXPANSION_*`. On close, §9 writes completion back and this file is folded or retired.
**Contract order:** `docs/UNIVERSAL.md` (primary, read first) → `docs/IMPLEMENTATION_PLAN.md` → `docs/SCOPE_EXPANSION_PLAN.md` + `docs/SCOPE_EXPANSION_PRIVILEGES.md` → `docs/SPP_BILLING_PLAN.md` (R-SB1 append-only) → `docs/TEAM_FEEDBACK_PLAN.md` (D1/D4) → this file.

---

## 1. Context and inputs

- `Data Pembayaran` tab renders only `PaymentTable.jsx` (honor ledger: `Lembar Pembayaran Honor Trainer`). It has no student column and no SPP list (`src/App.jsx:298`, `src/features/payments/PaymentTable.jsx:1-237`).
- The only "SPP lists with a delete button + pop-up" in current source is `InvoiceModal.jsx` → `Riwayat Invoice` → per-row `Hapus` (`src/features/reports/InvoiceModal.jsx:212-244`), opened from the school-card `Kelola Invoice` button (`src/features/schools/SchoolList.jsx:317`). Its confirm is `ConfirmDialog` (`InvoiceModal.jsx:134`).
- Server delete guard (SB.C.3 sign-off): an invoice with any `spp_payments` row referencing its `invoiceId` returns 422 `Invoice sudah memiliki pembayaran dan tidak dapat dihapus` (`server/api/invoices.php:35-46`). Non-superadmin delete is 403 via `requireAuthorization` (`server/api/invoices.php:33`; matrix: invoices superadmin-write / admin_cabang read-only).
- Client plumbing: `deleteInvoiceServer()` = `deleteRemote('invoices', id)` (`src/lib/invoices.js:352-355`). `deleteRemote` maps only 403 → `{status:'forbidden'}` and re-throws everything else including 422 (`src/lib/store.js:492-507`). `InvoiceModal.jsx:110-130` handles `forbidden` explicitly and catches the 422 throw into `errorMsg`.
- Honor delete (often mislabelled "SPP" in feedback) is already fixed at HEAD: `onConfirm` runs the write **and** closes (`src/features/payments/PaymentTable.jsx:234`, commit `58da70f`). `deleteSppPayment` orphan is gone (`src/lib/sppPayments.js:51-56` — append-only comment only; `rg deleteSppPayment src` empty).
- Thumbnail: `SchoolThumbnail` is `w-full h-full object-cover object-center` in a fixed `h-44 relative bg-slate-200` container (`src/features/schools/SchoolList.jsx:310-311,829-835`) + hint `Disarankan foto landscape 16:9 agar terpotong rapi.` User picked **Keep crop-fill** (2026-09-20 clarification) — D1 holds, no edit.

## 2. Goals and non-goals

**Goals**

1. The invoice `Hapus` refusal speaks one pinned Indonesian sentence and the dialog close behavior is pinned, so "pop-up not functional / data not deleted" stops reading as a bug.
2. The 422 guard surfaces as a structured status (like 403 does today), not a generic thrown error.
3. The three sibling confirms with the same "stays open on refuse" shape are aligned to close-then-show (no behavior broadening).

**Non-goals (stay out of this doc)**

- No SPP-payment delete UI. SPP stays append-only (R-SB1; TEAM_FEEDBACK D4). Corrections remain new ledger rows.
- No privilege change (taste #33). Invoices stay superadmin-write / admin_cabang read-only.
- No thumbnail restyle. D1 crop-fill holds per user pick (§1, last bullet).
- No carry-over economics, no `billingForSekolah()` wiring, no full-suite green — owned elsewhere.

## 3. Findings registry (F-INV)

| ID | Finding | Evidence |
|----|---------|----------|
| F-INV1 | **422 guard has no structured status.** `deleteRemote` converts only 403 → `forbidden`; the invoice-has-payments 422 throws `ApiError`, so the modal's `forbidden` branch never sees it and the catch-all `Gagal menghapus invoice` / raw server text path is the only display. | `src/lib/store.js:501-506` vs `server/api/invoices.php:44-45`; `src/features/reports/InvoiceModal.jsx:116-126` |
| F-INV2 | **Confirm closes before the async settles.** `onConfirm={() => { confirmAction?.(); setConfirmOpen(false) }}` closes immediately even when the server will refuse, so a guarded invoice reads as "clicked Hapus → dialog vanished → data still there → broken". Close-first is the correct idiom (mirrors `InvoiceModal.jsx:134` intent) but the refusal copy is what makes it legible. | `src/features/reports/InvoiceModal.jsx:134` + `110-130` |
| F-INV3 | **Same symptom class lives in three sibling dialogs (not SPP, same user-visible shape).** On `forbidden` they `return` without closing, so the pop-up stays open over un-deleted data: trainer, siswa, cabang. School delete already does close-first and is the idiom to mirror. | `src/features/trainers/TrainerList.jsx:249-257` (close only on success `:259`); `src/features/students/StudentList.jsx:105-109` (return, no close); `src/features/admin/BranchManager.jsx:198-201` (return, no close); vs `src/features/schools/SchoolList.jsx:281` (`setSimpleConfirmOpen(false)` before `doDelete`) |
| F-TH1 | **Thumbnail already matches the agreed contract; no defect at HEAD.** `object-center` + hint landed in `58da70f` (G2.1). `object-cover` never stretches (ratio-preserving crop); a square logo in a landscape `h-44` card crops by design (D1 uniform rhythm). | `src/features/schools/SchoolList.jsx:310,833`; `git show 58da70f -- src/features/schools/SchoolList.jsx`; dist probe §9 |

## 4. Decision set (D-INV) — concrete picks (taste #17)

| # | Decision | Status |
|---|---|---|
| D-INV1 | **Guard refusal is one pinned sentence, surfaced structurally.** `deleteRemote('invoices', …)` maps the invoice-has-payments 422 to `{status:'guarded', message:'Invoice sudah memiliki pembayaran dan tidak dapat dihapus'}` (same shape as `forbidden`). Modal renders exactly that string in its existing `errorMsg` slot. No new component, no new copy variant. | Proposed |
| D-INV2 | **Close behavior pinned: confirm always closes, parent explains.** `ConfirmDialog` `Lanjutkan` always runs `setConfirmOpen(false)` (already true for invoice/honor/school-simple); the parent modal owns the refusal explanation via `errorMsg`. `Batal` / Escape / backdrop (where enabled) close with no write — unchanged. | Proposed |
| D-INV3 | **Align the three sibling forbiddens to close-then-show.** `TrainerList.doRemove` and `BranchManager.doDelete` move `setConfirmOpen(false)` (+ pending-id clear) before the existing `showError` message, mirroring `SchoolList.jsx:281`. `StudentList.doRemove` closes then returns silently — that component has no AlertDialog facility, and its own `save()` already returns silently on `forbidden` (`StudentList.jsx:82-85`), so silent close mirrors the file's own idiom; adding a message facility is deferred (§11). No auth logic changes. | Locked |
| D-TH1 | **Thumbnail stays `h-44 object-cover object-center` + hint.** User-picked Keep crop-fill (2026-09-20). No `object-contain` letterbox, no card-size change. A future "show full logo" request re-opens TEAM_FEEDBACK D1 via re-plan (taste drift rule), not via patch. | Locked |

## 5. Rules (R-INV)

- **R-INV1** Append-only holds: no update/delete path is added to `sppPayments`; invoice-with-payments stays undeletable (R-SB1).
- **R-INV2** Mirror existing idiom, do not invent (taste #11): `ConfirmDialog`/`AppModal` + `errorMsg` slot + `SchoolList.jsx:281` close-first shape; Indonesian copy pinned (`Batal / Lanjutkan / Hapus`, D-INV1 sentence, `Jam selesai harus setelah jam mulai` untouched).
- **R-INV3** One concern per edit, verify immediately (taste #3–#6): `deleteRemote` mapping, modal copy branch, and each sibling close-fix are separate microtasks; one hypothesis per edit.
- **R-INV4** Privilege unchanged (taste #33): 403/422 mapping changes display only; `authorize.php` matrix untouched.
- **R-INV5** Verification language `Verified: <command> -> <result>` / `Unverified:` (UNIVERSAL); every microtask carries one OUTCOME + one falsifiable VERIFY.

## 6. Hypotheses (taste #6 — one per edit, stated before editing)

- H1 (F-INV1): *If `deleteRemote` maps the invoice-has-payments 422 to `{status:'guarded'}`, then deleting a guarded invoice shows the pinned sentence instead of the generic catch-all, because the modal's explicit branch handles it.*
- H2 (F-INV3): *If the three `forbidden` paths close before showing the message, then a refused delete leaves no stranded open dialog, because the close call no longer sits only on the success path.*

## 7. Alignment table — verify-the-verification gate (taste #68)

| Finding | Confirmed by docs (file/section) | Not documented / implied | Disposition here |
|---|---|---|---|
| Invoice 422 guard | `SCOPE_EXPANSION_MILESTONES.md` SB.C.2 sign-off (3): "invoice with any recorded spp_payments cannot be deleted (422)"; `server/api/invoices.php:35-46` | Client display of that 422 was never pinned (only `forbidden` has a branch) | Built as INV.1 (D-INV1/D-INV2) |
| Honor confirm never closed (F4) | `TEAM_FEEDBACK_PLAN.md:74` invariant + `InvoiceModal.jsx:134` idiom | — | Already solved at HEAD `58da70f` (`PaymentTable.jsx:234`); no microtask, re-verify only |
| SPP orphan, no delete UI (F5) | `SPP_BILLING_PLAN.md:71` R-SB1 append-only; `TEAM_FEEDBACK_PLAN.md:75` (delete helper, no UI) | — | Already solved (helper gone); no SPP-delete UI added here |
| Sibling confirms stay open on refuse | Confirm-close idiom specified (`CLIENT_ROUND_PLAN.md:62` R2 + `InvoiceModal.jsx:134`); school-simple shows close-first | The three `return`-without-close paths were never listed as findings | New, in-scope as INV.2 (D-INV3) — same defect class, smallest slice |
| Thumbnail crop reads as "tidak fit" | `TEAM_FEEDBACK_PLAN.md:80-85` D1 (keep `h-44 object-cover`, add `object-center` + hint) | "Stretches by zoom" matches no code path (`object-cover` preserves ratio) | Solved per contract (F-TH1/D-TH1); no microtask — needs a repro screenshot if reopened |

## 8. Microtasks

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-INV references>
  RULES:   <R-INV codes + taste codes>
  DEPENDS: <prior microtask>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

### INV.1 Map the invoice guard to a structured status

```text
MICROTASK: Map invoice guard status
  EDIT:    src/lib/store.js (deleteRemote 422 branch only) + src/features/reports/InvoiceModal.jsx (guarded branch renders pinned copy in errorMsg only)
  FINDS:   F-INV1, F-INV2
  RULES:   R-INV1, R-INV2, R-INV3, R-INV5, taste #11 (mirror forbidden shape), taste #16 (pinned 'Invoice sudah memiliki pembayaran dan tidak dapat dihapus')
  DEPENDS: none
  OUTCOME: deleting a guarded invoice closes the confirm and shows the pinned guard sentence in the parent modal while the invoice row remains
  VERIFY:  Playwright (superadmin, seeded invoice + linked sppPayments row): open Kelola Invoice, click Hapus, click Lanjutkan, confirm gone, parent shows 'Invoice sudah memiliki pembayaran dan tidak dapat dihapus', row still present after refresh; unguarded invoice deletes and disappears
  DONE-IF: verify passes; only the two files changed
```

### INV.2 Close sibling confirms on refuse

```text
MICROTASK: Close sibling confirms on refuse
  EDIT:    src/features/trainers/TrainerList.jsx (doRemove only) + src/features/students/StudentList.jsx (doRemove only) + src/features/admin/BranchManager.jsx (doDelete only)
  FINDS:   F-INV3
  RULES:   R-INV2, R-INV3, R-INV4, R-INV5, taste #11 (mirror SchoolList.jsx:281 close-first)
  DEPENDS: INV.1
  OUTCOME: a refused trainer/cabang delete closes its confirm and shows the existing Indonesian refusal message with no data removed; a refused siswa delete closes silently (no message facility in that component) with no data removed
  VERIFY:  Playwright or targeted probe per role: force deleteRemote to {status:'forbidden'} (or drive as unauthorized role), click Hapus/Lanjutkan, dialog gone and record still present; authorized delete still removes and closes
  DONE-IF: verify passes; only the three files changed
```

## 9. Gate exit criteria + evidence so far

Gate closes when: (1) guarded invoice shows the pinned sentence and stays; unguarded invoice deletes; (2) the three sibling refuses close-then-show; (3) `npm test` green on touched libs + clean production build; no `console.log` in `src/`; `git status` shows only intended files; (4) §10 write-back recorded.

Evidence (2026-09-20, implementation session):

- `Verified: npx vitest run src/lib/__tests__/store-delete-guard.test.js -> 3 passed` (new; guarded mapping + other-422 still throws + non-invoices scope leg)
- `Verified: npx vitest run src/lib/__tests__/invoice-status.test.js -> 8 passed` (INV.1 narrow check)
- `Verified: npm test -> 37 files / 176 passed` (full unit suite after INV.1+INV.2 app edits + new guard test)
- `Verified: npm run build -> green (420.52 KiB JS)` (after all app edits)
- `Verified: rg console.(log|debug) src -> clean; git status -> only the 5 intended app files + this doc + the new test`
- `Verified: npx playwright test tests/invoice-installment.spec.js --project=default --workers=1 -> 1 passed` (InvoiceModal regression; PHP :8000 + MySQL test DB live for the run, PHP stopped after)
- `Verified: node <tmp>/inv-guard-probe.mjs -> 6/6 PASS` (one-off, zero-mutation: superadmin login, post-login CSRF, unknown-id delete 422 `Invoice tidak ditemukan`, 3-way pinned-literal parity server guard vs client scope-match vs client render)
- `Verified: node <tmp>/db-probe.php -> afterschola_t3_test present` (read-only SHOW DATABASES)
- `Unverified: browser click Hapus → Lanjutkan on a truly guarded invoice showing the pinned sentence` — owner: next session with a seeded invoice-level payment row; next prerequisite: a disposable seed path that does not pollute finance totals (creating a real ledger row is permanent — append-only). Blocked on seed strategy, not on code.
- `Unverified: browser refuse legs for the three sibling dialogs as an unauthorized role` — owner: same next session; prerequisite: seeded out-of-scope trainer/siswa/cabang rows (driving an in-scope delete would really delete — must pick out-of-scope targets only).

## 10. Completion recording (taste #43)

On close: append DONE records (with `Verified:` lines) to `docs/SPP_BILLING_MILESTONES.md` (guard-display note under SB.C.2 sign-off (3)) and `docs/TEAM_FEEDBACK_MILESTONES.md` (G1 exit note: honor close already green at `58da70f`; INV.1/INV.2 as the invoice/sibling follow-through); fold or retire this file per taste #40. Do not expand the long-term plan.

## 11. Deferred with owners (taste #53)

| Item | Owner / resolving venue | Why deferred |
|---|---|---|
| Live repro of "stretches by zoom" (which thumbnail: school card / PhotoSlot `w-16` preview / sidebar circle / login) + screenshot | Reporter (teammate) | No code path stretches under `object-cover`; cannot fix a visual without the exact surface |
| `object-contain` letterbox alternative for square logos | Re-plan of TEAM_FEEDBACK D1 | Contradicts locked D1 uniform-rhythm pick; needs explicit re-decision, not a patch |
| Invoice-with-payments correction flow (credit/carry-over row instead of delete) | Next billing chain (D-SB4) | Guard is intentional (anti-orphan); the remedy is a ledger row, not a delete |
| Full-suite green + staging `rc:verify` | HYGIENE / PRODUCTION Gate D7.1 | Owned elsewhere; this gate asserts only its own slices |

## 12. Cross-references

- `docs/UNIVERSAL.md` — Core Checklist + Executor Loop + Verification Language (primary contract).
- `docs/IMPLEMENTATION_PLAN.md` Part 2 (ledger principle), Part 6 R1/R4.
- `docs/SCOPE_EXPANSION_PRIVILEGES.md` — invoices superadmin-write / admin_cabang read-only (boundary D-INV preserves).
- `docs/SPP_BILLING_PLAN.md` §4 D-SB8/D-SB10, §5 R-SB1 (append-only), §10 SB.C.2 sign-off (3).
- `docs/TEAM_FEEDBACK_PLAN.md` §5 (D4 honor close + SPP no-UI), §6 (D1 thumbnails), §11 triage; `docs/TEAM_FEEDBACK_MILESTONES.md` G1/G2.
- Code: `src/features/reports/InvoiceModal.jsx:110-134,212-244`, `src/lib/store.js:492-507`, `src/lib/invoices.js:352-355`, `server/api/invoices.php:22-50`, `src/features/payments/PaymentTable.jsx:87-95,234`, `src/lib/sppPayments.js:51-56`, `src/features/schools/SchoolList.jsx:310,317,829-835`, `src/features/trainers/TrainerList.jsx:243-261`, `src/features/students/StudentList.jsx:102-109`, `src/features/admin/BranchManager.jsx:193-210`.
