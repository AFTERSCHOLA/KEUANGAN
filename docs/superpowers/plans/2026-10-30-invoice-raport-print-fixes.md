# Invoice + Raport Print Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three print/export defects — force long Invoice/Raport to fit one A4 PDF page via scale, move invoice brand to top-left, and swap Raport branding to the AFTERSCHOLA-reev template.

**Architecture:** Single cross-cutting print-fit hub in `src/lib/printFit.js` (beforeprint zoom-to-fit, afterprint restore) applied by both print templates; invoice brand moved display-only in client + server renderers; raport branding swapped verbatim (text + watermark asset + drop YelloBox small logo) with no layout change.

**Tech Stack:** React (Vite), plain CSS `@page`/`@media print` + `zoom`, PHP server renderer `server/lib/invoiceDoc.php`, Playwright E2E (fixtures `tests/fixtures.js`), no new dependencies.

**Spec:** User request 2026-10-30 (3 items) + `docs/exemplar/FORMAT RAPORT CODING AFTERSCHOLA-reev.docx` (ground truth, brand AfterSchola) + `docs/exemplar/FORMAT RAPORT CODING.docx` (old, YELLOBOX.ID) + `docs/INVOICE_DOC_PARITY.md` §6 slot map + `invoice-template.pdf` visual parity + taste docs `D:\File & Documents\Writing\LoreWiki\taste\taste\taste.md` and `taste\testing\taste.md`.

## Global Constraints

- UNIVERSAL primary: one falsifiable hypothesis per edit, smallest slice, verify immediately after first edit, never stack unverified changes.
- No new dependencies (CLIENT_ROUND R4 holds; zoom/print CSS only, no PDF lib).
- Mirror existing idiom, do not invent (taste #11): blob opener stays, slot order in `InvoiceTemplate.jsx`/`invoiceDoc.php` unchanged, raport absolute positions unchanged.
- Indonesian copy pinned (taste #16): `Cetak Invoice`, `Cetak Raport`, `Kembali`, `Dokumen Resmi`, `Terbilang`, `Catatan Pembayaran`, `Hormat Kami`.
- Money/display split unchanged: totals derive from `invoiceTotal()` client / `invoiceDocTotal()` server; carry lines display-only, never feed total.
- Privilege unchanged (taste #33): `authorize('read','invoices',…)` matrix untouched.
- Verification language `Verified: <command> -> <result>` / `Unverified:`; full-suite green stays `Unverified` until hygiene run owns it (testing taste).
- E2E hygiene: clean storage per test, `window.print` intercepted + asserted (testing #29), zero pageerror, Sim-marked entities + cleanup, temp specs removed after passing (testing #15).

## Review Focus

- Very long invoice (e.g. 60+ uraian lines) scaled to unreadably tiny text — a reasonable person expects a minimum readable scale floor (e.g. zoom never below 0.6) with a visible hint, not 0.3x microprint.
- Raport fixed 794x1122 sheet under scale — a reasonable person expects the scale wrapper to not double-shrink the already-fitted A4 sheet on short content (scale must be min(1, fit), never upscale).
- Missing `settings.logoUrl` / offline `/invoice/logo.png` 404 — a reasonable person expects top AfterSchola text to render even when the logo image hides via onError.
- Old cached watermark/logo-small lingering after asset swap — a reasonable person expects no YelloBox cube anywhere after hard refresh (Vite cache / stale dev server per testing #12).
- Server `Dokumen Resmi` vs client `Cetak` parity — a reasonable person expects both to show AfterSchola on top and no bottom brand for the same invoice id.

---

### Task 1: Invoice brand top-left

**Files:**
- Modify: `src/features/reports/InvoiceTemplate.jsx:88-103,194-203`
- Modify: `server/lib/invoiceDoc.php:252-253,281-286`
- Modify: `tests/invoice-footer.spec.js` (assert top, assert no bottom)
- Test: `tests/invoice-footer.spec.js`

**Interfaces:**
- Consumes: `getSettings()` (`logoUrl`, `alamatUsaha`), `LOGO_URL='/invoice/logo.png'` fallback; server `$settings['alamatUsaha']`, `$assets['logoDataUrl']`.
- Produces: top block = logo + `AfterSchola` text + alamat; bottom block = bank note + signature only (no logo/brand). Same contract for client preview and server doc bytes.

- [ ] **Step 1: Write the failing test**

```js
// in tests/invoice-footer.spec.js — top brand, no bottom brand (client + server parity)
await expect(report.getByText('AfterSchola')).toBeVisible()
await expect(report.locator('.printable-report').getByText('AfterSchola')).toHaveCount(1)
const topLogo = report.locator('img[alt="Logo"]')
await expect(topLogo).toBeVisible()
// footer must not carry a second logo/brand
await expect(report.getByAltText('Logo Afterschola')).toHaveCount(0)
// server parity: same invoice id renders top brand once, no footer brand
const docHtml = await (await page.request.post('/api/invoices-doc.php', { headers: { 'X-CSRF-Token': csrf }, data: { id: invoiceId } })).text()
expect(docHtml.match(/AfterSchola/g) || []).toHaveLength(1)
expect(docHtml).not.toContain('Logo Afterschola')
// offline tolerance: hide logo via onError still leaves AfterSchola text visible
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/invoice-footer.spec.js --project=default --workers=1`
Expected: FAIL with `Logo Afterschola` still found / count mismatch (current bottom brand exists).

- [ ] **Step 3: Implement top brand in `src/features/reports/InvoiceTemplate.jsx`**

Remove M-F3 bottom block (`flex items-center gap-2 mt-3` + `Logo Afterschola` + `Afterschola` span). Directly under top-left logo img add `<p class="text-sm font-extrabold text-slate-800 tracking-wide mt-1">AfterSchola</p>` above the existing alamat line. Keep `onError` hide on logo. Exact spelling `AfterSchola`.

- [ ] **Step 4: Implement top brand in `server/lib/invoiceDoc.php`**

Remove `$logoFooterImg` + bottom `<span>Afterschola</span>` leg. Under top `$logoImg` add `<p style="margin:4px 0 0;font-size:14px;font-weight:800;color:#1e293b">AfterSchola</p>` before alamat line. Delete `$logoFooterImg` variable entirely (no dead code).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx playwright test tests/invoice-footer.spec.js --project=default --workers=1`
Expected: PASS, pageErrors 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/reports/InvoiceTemplate.jsx server/lib/invoiceDoc.php tests/invoice-footer.spec.js
git commit -m "fix: move invoice brand AfterSchola to top-left" -m "Remove bottom-left logo+brand per request"
```

### Task 2: Raport AFTERSCHOLA-reev branding swap

**Files:**
- Modify: `src/features/raport/RaportTemplate.jsx:70-94`
- Modify: `src/print.css:97-99` (brand slot only if needed, no position change)
- Create: `public/raport/watermark-afterschola.png` (extracted `image1.png` 626x551 from new .docx, converted to faded watermark opacity)
- Modify: `public/raport/watermark.png` (replace bytes with faded AfterSchola diamond) OR point code at new file — Concrete pick: replace `watermark.png` bytes in place so zero code-path change
- Modify: `src/features/raport/RaportTemplate.jsx` (delete `logo-small.png` img tag, line 88)
- Test: `tests/raport-branding.spec.js` (new, temp per testing #15 — removed after passing — OR persist as regression if suite convention prefers; Concrete pick: temp, removed after PASS)

**Interfaces:**
- Consumes: `public/raport/logo-after-schola.png` (kept), `public/raport/watermark.png` (new bytes), `public/raport/icon-pin.png`, `public/raport/icon-phone.png` (kept).
- Produces: `.raport-sheet` with brand `AfterSchola`, single AfterSchola header logo, AfterSchola watermark; no `YELLOBOX.ID` string and no `logo-small.png` request in network log.

- [ ] **Step 1: Write the failing test**

```js
// tests/raport-branding.spec.js
await expect(page.getByText('AfterSchola')).toBeVisible()
await expect(page.getByText('YELLOBOX.ID')).toHaveCount(0)
const wm = page.locator('.raport-sheet img[src*="watermark"]')
await expect(wm).toBeVisible()
// no YelloBox small-logo request + no upscale on short raport:
// fit returns 1 when content already fits
const shortZoom = await page.evaluate(() => window.__lastPrintZoom ?? 1)
expect(shortZoom).toBe(1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/raport-branding.spec.js --project=default --workers=1`
Expected: FAIL with `YELLOBOX.ID` found.

- [ ] **Step 3: Implement brand + logo removal in `src/features/raport/RaportTemplate.jsx`**

Change `<div className="abs brand">YELLOBOX.ID</div>` to `AfterSchola`. Delete the `<img ... logo-small.png>` line entirely. Keep `logo-after-schola.png` position/size, keep `watermark.png` src path, keep addr/phone/rule/intro/field/tables/signature untouched.

- [ ] **Step 4: Swap watermark bytes**

Extract `word/media/image1.png` from `docs/exemplar/FORMAT RAPORT CODING AFTERSCHOLA-reev.docx`, apply ~12% opacity fade to match old watermark wash, overwrite `public/raport/watermark.png` in place. Verify: `rg logo-small src/features/raport` -> no matches after edit.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx playwright test tests/raport-branding.spec.js --project=default --workers=1`
Expected: PASS, pageErrors 0. Then delete temp spec per testing #15 (or keep if reviewer prefers regression — default delete).

- [ ] **Step 6: Commit**

```bash
git add src/features/raport/RaportTemplate.jsx public/raport/watermark.png
git commit -m "fix: raport branding to AfterSchola reev template" -m "Drop YelloBox small logo, swap watermark"
```

### Task 3: Force single-page scale for Invoice + Raport

**Files:**
- Create: `src/lib/printFit.js` (`fitPrintableToSinglePage()` + `restorePrintFit()`)
- Modify: `src/features/reports/InvoiceTemplate.jsx` (wire beforeprint/afterprint)
- Modify: `src/features/raport/RaportTemplate.jsx` (wire same hub, no-op when already fits)
- Modify: `src/print.css` (`@page { size: A4; margin: 1.5cm; }` kept; add `.print-fit-scale` helper pinned by test)
- Modify: `tests/print-single.spec.js` (re-pin: 40-line invoice calls print AND `zoom < 1` applied, single-page height assert)
- Test: `tests/print-single.spec.js`

**Interfaces:**
- Consumes: `.printable-report` element (invoice) / `.printable-report.raport-sheet .raport-page` (raport, fixed 794x1122).
- Produces: `fitPrintableToSinglePage(el): number` — returns applied zoom (min(1, pageHeight/contentHeight), floor 0.55); `restorePrintFit()` clears zoom. Wired via `window.addEventListener('beforeprint')` / `afterprint` in both templates (same idiom as `TEMPLATE_RAPORT_CODING.html fit()`).

```js
export function fitPrintableToSinglePage(el) // -> applied zoom number
export function restorePrintFit() // -> void
```

- [ ] **Step 1: Write the failing test**

```js
// extend tests/print-single.spec.js — after seeding 40-line invoice:
await page.evaluate(() => { window.__printed = false; window.print = () => { window.__printed = true } })
await page.getByRole('button', { name: 'Cetak Invoice' }).click()
expect(await page.evaluate(() => window.__printed)).toBe(true)
const zoom = await page.evaluate(() => window.__lastPrintZoom)
expect(zoom).toBeLessThan(1)
expect(zoom).toBeGreaterThanOrEqual(0.55)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/print-single.spec.js --project=default --workers=1`
Expected: FAIL with `window.__lastPrintZoom` undefined (hub not yet wired).

- [ ] **Step 3: Implement `fitPrintableToSinglePage(el)` in `src/lib/printFit.js`**

A4 printable height = 297mm − 2×15mm margins ≈ 267mm ≈ 1010px at 96dpi. Compute `zoom = Math.min(1, pagePx / el.scrollHeight)`, clamp floor 0.55, apply `el.style.zoom = zoom`, store `window.__lastPrintZoom = zoom` for testability. `restorePrintFit()` clears zoom + delete marker. No upscale ever.

- [ ] **Step 4: Wire hub into both templates + CSS pin**

In each template add `useEffect`-style `beforeprint` (call fit) / `afterprint` (restore) listeners (mirror `TEMPLATE_RAPORT_CODING.html` beforeprint/afterprint idiom). Add `/* M-FIX print-fit-scale */` comment + `.print-fit-scale` rule in `src/print.css` so the CSS pin has a source anchor.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx playwright test tests/print-single.spec.js --project=default --workers=1`
Expected: PASS, pageErrors 0, zoom in [0.55, 1).

- [ ] **Step 6: Commit**

```bash
git add src/lib/printFit.js src/features/reports/InvoiceTemplate.jsx src/features/raport/RaportTemplate.jsx src/print.css tests/print-single.spec.js
git commit -m "fix: force invoice/raport print to single A4 via scale" -m "beforeprint zoom-to-fit, floor 0.55"
```
