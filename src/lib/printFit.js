// printFit.js — Task 3 single-page print hub.
//
// Both print templates (InvoiceTemplate, RaportTemplate) shrink their
// printable node to fit one A4 page via `zoom` on `beforeprint` and
// restore it on `afterprint` (same add/removeEventListener idiom as
// docs/exemplar/TEMPLATE_RAPORT_CODING.html).
//
// A4 printable height = 297mm − 2×15mm margins ≈ 267mm ≈ 1010px at
// 96dpi; printable width = 210mm − 2×15mm margins ≈ 180mm ≈ 680px.
// zoom = min(1, min(pageH / el.scrollHeight, pageW / el.scrollWidth)),
// floored at 0.55 so very long docs stay readable instead of
// microprint. Never upscales: content that already fits keeps zoom 1.
// App chrome is removed from print layout in src/print.css (R2.2
// isolation: display:none chrome + animation neutralizer), so the
// printable node sits at page origin and these exact budgets hold.
// Measured effect (TEMP PDF loop): the 794px raport sheet is
// width-bound (680/794 ≈ 0.856 < 1010/1122 ≈ 0.900); the 40-line
// invoice (~1495px tall, 765px wide) stays height-bound (1010/1495 ≈
// 0.676 < 680/765 ≈ 0.889), i.e. effectively unchanged from its Task-3
// height-only zoom — smaller sheets stay readable, longer ones stop at
// the 0.55 floor by design.

const PAGE_PX = 1010
const PAGE_W_PX = 680
// R2.2-round1 epsilon (probe-free PDF proof, numbers recorded): the CSS
// printable height is 267mm = 1009.1px but PAGE_PX rounds it to 1010, so a
// height-bound fit lands at exactly 1010.0 — a deterministic ~1px spill of
// real content keeps a second page (40-line invoice: 1494 × 1010/1494 =
// 1010.7 → 2 pages; raport unaffected, width-bound at 0.856). PRINT_EPS_PX
// = 10 pulls fitted bottoms to ≤1000px (9px clear); invoice zoom
// 0.6765 → 0.6694 disclosed, floor 0.55 intact.
const PRINT_EPS_PX = 10
const ZOOM_FLOOR = 0.55

let lastFittedEl = null

export function fitPrintableToSinglePage(el) {
  // Guard: non-element input returns 1 without throwing.
  if (!el || typeof el !== 'object' || !el.style || typeof el.scrollHeight !== 'number') return 1
  if (!Number.isFinite(el.scrollHeight) || el.scrollHeight <= 0) return 1
  if (!Number.isFinite(el.scrollWidth) || el.scrollWidth <= 0) return 1
  const zoom = Math.max(ZOOM_FLOOR, Math.min(1, Math.min((PAGE_PX - PRINT_EPS_PX) / el.scrollHeight, PAGE_W_PX / el.scrollWidth)))
  try {
    el.style.zoom = String(zoom)
  } catch {
    return 1
  }
  lastFittedEl = el
  if (typeof window !== 'undefined') window.__lastPrintZoom = zoom
  return zoom
}

export function restorePrintFit() {
  try {
    if (lastFittedEl && lastFittedEl.style) lastFittedEl.style.zoom = ''
  } catch {
    // ignore — restore must never throw on an unmounted node
  }
  lastFittedEl = null
  if (typeof window !== 'undefined') {
    try {
      delete window.__lastPrintZoom
    } catch {
      // ignore — marker cleanup is best-effort
    }
  }
}
