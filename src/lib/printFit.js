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
// Width caps the fixed 794px raport sheet (794 > 680); the top allowance
// makes height govern for both fixtures, invoice unaffected by
// construction (its width ratio ≥ height ratio).

const PAGE_PX = 1010
const PAGE_W_PX = 680
// R2.2 measured print-origin allowance (TEMP PDF loop evidence): ~89px of
// hidden app chrome stays in-flow above the printable node in print media
// (absolute node pins to its transformed wrapper, not the page), so the
// usable height budget is (1010 − 110). Width needs no allowance: with the
// height margin applied, both fixtures use well under 680px (637/460).
const PRINT_TOP_PX = 110
const ZOOM_FLOOR = 0.55

let lastFittedEl = null

export function fitPrintableToSinglePage(el) {
  // Guard: non-element input returns 1 without throwing.
  if (!el || typeof el !== 'object' || !el.style || typeof el.scrollHeight !== 'number') return 1
  if (!Number.isFinite(el.scrollHeight) || el.scrollHeight <= 0) return 1
  if (!Number.isFinite(el.scrollWidth) || el.scrollWidth <= 0) return 1
  const zoom = Math.max(ZOOM_FLOOR, Math.min(1, Math.min((PAGE_PX - PRINT_TOP_PX) / el.scrollHeight, PAGE_W_PX / el.scrollWidth)))
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
