import { describe, it, expect } from 'vitest'
import { formatRupiah } from '../format.js'

describe('formatRupiah defensive guards', () => {
  it('safely formats undefined to Rp 0 without NaN', () => {
    const res = formatRupiah(undefined)
    expect(res).not.toContain('NaN')
    expect(res.replace(/\s/g, ' ')).toBe('Rp 0')
  })

  it('safely formats null to Rp 0', () => {
    const res = formatRupiah(null)
    expect(res).not.toContain('NaN')
    expect(res.replace(/\s/g, ' ')).toBe('Rp 0')
  })

  it('safely formats NaN to Rp 0', () => {
    const res = formatRupiah(NaN)
    expect(res).not.toContain('NaN')
    expect(res.replace(/\s/g, ' ')).toBe('Rp 0')
  })

  it('safely formats non-numeric strings to Rp 0', () => {
    const res = formatRupiah('invalid')
    expect(res).not.toContain('NaN')
    expect(res.replace(/\s/g, ' ')).toBe('Rp 0')
  })

  it('formats valid numbers and numeric strings properly', () => {
    expect(formatRupiah(50000).replace(/\s/g, ' ')).toBe('Rp 50.000')
    expect(formatRupiah('75000').replace(/\s/g, ' ')).toBe('Rp 75.000')
    expect(formatRupiah(0).replace(/\s/g, ' ')).toBe('Rp 0')
  })
})

describe('Invoice item harga resolution fallback', () => {
  function resolveItemHarga(it, invoice = {}) {
    return Number(it.hargaSatuan ?? it.tarifPerPertemuan ?? invoice.hargaSatuan ?? 0) || 0
  }

  it('uses hargaSatuan when present', () => {
    const item = { hargaSatuan: 50000, tarifPerPertemuan: 60000 }
    expect(resolveItemHarga(item)).toBe(50000)
    expect(formatRupiah(resolveItemHarga(item)).replace(/\s/g, ' ')).toBe('Rp 50.000')
  })

  it('falls back to tarifPerPertemuan when hargaSatuan is missing or undefined', () => {
    const item = { tarifPerPertemuan: 75000 }
    expect(resolveItemHarga(item)).toBe(75000)
    expect(formatRupiah(resolveItemHarga(item)).replace(/\s/g, ' ')).toBe('Rp 75.000')
  })

  it('falls back to invoice.hargaSatuan when item has neither', () => {
    const item = {}
    const invoice = { hargaSatuan: 100000 }
    expect(resolveItemHarga(item, invoice)).toBe(100000)
    expect(formatRupiah(resolveItemHarga(item, invoice)).replace(/\s/g, ' ')).toBe('Rp 100.000')
  })

  it('falls back to 0 when no prices are available', () => {
    const item = {}
    expect(resolveItemHarga(item)).toBe(0)
    expect(formatRupiah(resolveItemHarga(item)).replace(/\s/g, ' ')).toBe('Rp 0')
  })
})

describe('InvoiceModal hargaSatuanEstimasi calculation', () => {
  function calcEstimasi(sekolah, periodeList) {
    return (Number(sekolah?.spp) || 0) * periodeList.length
  }

  it('handles valid spp string or number', () => {
    expect(calcEstimasi({ spp: 50000 }, ['2026-08', '2026-09'])).toBe(100000)
    expect(calcEstimasi({ spp: '50000' }, ['2026-08'])).toBe(50000)
  })

  it('guards against undefined, null, or invalid spp without returning NaN', () => {
    expect(calcEstimasi({}, ['2026-08'])).toBe(0)
    expect(calcEstimasi({ spp: null }, ['2026-08'])).toBe(0)
    expect(calcEstimasi({ spp: 'not-a-number' }, ['2026-08'])).toBe(0)
  })
})
