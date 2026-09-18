import { MONTHS, MONTH_KEYS, periodeKey } from './constants.js'

export { MONTHS, MONTH_KEYS, periodeKey }

export function formatRupiah(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function waNormalize(wa) {
  let digits = wa.replace(/\D/g, "");

  if (digits.startsWith("0")) {
    digits = "62" + digits.slice(1);
  } else if (digits.startsWith("62")) {
    // already correct
  } else if (digits.startsWith("8")) {
    digits = "62" + digits;
  }

  return digits;
}

// TEAM_FEEDBACK D2 (G3.1) — range formatter. Legacy {day,time} entries
// without endTime render as time + 60 min (R6, no crash on old records).
function addOneHour(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''))
  if (!m) return String(time || '')
  const mins = (Number(m[1]) * 60 + Number(m[2]) + 60) % (24 * 60)
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

export function formatJadwalList(jadwalList) {
  if (!Array.isArray(jadwalList) || jadwalList.length === 0) return ''
  return jadwalList.map(entry => {
    if (!entry.time) return entry.dayOfWeek
    return `${entry.dayOfWeek} ${entry.time}–${entry.endTime || addOneHour(entry.time)}`
  }).join(', ')
}