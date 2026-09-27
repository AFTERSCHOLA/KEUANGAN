// ============================================
// EF.B.2 — Honor settlement (F-EF5; D-EF6)
// Payable tetap dari finance.js (EF.B.1, tidak diulang di sini). Fungsi
// pure ini HANYA menurunkan status Unpaid/Partially Paid/Paid + deferral
// note dari payable vs dibayar yang sudah ada — tidak pernah menulis ke
// ledger apa pun, dan payable tidak pernah dikurangi oleh deferral
// (D-EF6: "cash-flow deferral is display/scheduling only").
// ============================================

// D-EF6: Unpaid (paid = 0 < payable); Partially Paid (0 < paid < payable);
// Paid (paid >= payable, termasuk payable 0). sisa = max(0, payable-paid),
// credit = pola lebihBayarHonor yang sudah ada (excess saat overpay).
export function honorSettlement({ payable, dibayar, deferred = false, deferredSince = null }) {
  const payableNum = Number(payable) || 0
  const dibayarNum = Number(dibayar) || 0
  const sisa = Math.max(0, payableNum - dibayarNum)
  const credit = Math.max(0, dibayarNum - payableNum)

  let status
  if (dibayarNum === 0 && payableNum > 0) {
    status = 'Unpaid'
  } else if (dibayarNum > 0 && dibayarNum < payableNum) {
    status = 'Partially Paid'
  } else {
    status = 'Paid'
  }

  // Deferral display-only — tidak pernah muncul untuk row yang sudah
  // Paid, dan TIDAK PERNAH mengubah sisa/payable di atas.
  const deferral = deferred && status !== 'Paid'
    ? { note: 'Menunggu kas', since: deferredSince }
    : null


  return { payable: payableNum, dibayar: dibayarNum, sisa, credit, status, deferral }
}