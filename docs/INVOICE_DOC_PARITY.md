# Invoice Doc Parity — standalone server invoice document matching `invoice-template.pdf`

**Status:** IMPLEMENTED 2026-09-20 — IP.1–IP.3 verified per §9 below; full-suite regression stays `Unverified` (next hygiene run owns it). No app edit beyond the files listed in §8.
**Trigger:** user: invoicing still prints the live page via `window.print()` (bland static save-as-PDF) instead of following the visual format of `invoice-template.pdf`; calculation/scheme must NOT change — only the visual document.
**Position:** temporary short doc (taste #40). It does **not** replace `docs/CLIENT_ROUND_PLAN.md` / `docs/CLIENT_ROUND_MILESTONES.md`, `docs/SPP_BILLING_PLAN.md` / `docs/SPP_BILLING_MILESTONES.md`, or `docs/IMPLEMENTATION_PLAN.md`. On close, §9 writes completion back and this file is folded or retired.
**Contract order:** `docs/UNIVERSAL.md` (primary, read first) → `docs/IMPLEMENTATION_PLAN.md` (D1 cash basis, D3 ledger, R1/R4/R6) → `docs/CLIENT_ROUND_PLAN.md` (§6 placeholder map, D1/D2, R2/R4) → `docs/SPP_BILLING_PLAN.md` (D-SB8/D-SB10 canonical server payload, R-SB1/R-SB2/R-SB6) → `docs/SCOPE_EXPANSION_PRIVILEGES.md` (invoices superadmin-write / admin_cabang read-only) → this file.

**Goal (UNIVERSAL):** Finance opens one standalone A4 invoice document that looks like `invoice-template.pdf`, rendered from server MySQL data with unchanged numbers, and saves it as PDF via the browser.

---

## 1. Context and inputs

- Current invoice print is `window.print()` over the live app DOM (`src/features/reports/InvoiceTemplate.jsx:64`); there is no downloadable file artifact — CLIENT_ROUND F5 (`docs/CLIENT_ROUND_PLAN.md:39`).
- Ground truth is `invoice-template.pdf` (image-only, no text layer) + `pdf_page1_I0.jpg` render at repo root (CLIENT_ROUND D1/F7; port by eye).
- Canonical invoice payload is server-side since SB.C.2: `items[]` per tarif, `grandTotal`, `nomorInvoice AFS-YYYYMM-XXXX`, single `periode` (`server/lib/invoiceGenerator.php:123-167`; `docs/SPP_BILLING_PLAN.md:64` D-SB10). Legacy client shape (`periodeList`/`uraian`/`total`/`nomor`) still exists in caches and must keep rendering (SBF.1 contract `src/lib/__tests__/invoice-print-shape.test.js`).
- `InvoiceTemplate.jsx:9-45` already maps most §6 slots client-side, but it prints inside app chrome, loads `/invoice/*.png` by URL (deploy-subpath/offline 404 risk), and adds a settlement 3-box + carry-over lines that the PDF does not have.
- User decisions (2026-09-20): scope = visual parity only, no math/scheme change; settlement (Total/Dibayar/Sisa) + carry-over stay as an **appendix**; delivery = **standalone server PHP file** that queries financing via SQL — no client-side PDF lib, no server PDF lib either.
- Blocker found while grounding: `settings` (alamatUsaha, rekening*, penandatangan, logoUrl) is **localStorage-only** — "No server endpoint exists for this yet" (`src/lib/store.js:641-655`). The server renderer therefore cannot read it from MySQL.

## 2. Goals and non-goals

**Goals**

1. One standalone server-rendered HTML invoice document whose sections match `pdf_page1_I0.jpg` 1:1, plus a settlement appendix.
2. All numbers come from server MySQL (invoice payload, sekolah payload, `spp_payments` ledger); figures identical to the app for the same invoice.
3. Save-to-PDF works via the browser on the clean document (A4 `@page`, no app chrome, dataURL images); zero new dependencies.

**Non-goals (stay out of this doc)**

- No calculation, scheme, or ledger change: `finance.js`, `invoiceGenerator.php`, `invoices.js` math untouched.
- No privilege change (taste #33): endpoint enforces `authorize('read', 'invoices', …)` — superadmin full, admin_cabang own-branch, trainer denied (same as `read.php` via `roleCanReadEntity`, `server/auth/authorize.php:10-20,109-117`).
- No server settings endpoint; no `sppPayments` write path (R-SB1 append-only holds).
- Client `InvoiceTemplate.jsx` print path stays as offline fallback; it is not restyled here (one concern per edit).

## 3. Findings registry (F-IP)

| ID | Finding | Evidence |
|----|---------|----------|
| F-IP1 | Print path is live-DOM `window.print()` with app chrome around `.printable-report`. | `src/features/reports/InvoiceTemplate.jsx:48-66,68`; `src/print.css:10-34` |
| F-IP2 | Logo/signature load by absolute URL `/invoice/*.png` — no dataURL isolation, 404-prone off root/offline. | `src/features/reports/InvoiceTemplate.jsx:6-7,71-75,175` (G2.3 never done) |
| F-IP3 | Settlement 3-box + carry-over lines are rendered but have no slot in the PDF ground truth. | `src/features/reports/InvoiceTemplate.jsx:120-158` vs `pdf_page1_I0.jpg` |
| F-IP4 | Server settings do not exist; branding/bank/signer live only in browser localStorage. | `src/lib/store.js:641-655` |
| F-IP5 | Two invoice shapes coexist (server canonical + legacy client) and both must render. | `src/lib/invoices.js:130-169`; `invoice-print-shape.test.js` |

## 4. Decision set (D-IP) — concrete picks (taste #17)

| # | Decision | Status |
|---|---|---|
| D-IP1 | **Standalone server doc, no PDF lib anywhere.** `POST /api/invoices-doc.php` returns a self-contained `text/html` invoice (inline CSS, dataURL images, zero JS) rendered by new `server/lib/invoiceDoc.php` from MySQL. Supersedes the earlier poll pick "server-side PDF lib": a lib would violate CLIENT_ROUND R4 (no new dep for first slices) and the UNIVERSAL scope gate (composer/vendor pipeline + deploy-parity changes for no measured need), while the browser already saves clean HTML as PDF. | Locked |
| D-IP2 | **POST, not GET.** The request carries `{id, settings?}` where `settings` is the client's localStorage snapshot (F-IP4) used display-only and never stored. GET would leak operational text into access logs and hit URL limits; POST also keeps the CSRF idiom (`invoices-generate.php:9`). | Locked |
| D-IP3 | **Auth order mirrors `photo-download.php`:** 405 method → 401 auth → 422 body (`id` wajib; settings validated) → 404 unknown invoice → 403 scope (`authorize('read','invoices',record,user)`) → bytes. Trainer reads fail closed (403), same as `read.php`. | Locked |
| D-IP4 | **Layout = §6 slots 1:1 + appendix.** Logo+alamat, `INVOICE`+AFS nomor+tanggal, `KEPADA YTH`+PJ, `BULAN TAGIHAN`, `NO/URAIAN/SISWA/HARGA SATUAN/TOTAL`, `GRAND TOTAL`, Terbilang, `Catatan Pembayaran` bank block, `Hormat Kami`+signature+name — then an appendix with the settlement 3-box (Total/Dibayar/Sisa) + carry-over lines, display-only, never feeding the total. | Locked |
| D-IP5 | **Images embedded as dataURL from disk.** Server resolves `public/invoice/*.png` (repo dev) and `../invoice/*.png` (deploy docroot), first hit wins; optional `settings.logoDataUrl/signatureDataUrl` override accepted only as `data:image/(png\|jpeg\|webp)` ≤ 500 KB each. | Proposed |
| D-IP6 | **Settlement mirrored server-side, read-only.** PHP port of `matchedPaymentsForInvoice`/`invoiceSettlement` (`src/lib/invoices.js:180-213`): `invoiceId` match + historical `sekolahId`+periode fallback, same-school only (R-SB6 inherent); PHP port of `terbilang.js` + `Rp X.XXX` + Indonesian month names. | Proposed |
| D-IP7 | **Client change is one opener + one button.** `openInvoiceDoc(id)` in `src/lib/invoices.js` (fetch POST + CSRF, blob → `window.open`); a `Dokumen Resmi` button next to `Cetak` in `InvoiceTemplate.jsx` (existing `Cetak` stays as fallback). Filename `AFS-YYYYMM-XXXX.html` for the optional download leg. | Proposed |

## 5. Rules (R-IP)

- **R-IP1** Numbers are read-only projections of stored records (R-SB2): invoice payload, sekolah payload, `spp_payments` ledger. No derived finance writes (IMPLEMENTATION_PLAN R4).
- **R-IP2** Mirror existing idiom, do not invent (taste #11): endpoint shape follows `invoices-generate.php` (POST+CSRF+422 Indonesian copy); scope follows `photo-download.php`; HTML sections follow `InvoiceTemplate.jsx` slot order; Indonesian copy pinned (`Dokumen Resmi`, `Cetak / Simpan PDF`, `Invoice sudah memiliki pembayaran…` untouched).
- **R-IP3** One concern per edit, verify immediately (taste #3–#6): renderer lib, endpoint, and client opener are separate microtasks; one hypothesis per edit (§6).
- **R-IP4** Privilege unchanged (taste #33): read-scope only; `authorize.php` matrix untouched.
- **R-IP5** Verification language `Verified: <command> -> <result>` / `Unverified:` (UNIVERSAL); every microtask carries one OUTCOME + one falsifiable VERIFY.

## 6. Hypotheses (taste #6 — one per edit, stated before editing)

- H1 (IP.1): *If `invoiceDoc.php` renders from a canonical-shape fixture, then the HTML contains every §6 slot + appendix + terbilang, because each slot binds exactly one mapped source (D-IP4).*
- H2 (IP.2): *If the endpoint gates with the D-IP3 order, then anonymous/cross-branch/trainer/unknown-id calls fail 401/403/404 without bytes, because `requireAuthenticatedUser` + `authorize('read','invoices',…)` run before any read.*
- H3 (IP.3): *If the client opener POSTs `{id, settings}` and opens the blob, then the new tab shows the server nomor + grand total, because the bytes are the endpoint's rendered document, not the live DOM.*

## 7. Alignment table — verify-the-verification gate (taste #68)

| Finding | Confirmed by docs (file/section) | Not documented / implied | Disposition here |
|---|---|---|---|
| Print-only invoice, no file artifact (F5) | `CLIENT_ROUND_PLAN.md:39` F5; `:80,108-119` G2.2/G2.3 | — | Built as IP.1–IP.3 (standalone doc = the file artifact leg; browser Save-as-PDF, R4 holds) |
| Image-only PDF ground truth, port by eye (F7) | `CLIENT_ROUND_PLAN.md:41` F7; `:49` D1 | — | Eyeball VERIFY vs `pdf_page1_I0.jpg` in IP.3/IP.4 |
| AFS numbering ground truth | `CLIENT_ROUND_PLAN.md:39` F5 + `:115` numbering note; server canonical `SPP_BILLING_PLAN.md:64` D-SB10 | — | Already solved server-side (`invoiceGenerator.php:149`); renderer only displays `nomor ?? nomorInvoice` |
| Settlement 3-box + carry-over vs PDF | Implied only: settlement derived-status is specified (`SPP_BILLING_PLAN.md:101-109` §7) but no print slot is | No §6 slot covers them | Kept as appendix per user pick (D-IP4), display-only |
| Server settings for branding/bank | Not documented anywhere; `store.js:645` says no endpoint exists | — | NOT built; settings travel in POST body display-only (D-IP2). A settings endpoint is a separate re-plan, not a patch |
| Trainer invoice access | `authorize.php:18` (no `invoices` in trainer readable) + `read.php` bulk-empty behavior | — | Endpoint denies trainer (D-IP3); no broadening |

## 8. Microtasks

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-IP references>
  RULES:   <R-IP codes + taste codes>
  DEPENDS: <prior microtask>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

### IP.1 Render invoice HTML server-side

```text
MICROTASK: Render invoice document
  EDIT:    server/lib/invoiceDoc.php (new; pure renderer, no DB) + server/tests/invoice-doc.check.php (new; renderer asserts only)
  FINDS:   F-IP3, F-IP5
  RULES:   R-IP1, R-IP2, taste #11 (slot order mirrors InvoiceTemplate.jsx), taste #16 (pinned Indonesian labels)
  DEPENDS: none
  OUTCOME: a canonical-shape invoice fixture renders to self-contained HTML containing every D-IP4 slot, the appendix, and the terbilang line
  VERIFY:  php server/tests/invoice-doc.check.php -> renderer leg all OK (nomor, KEPADA YTH, BULAN TAGIHAN, GRAND TOTAL, Terbilang, bank block, Hormat Kami, appendix)
  DONE-IF: verify passes; only the two files changed
```

### IP.2 Gate the document endpoint

```text
MICROTASK: Gate document endpoint
  EDIT:    server/api/invoices-doc.php (new) + server/tests/invoice-doc.check.php (HTTP protection leg)
  FINDS:   F-IP1, F-IP2
  RULES:   R-IP2, R-IP3, R-IP4, taste #33 (authorize read-scope unchanged)
  DEPENDS: IP.1
  OUTCOME: POST returns the rendered document to same-branch admin_cabang/superadmin and 401/422/404/403 otherwise with zero bytes leaked
  VERIFY:  php server/tests/invoice-doc.check.php -> protection leg all OK (401 anon, 422 missing id, 404 unknown, 403 cross-branch + trainer, 200 own-branch with nomor + Content-Type text/html)
  DONE-IF: verify passes; only the two files changed
```

### IP.3 Open the server document from the UI

```text
MICROTASK: Wire document opener
  EDIT:    src/lib/invoices.js (openInvoiceDoc helper only) + src/features/reports/InvoiceTemplate.jsx (Dokumen Resmi button only)
  FINDS:   F-IP1
  RULES:   R-IP2, R-IP3, taste #11 (blob-download idiom mirrors backup.js), taste #16 ('Dokumen Resmi'), taste #29 (print acceptance where applicable)
  DEPENDS: IP.2
  OUTCOME: clicking Dokumen Resmi opens a new tab showing the server-rendered invoice with the same nomor and grand total, while Cetak keeps working
  VERIFY:  Playwright: seed via canonical generate flow, open Kelola Invoice > Cetak path, click Dokumen Resmi, new tab contains AFS nomor + grand total; pageErrors 0
  DONE-IF: verify passes; only the two files changed
```

### IP.4 Close the gate

```text
MICROTASK: Close invoice-doc gate
  EDIT:    docs/INVOICE_DOC_PARITY.md (§9 evidence + §10 write-back notes) + docs/CLIENT_ROUND_MILESTONES.md (G2.2/G2.3 note) + docs/SPP_BILLING_MILESTONES.md (canonical-render note)
  FINDS:   all F-IP
  RULES:   R-IP5, taste #20 (no console.log), taste #43 (completion recorded back on source milestones)
  DEPENDS: IP.3
  OUTCOME: whole-round gates pass and source milestone docs point at the new canonical document
  VERIFY:  npm test -> green on touched libs; npm run build -> green; build-deploy parity clean (new api/lib files mirrored); eyeball server doc vs pdf_page1_I0.jpg accepted
  DONE-IF: verify passes; only doc files + intended app files changed
```

## 9. Gate exit criteria + evidence

Gate closes when: (1) server doc shows every D-IP4 slot from its mapped source with appendix display-only; (2) numbers equal the app for the same invoice id; (3) protection leg green; (4) `npm test` green on touched libs + clean production build + no `console.log` in `src/` + `git status` shows only intended files; (5) §10 write-back recorded.

Evidence (2026-09-20, implementation session):

- `Verified: php server/tests/invoice-doc.check.php --no-http -> ALL 11 PASSED` (IP.1 renderer leg; one hypothesis disproved mid-run — uppercase `URAIAN`/`HARGA` needles vs renderer's `Uraian`/`Harga` + CSS uppercase — fixed as a test-assumption bug per testing taste #14, renderer untouched)
- `Verified: php server/tests/invoice-doc.check.php -> ALL 25 PASSED` (IP.1 + IP.2; MySQL + spawned PHP server live, fixtures cleaned, server reaped)
- `Verified: npx playwright test tests/invoice-doc.spec.js --project=default --workers=1 -> 1 passed` (IP.3; popup shows AFS nomor + GRAND TOTAL + Terbilang; pageErrors 0; PHP :8000 + test DB live, PHP stopped after)
- `Verified: eyeball server doc vs pdf_page1_I0.jpg -> accepted` (ad-hoc `doc-parity-shot.spec.js`, removed after passing per testing taste #15: logo+alamat, INVOICE+AFS+date, KEPADA YTH, BULAN TAGIHAN, table + rule, GRAND TOTAL, Terbilang, appendix 3-box, bank block, Hormat Kami+signature+name all present; shot kept outside repo in OS temp dir)
- `Verified: npm test -> 37 files / 176 passed` (no regressions on touched libs)
- `Verified: npm run build -> green (450.53 KiB precache)` (production build clean)
- `Verified: rg console.(log|debug) src -> clean (no matches); git status -> only the 7 intended files (2 modified + 5 new)`
- `Verified: node parity probe server/ vs deploy/ -> only invoices-doc.php + invoiceDoc.php missing in deploy/` (logo-*.php drift pre-existing; validation/ mapping by design — next `npm run build:deploy` mirrors the two new files with zero script changes)
- `Unverified: full default Playwright suite green after this change` — owner: next hygiene/full-suite run; only `invoice-doc.spec.js` + `invoice-installment.spec.js`-adjacent paths were exercised, so cross-tab regressions are not claimed.

## 10. Deferred with owners (taste #53)

| Item | Owner / resolving venue | Why deferred |
|---|---|---|
| Server settings endpoint (branding/bank/signer in MySQL) | Next settings chain (re-plan, not patch) | New surface + migration; POST-body snapshot covers this gate |
| Restyle/retire of client `InvoiceTemplate.jsx` print path | Follow-up microtask after this gate | One concern per edit; client print stays as offline fallback |
| Legacy `BRANCH-YYYYMM-XXXX` display on old local-only drafts | CLIENT_ROUND I2.2 | Format-only change, no ledger semantics; untouched here |
| True `.pdf` bytes from the server (PDF lib / headless renderer) | Later round per CLIENT_ROUND R4 | Explicitly superseded for this gate (D-IP1): browser Save-as-PDF on the clean doc satisfies the artifact need with zero deps |

## 11. Cross-references

- `docs/UNIVERSAL.md` — Core Checklist + Executor Loop + Verification Language (primary contract).
- `docs/IMPLEMENTATION_PLAN.md` Part 2 (ledger principle), Part 6 R1/R4/R6.
- `docs/CLIENT_ROUND_PLAN.md` §6 placeholder map, D1/D2, F5/F7, R2/R4; `docs/CLIENT_ROUND_MILESTONES.md` G2.2/G2.3.
- `docs/SPP_BILLING_PLAN.md` §4 D-SB8/D-SB10, §5 R-SB1/R-SB2/R-SB6, §7 derived status.
- `docs/SCOPE_EXPANSION_PRIVILEGES.md` — invoices superadmin-write / admin_cabang read-only.
- Code: `src/features/reports/InvoiceTemplate.jsx:6-7,48-75,120-158`, `src/features/reports/InvoiceModal.jsx:85-102,199-250`, `src/lib/invoices.js:130-213,324-350`, `src/lib/store.js:641-655`, `src/lib/terbilang.js`, `server/lib/invoiceGenerator.php:111-167`, `server/api/invoices-generate.php`, `server/api/photo-download.php`, `server/api/logo-download.php`, `server/auth/authorize.php:10-20,109-117`, `public/invoice/logo.png`, `public/invoice/signature.png`.
