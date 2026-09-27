import { describe, it, expect } from 'vitest'
import { honorSettlement } from '../honor.js'

// ============================================================
// EF.B.2 — Payment statuses + deferral (F-EF5; D-EF6)
// VERIFY: 0 paid = Unpaid sisa penuh; partial = Partially Paid sisa
// benar; full = Paid sisa 0; overpay = Paid + credit; deferral fixture
// keeps payable intact.
// ============================================================

describe('EF.B.2: honorSettlement', () => {
  it('0 paid -> Unpaid, sisa penuh', () => {
    const result = honorSettlement({ payable: 100000, dibayar: 0 })
    expect(result.status).toBe('Unpaid')
    expect(result.sisa).toBe(100000)
    expect(result.credit).toBe(0)
  })

  it('partial paid -> Partially Paid, sisa benar', () => {
    const result = honorSettlement({ payable: 100000, dibayar: 40000 })
    expect(result.status).toBe('Partially Paid')
    expect(result.sisa).toBe(60000)
    expect(result.credit).toBe(0)
  })

  it('full paid -> Paid, sisa 0', () => {
    const result = honorSettlement({ payable: 100000, dibayar: 100000 })
    expect(result.status).toBe('Paid')
    expect(result.sisa).toBe(0)
    expect(result.credit).toBe(0)
  })


  it('overpay -> Paid + credit', () => {
    const result = honorSettlement({ payable: 100000, dibayar: 150000 })
    expect(result.status).toBe('Paid')
    expect(result.sisa).toBe(0)
    expect(result.credit).toBe(50000)
  })

  it('payable 0, dibayar 0 -> Paid (tidak ada kewajiban)', () => {
    const result = honorSettlement({ payable: 0, dibayar: 0 })
    expect(result.status).toBe('Paid')
    expect(result.sisa).toBe(0)
    expect(result.credit).toBe(0)
  })

  it('deferral fixture: payable TETAP UTUH terlepas dari flag deferred', () => {
    const withoutDeferral = honorSettlement({ payable: 100000, dibayar: 40000 })
    const withDeferral = honorSettlement({ payable: 100000, dibayar: 40000, deferred: true, deferredSince: '2026-09-01' })

    // Payable dan sisa harus IDENTIK — deferral tidak pernah mengecilkan payable.
    expect(withDeferral.payable).toBe(withoutDeferral.payable)
    expect(withDeferral.sisa).toBe(withoutDeferral.sisa)
    expect(withDeferral.status).toBe(withoutDeferral.status)

    // Bedanya cuma field deferral muncul.
    expect(withoutDeferral.deferral).toBeNull()
    expect(withDeferral.deferral).toEqual({ note: 'Menunggu kas', since: '2026-09-01' })
  })

  it('deferral tidak pernah muncul untuk row yang sudah Paid', () => {
    const result = honorSettlement({ payable: 100000, dibayar: 100000, deferred: true, deferredSince: '2026-09-01' })
    expect(result.status).toBe('Paid')
    expect(result.deferral).toBeNull()

  })
})