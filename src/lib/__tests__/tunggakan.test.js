import { describe, expect, it } from 'vitest'
import {
  buildTagihanWaLink,
  elapsedPeriods,
  filterTunggakan,
  isTunggakan,
  sppPaidForPeriode,
} from '../tunggakan.js'

describe('tunggakan helpers', () => {
  it('builds academic periods from July through the selected month', () => {
    expect(elapsedPeriods(2026, 9)).toEqual([
      { monthName: 'Juli', periode: '2026-07' },
      { monthName: 'Agustus', periode: '2026-08' },
      { monthName: 'September', periode: '2026-09' },
    ])
    expect(elapsedPeriods(2026, 2).at(-1)).toEqual({ monthName: 'Februari', periode: '2027-02' })
    expect(elapsedPeriods(2026, 13)).toEqual([])
  })

  it('treats partial and complete ledger payments correctly', () => {
    const siswa = { id: 'student-1', status: 'Aktif' }
    const payments = [
      { siswaId: 'student-1', periode: '2026-08', nominal: 60000 },
      { siswaId: 'student-1', periode: '2026-08', nominal: 40000 },
    ]

    expect(sppPaidForPeriode(siswa, '2026-08', payments, 100000)).toBe(true)
    expect(sppPaidForPeriode(siswa, '2026-09', payments, 100000)).toBe(false)
    expect(isTunggakan(siswa, [{ periode: '2026-08' }], payments, 100000)).toBe(false)
    expect(isTunggakan(siswa, [{ periode: '2026-09' }], payments, 100000)).toBe(true)
  })

  it('excludes trial students and annotates unpaid months with per-student tariffs', () => {
    const active = { id: 'active', nama: 'Aktif', status: 'Aktif' }
    const trial = { id: 'trial', nama: 'Trial', status: 'Trial' }
    const payments = [{ siswaId: 'active', periode: '2026-07', nominal: 75000 }]
    const result = filterTunggakan(
      [active, trial],
      2026,
      8,
      payments,
      siswa => siswa.id === 'active' ? 75000 : 100000,
    )

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('active')
    expect(result[0].unpaidMonths).toEqual(['Agustus'])
    expect(isTunggakan(trial, [{ periode: '2026-07' }], [], 100000)).toBe(false)
  })

  it('builds an encoded Indonesian WhatsApp billing link', () => {
    const link = buildTagihanWaLink({ nama: 'Ayu Putri', wa: '628123' }, 150000, ['Juli', 'Agustus'])

    expect(link).toContain('https://wa.me/628123?text=')
    expect(decodeURIComponent(link.split('?text=')[1])).toBe('Tagihan SPP bulan Agustus untuk Ananda Ayu Putri: Rp 150.000')
  })

  it('recognizes settled school invoices as paid and clears tunggakan', () => {
    const siswa = { id: 'student-1', sekolahId: 'sch-1', status: 'Aktif' }
    const invoice = {
      id: 'inv-1',
      sekolahId: 'sch-1',
      periode: '2026-09',
      grandTotal: 1000000,
      status: 'Terbit',
    }
    const schoolPayment = {
      id: 'pay-sch-1',
      invoiceId: 'inv-1',
      sekolahId: 'sch-1',
      periode: '2026-09',
      nominal: 1000000,
    }

    // When invoice is settled via school payment:
    expect(
      sppPaidForPeriode(siswa, '2026-09', [schoolPayment], 100000, { invoices: [invoice] })
    ).toBe(true)

    // When invoice is not settled (partial or zero payment):
    expect(
      sppPaidForPeriode(siswa, '2026-09', [], 100000, { invoices: [invoice] })
    ).toBe(false)

    // isTunggakan is false when period is covered by settled invoice:
    expect(
      isTunggakan(
        siswa,
        [{ periode: '2026-09' }],
        [schoolPayment],
        100000,
        { invoices: [invoice] }
      )
    ).toBe(false)

    // filterTunggakan excludes students whose periods are settled via school invoice:
    const filtered = filterTunggakan(
      [siswa],
      2026,
      9,
      [
        { siswaId: 'student-1', periode: '2026-07', nominal: 100000 },
        { siswaId: 'student-1', periode: '2026-08', nominal: 100000 },
        schoolPayment,
      ],
      () => 100000,
      { invoices: [invoice] }
    )
    expect(filtered).toHaveLength(0)
  })
})
