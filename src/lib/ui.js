/**
 * Shared Tailwind class strings used across the app. Centralizing them
 * prevents drift (focus:ring-blue-600 vs focus:border-blue-600 vs
 * focus:ring-blue-100) and keeps input/select/label styling consistent.
 */

export const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100'

export const labelClass =
  'block text-sm font-semibold text-slate-700 mb-1.5'

export const selectClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600'