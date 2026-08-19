// Konversi angka ke teks terbilang Bahasa Indonesia, untuk baris "Terbilang" di invoice.
const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas']

function terbilangRek(n) {
  n = Math.floor(n)
  if (n < 12) return SATUAN[n]
  if (n < 20) return terbilangRek(n - 10) + ' belas'
  if (n < 100) return terbilangRek(Math.floor(n / 10)) + ' puluh' + (n % 10 !== 0 ? ' ' + terbilangRek(n % 10) : '')
  if (n < 200) return 'seratus' + (n - 100 !== 0 ? ' ' + terbilangRek(n - 100) : '')
  if (n < 1000) return terbilangRek(Math.floor(n / 100)) + ' ratus' + (n % 100 !== 0 ? ' ' + terbilangRek(n % 100) : '')
  if (n < 2000) return 'seribu' + (n - 1000 !== 0 ? ' ' + terbilangRek(n - 1000) : '')
  if (n < 1000000) return terbilangRek(Math.floor(n / 1000)) + ' ribu' + (n % 1000 !== 0 ? ' ' + terbilangRek(n % 1000) : '')
  if (n < 1000000000) return terbilangRek(Math.floor(n / 1000000)) + ' juta' + (n % 1000000 !== 0 ? ' ' + terbilangRek(n % 1000000) : '')
  if (n < 1000000000000) return terbilangRek(Math.floor(n / 1000000000)) + ' miliar' + (n % 1000000000 !== 0 ? ' ' + terbilangRek(n % 1000000000) : '')
  return String(n)
}

export function terbilang(n) {
  if (n === 0) return 'Nol Rupiah'
  const raw = terbilangRek(Math.round(n)).trim().replace(/\s+/g, ' ')
  const titled = raw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  return `${titled} Rupiah`
}