/**
 * Standard page header used by every feature page.
 * Left: title + subtitle. Right: optional rightSlot (e.g. PeriodFilter or
 * primary action button).
 */
export default function PageHeader({ title, subtitle, actions, rightSlot, children }) {
  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border flex items-start md:items-center justify-between flex-wrap gap-4">
      <div className="min-w-0">
        <h2 className="text-xl font-bold text-slate-800">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {(actions || rightSlot) && (
        <div className="flex items-center gap-2 flex-wrap">{rightSlot}{actions}</div>
      )}
      {children}
    </div>
  )
}