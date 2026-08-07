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