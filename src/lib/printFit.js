// printFit.js — Task 3 single-page print hub.
//
// Both print templates (InvoiceTemplate, RaportTemplate) shrink their
// printable node to fit one A4 page via `zoom` on `beforeprint` and
// restore it on `afterprint` (same add/removeEventListener idiom as
// docs/exemplar/TEMPLATE_RAPORT_CODING.html).
//
// A4 printable height = 297mm − 2×15mm margins ≈ 267mm ≈ 1010px at
// 96dpi. zoom = min(1, pagePx / el.scrollHeight), floored at 0.55 so
// very long docs stay readable instead of microprint. Never upscales:
// content that already fits keeps zoom 1.

const PAGE_PX = 1010
const ZOOM_FLOOR = 0.55

let lastFittedEl = null

export function fitPrintableToSinglePage(el) {
  // Guard: non-element input returns 1 without throwing.
  if (!el || typeof el !== 'object' || !el.style || typeof el.scrollHeight !== 'number') return 1
  if (!Number.isFinite(el.scrollHeight) || el.scrollHeight <= 0) return 1
  const zoom = Math.max(ZOOM_FLOOR, Math.min(1, PAGE_PX / el.scrollHeight))
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
