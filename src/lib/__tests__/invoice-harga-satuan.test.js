import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { execSync } from 'child_process'
import { formatRupiah } from '../format.js'
import InvoiceTemplate from '../../features/reports/InvoiceTemplate.jsx'

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
  function resolveItemHarga(it, invoice = {}, sekolah = {}) {
    return Number(it.hargaSatuan ?? sekolah?.spp ?? it.tarifPerPertemuan ?? invoice.hargaSatuan ?? 0) || 0
  }

  it('uses hargaSatuan when present', () => {
    const item = { hargaSatuan: 50000, tarifPerPertemuan: 60000 }
    expect(resolveItemHarga(item, {}, { spp: 40000 })).toBe(50000)
    expect(formatRupiah(resolveItemHarga(item, {}, { spp: 40000 })).replace(/\s/g, ' ')).toBe('Rp 50.000')
  })

  it('falls back to sekolah.spp when hargaSatuan is missing on flat item', () => {
    const item = {}
    const sekolah = { spp: 45000 }
    expect(resolveItemHarga(item, {}, sekolah)).toBe(45000)
    expect(formatRupiah(resolveItemHarga(item, {}, sekolah)).replace(/\s/g, ' ')).toBe('Rp 45.000')
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

describe('InvoiceTemplate rendering differentiation', () => {
  it('renders flat school invoice with sekolah.spp fallback and Siswa header', () => {
    const invoice = {
      id: 'inv-flat-1',
      status: 'Draft',
      nomor: 'INV/2026/001',
      periode: '2026-09',
      items: [{
        deskripsi: 'SPP Ekskul Robotik September 2026',
        jumlahSiswa: 15,
        total: 750000,
      }],
      grandTotal: 750000,
    }
    const sekolah = { id: 'sch-1', nama: 'SD Sukajadi', spp: 50000 }
    const html = renderToStaticMarkup(React.createElement(InvoiceTemplate, { invoice, sekolah }))

    expect(html).toContain('Siswa')
    expect(html).toContain('Harga')
    expect(html.replace(/\s/g, ' ')).toContain('Rp 50.000')
    expect(html).not.toContain('Tarif per Sesi')
  })

  it('renders trainer-basis invoice with Sesi, Tarif per Sesi, and actual sessions', () => {
    const invoice = {
      id: 'inv-trainer-1',
      status: 'Draft',
      nomor: 'INV/2026/002',
      periode: '2026-09',
      items: [{
        deskripsi: 'Honor Kunjungan Trainer',
        basis: 'trainer',
        tarifPerPertemuan: 85000,
        pertemuanAktual: 4,
        total: 340000,
      }],
      grandTotal: 340000,
    }
    const sekolah = { id: 'sch-2', nama: 'SMP Merdeka', spp: 50000 }
    const html = renderToStaticMarkup(React.createElement(InvoiceTemplate, { invoice, sekolah }))

    expect(html).toContain('Sesi')
    expect(html).toContain('Tarif per Sesi')
    expect(html.replace(/\s/g, ' ')).toContain('Rp 85.000')
    expect(html).toContain('>4<')
  })
})

describe('invoiceDoc.php server rendering differentiation', () => {
  it('renders flat school invoice resolving to sekolah.spp', () => {
    const phpCode = `
      require 'server/lib/invoiceDoc.php';
      $invoice = [
        'id' => 'inv-f-1',
        'status' => 'Draft',
        'items' => [['deskripsi' => 'SPP', 'jumlahSiswa' => 10, 'total' => 450000]],
        'grandTotal' => 450000
      ];
      $sekolah = ['id' => 'skl-1', 'nama' => 'SD Harapan', 'spp' => 45000];
      echo renderInvoiceDoc($invoice, $sekolah, [], null);
    `
    const output = execSync(`php -r "${phpCode.replace(/\n/g, ' ').replace(/"/g, '\\"')}"`).toString()
    expect(output).toContain('Siswa')
    expect(output).toContain('Harga')
    expect(output).toContain('Rp 45.000')
  })

  it('renders trainer-basis invoice with Tarif per Sesi and Sesi', () => {
    const phpCode = `
      require 'server/lib/invoiceDoc.php';
      $invoice = [
        'id' => 'inv-t-1',
        'status' => 'Draft',
        'items' => [['deskripsi' => 'Honor Sesi Trainer', 'basis' => 'trainer', 'tarifPerPertemuan' => 90000, 'pertemuanAktual' => 3, 'total' => 270000]],
        'grandTotal' => 270000
      ];
      $sekolah = ['id' => 'skl-2', 'nama' => 'SMP Maju', 'spp' => 50000];
      echo renderInvoiceDoc($invoice, $sekolah, [], null);
    `
    const output = execSync(`php -r "${phpCode.replace(/\n/g, ' ').replace(/"/g, '\\"')}"`).toString()
    expect(output).toContain('Sesi')
    expect(output).toContain('Tarif per Sesi')
    expect(output).toContain('Rp 90.000')
    expect(output).toContain('>3<')
  })
})

describe('SchoolList openEdit billing method preservation', () => {
  function prepareEditForm(sch) {
    return {
      jadwalList: [],
      trainerIds: [],
      ...sch,
      status: sch.status || 'Aktif',
      cabangId: sch.cabangId,
      metodePembayaran: sch.metodePembayaran || null,
    }
  }

  it('keeps metodePembayaran null when school has no metodePembayaran', () => {
    const sch = { id: 'sch-1', nama: 'SD Sukajadi', spp: 50000 }
    const form = prepareEditForm(sch)
    expect(form.metodePembayaran).toBeNull()
  })

  it('preserves existing metodePembayaran when school has it configured', () => {
    const sch = {
      id: 'sch-2',
      nama: 'SMP Robotik',
      metodePembayaran: {
        basis: 'trainer',
        tarifPerPertemuan: 80000,
        trigger: 'per_bulan',
      },
    }
    const form = prepareEditForm(sch)
    expect(form.metodePembayaran).toEqual({
      basis: 'trainer',
      tarifPerPertemuan: 80000,
      trigger: 'per_bulan',
    })
  })
})

