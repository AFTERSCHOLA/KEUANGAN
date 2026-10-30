# Raport AFTERSCHOLA_2 Follow-up — short plan

**Status:** PROPOSED 2026-10-30 — teammate feedback on `test-stage` (Tasks 1–3 done).
**Trigger:** (1) current watermark too transparent/hard to see → revise to
`docs/exemplar/FORMAT RAPORT CODING AFTERSCHOLA_2.docx`; (2) Raport print
still spills to 2 pages (teammate PDF p.2 = lone yellow corner triangle).
**Scope:** short task → single doc (taste #69). Prior execution method
(subagent-driven) preserved; awaiting user confirm before dispatch.

## 1. Phase-1 findings (systematic-debugging, no fix without root cause)

- **F-R1 (transparency):** `_2.docx` body art `word/media/image1.png` is
  268816 B, 637x551, maxAlpha 254 / mean 52.4 / 20% opaque vs live
  `public/raport/watermark.png` (from reev) maxAlpha 31 / mean 4.06 /
  0% opaque. Header (`AfterSchola` brand, AfterSchola logo, pin/phone
  icons) is byte-identical between reev and `_2` — revision is watermark
  + spacing only.
- **F-R2 (spacing):** `_2` removes ONE blank para between title
  (`PENILAIAN AKHIR SISWA`) and intro (19→18 paras); everything else
  (tables, signature order) unchanged. In our absolute layout this ports
  as: intro gap −24px with intro + every block below shifted up equally
  (NOT a Catatan↔signature-only move — user hypothesis corrected with
  evidence; signature is absolute-positioned, no flow lines exist there).
- **F-R3 (2-page root cause):** `.raport-page` is fixed 794x1122
  (`src/print.css`), printable area at `@page A4 margin 1.5cm` is
  ≈680x1010px. `fitPrintableToSinglePage()` fits HEIGHT only
  (`1010/scrollHeight` → zoom ≈0.900 → 1010h x 715w): width 715 > 680
  still overflows → extra page. Teammate spill (≈112px strip showing the
  bottom-right corner art on p.2) equals the FULL unscaled overflow,
  i.e. zoom never applied in their run — consistent with a stale bundle:
  `deploy/assets` (built 10/5) contains zero `AfterSchola`/`printFit`
  bytes. Fix must fit BOTH axes and be proven on a fresh build.
- **F-R4 (test gap):** Task 3 pinned zoom only for the 40-line invoice;
  raport fit was never verified end-to-end (recorded ⚠️). This plan
  closes it with a real print-to-PDF page-count check, iterated per the
  user's suggestion.

## 2. Decisions (concrete picks, taste #17)

- **D-R1:** Watermark = `_2` `image1.png` faded to a wash with max alpha
  ≈70 (vs 31 before — clearly visible like the Word original, still behind
  text), 637x551 native kept, `watermark.png` replaced in place (zero
  code-path change). Exact fade is the implementer's one reasonable pick;
  screenshot vs teammate PDF is the acceptance.
- **D-R2:** Uniform −24px shift of intro + all blocks below (field rows
  369/397, lead, #nilai/#akhir/#catatan, sign-date/role/name) in
  `RaportTemplate.jsx` (inline tops) + `src/print.css` (class tops).
  Title/header untouched.
- **D-R3:** `fitPrintableToSinglePage(el)` fits both axes:
  `zoom = max(0.55, min(1, min(1010/h, 680/w)))` using
  `el.scrollHeight/scrollWidth`; marker + restore unchanged. Invoice path
  (width ≈ printable) is unaffected by construction.
- **D-R4:** Proof = Playwright `page.pdf()` (A4, printBackground) page
  count via `/Type /Page` scan, asserted == 1 for (a) standard raport,
  (b) long-catatan raport, (c) 40-line invoice regression. Iterate until
  green — explicitly requested by user. Full-suite green stays
  `Unverified` (hygiene owns it).

## 3. Microtasks

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-R references>
  RULES:   <constraints>
  DEPENDS: <prior microtask>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable check>
  DONE-IF: verify passes; only intended files changed
```

### R2.1 Swap watermark + port _2 spacing

```text
MICROTASK: Port _2 watermark and spacing
  EDIT:    public/raport/watermark.png (bytes only, D-R1 wash) + src/features/raport/RaportTemplate.jsx (inline tops −24px) + src/print.css (raport absolute tops −24px, positions only)
  FINDS:   F-R1, F-R2
  RULES:   verbatim port, do not invent (taste #11); no layout reflow, positions only; Indonesian copy untouched; temp specs removed after passing (testing #15)
  DEPENDS: none
  OUTCOME: raport shows the dense AfterSchola wash and the tighter title→intro gap with signature moved up equally
  VERIFY:  temp Playwright spec (Sim seeds, deleted after PASS): AfterSchola brand visible, watermark img visible, computed intro top == 285px and sign-date top == 853px, pageErrors 0
  DONE-IF: verify passes; only the three files changed (spec deleted, uncommitted)
```

### R2.2 Fit both axes + prove one page

```text
MICROTASK: Prove one-page print
  EDIT:    src/lib/printFit.js (D-R3 two-axis math only) + tests/print-single.spec.js (extend: raport PDF page-count pins) — plus a TEMP iterator spec (deleted after green) that emits page.pdf() and counts pages
  FINDS:   F-R3, F-R4
  RULES:   one hypothesis per edit (taste #6); floor 0.55 + never-upscale preserved; M-F6 rules untouched; fresh dev build for every PDF check (no stale-bundle evidence, testing #12)
  DEPENDS: R2.1
  OUTCOME: standard raport, long-catatan raport, and 40-line invoice each produce exactly 1 PDF page
  VERIFY:  TEMP spec GREEN three times in a row (standard/long-catatan/40-line invoice all report 1 page), then print-single.spec.js extended pins PASS with pageErrors 0; temp spec deleted
  DONE-IF: verify passes; only the two files changed
```

## 4. Gate exit

Close when: (1) watermark wash visibly matches `_2` intent against teammate
PDF; (2) PDF page count == 1 for all three fixtures on a fresh build;
(3) `npm test` green + no `console.log` in `src/`; (4) completion written
back here (§5).

## 5. Evidence (fill during execution)

- `Unverified:` all — owner: execution loop below.
