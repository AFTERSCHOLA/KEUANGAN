/**
 * Drop into FinanceReport.jsx's toolbar, alongside the report content.
 * The button itself must carry `no-print` (via print.css) so it doesn't
 * show up on the printed page — already applied here.
 * Uses the export/success button idiom (emerald) per the Part-5 design table.
 */
export default function PrintButton({ className = '' }) {
  return (
    <button
      onClick={() => window.print()}
      className={
        className ||
        'no-print rounded-xl bg-emerald-600 text-white text-sm font-semibold px-4 py-2 hover:bg-emerald-700 transition-colors flex items-center gap-2'
      }
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
          d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a1 1 0 001-1v-4a1 1 0 00-1-1H9a1 1 0 00-1 1v4a1 1 0 001 1zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4" />
      </svg>
      Cetak Laporan
    </button>
  )
}
