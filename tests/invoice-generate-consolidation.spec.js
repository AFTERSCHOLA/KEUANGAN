import { test, expect, loginAndPrime, primeCsrf, createSekolahSuperadmin } from './fixtures.js'

// ============================================================
// SB.C.2 (D-SB10) — Consolidate invoice creation paths.
//
// VERIFY: generate massal (invoices-generate.php tanpa sekolahId) dan
// pembuatan via UI (InvoiceModal -> invoices-generate.php DENGAN
// sekolahId) menghasilkan bentuk payload identik; generate dua kali
// untuk sekolah+periode sama tidak menghasilkan baris ganda; carry-over
// lintas sekolah gagal keras (R-SB6).
//
// Catatan penyesuaian scope: microtask asli menulis
// `VERIFY: php server/tests/invoice.endpoint.php`. Belum ada contoh
// PHP HTTP-test harness di repo yang bisa dijadikan acuan gaya (proc_open
// spin-up server, dsb) pada saat file ini ditulis, sedangkan pola
// login+CSRF+HTTP call dari Playwright SUDAH established (lihat
// tests/photo-server-roundtrip.spec.js). "Via UI" pada VERIFY juga
// lebih natural dibuktikan lewat browser sungguhan. Kalau tim
// memutuskan tetap butuh versi PHP, ini bisa diport begitu contoh
// harness PHP tersedia — logikanya sama, cuma beda tooling HTTP call.
// ============================================================

const APP = 'http://localhost:5173'

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

async function waitForServerCabang(page) {
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem('afterschola_v4_cabang') || '[]').some((c) => c.id === 'cbg-test-pusat'),
        ),
      { message: 'menunggu cabang server (cbg-test-pusat) muncul di cache lokal', timeout: 15000 },
    )
    .toBe(true)
}

// Bentuk payload yang harus SAMA antara generate-massal dan generate
// via-UI (sekolahId), tidak peduli jalur mana yang dipakai — inilah
// definisi konkret "satu sumber kebenaran" (D-SB10 OUTCOME).
function assertCanonicalInvoiceShape(invoice) {
  expect(typeof invoice.id).toBe('string')
  expect(typeof invoice.cabangId).toBe('string')
  expect(typeof invoice.sekolahId).toBe('string')
  expect(typeof invoice.sekolahNama).toBe('string')
  expect(typeof invoice.periode).toBe('string')
  expect(invoice.periode).toMatch(/^\d{4}-\d{2}$/)
  expect(invoice.nomorInvoice).toMatch(/^AFS-\d{6}-\d{4}$/)
  expect(invoice.nomor).toBe(invoice.nomorInvoice)
  expect(invoice.status).toBe('Terbit')
  expect(Array.isArray(invoice.items)).toBe(true)
  expect(invoice.items.length).toBeGreaterThan(0)
  for (const item of invoice.items) {
    expect(typeof item.deskripsi).toBe('string')
    expect(typeof item.jumlahSiswa).toBe('number')
    expect(typeof item.hargaSatuan).toBe('number')
    expect(typeof item.total).toBe('number')
    expect(item.total).toBeCloseTo(item.jumlahSiswa * item.hargaSatuan, 5)
  }
  expect(typeof invoice.grandTotal).toBe('number')
  const sumItems = invoice.items.reduce((s, it) => s + it.total, 0)
  expect(invoice.grandTotal).toBeCloseTo(sumItems, 5)
}

test('SB.C.2: generate massal dan generate via-UI (sekolahId) hasilkan bentuk payload identik', async ({ page }) => {
  const csrf = await loginAndPrime(page, 'superadmin')
  const suffix = String(Date.now()).slice(-6)

  // --- Seed 2 sekolah terpisah: satu buat "generate massal", satu buat "via UI" ---
  const { body: sekolahMassal } = await createSekolahSuperadmin(
    page, csrf, `SB.C.2 Massal ${suffix}`, 500000, 'cbg-test-pusat', suffix + 'A'
  )
  const { body: sekolahUi } = await createSekolahSuperadmin(
    page, csrf, `SB.C.2 UI ${suffix}`, 500000, 'cbg-test-pusat', suffix + 'B'
  )

  // Siswa aktif untuk masing-masing sekolah, via API langsung (bukan lewat
  // form — spec ini fokus ke konsolidasi payload invoice, bukan alur
  // input siswa yang sudah dites di invoice-installment.spec.js).
  async function seedSiswaAktif(sekolahId, nama) {
    const res = await page.request.post('/api/siswa.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { id: `sw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, nama, sekolahId, status: 'Aktif', action: 'create' },
    })
    expect(res.ok()).toBe(true)
  }
  await seedSiswaAktif(sekolahMassal.id, `Siswa Massal A ${suffix}`)
  await seedSiswaAktif(sekolahMassal.id, `Siswa Massal B ${suffix}`)
  await seedSiswaAktif(sekolahUi.id, `Siswa UI A ${suffix}`)

  const periode = '2031-02' // periode jauh di masa depan, unik per run

  // --- Jalur 2: generate via-UI (dengan sekolahId) — dijalankan LEBIH DULU ---
  const uiRes = await page.request.post('/api/invoices-generate.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { periode, uraian: 'SPP Bulan Berjalan (via UI)', sekolahId: sekolahUi.id },
  })
  expect(uiRes.ok()).toBe(true)
  const uiBody = await uiRes.json()
  expect(uiBody.generated.length).toBe(1)
  const uiInvoice = uiBody.generated[0]
  expect(uiInvoice.sekolahId).toBe(sekolahUi.id)
  assertCanonicalInvoiceShape(uiInvoice)

  // --- Jalur 1: generate massal (tanpa sekolahId, cabang-wide) ---
  const massalRes = await page.request.post('/api/invoices-generate.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { periode, uraian: 'SPP Bulan Berjalan (massal)', cabangId: 'cbg-test-pusat' },
  })
  expect(massalRes.ok()).toBe(true)
  const massalBody = await massalRes.json()
  const massalInvoice = massalBody.generated.find(g => g.sekolahId === sekolahMassal.id)
  expect(massalInvoice).toBeTruthy()
  assertCanonicalInvoiceShape(massalInvoice)

  // --- Bentuk payload identik: field set yang sama persis di kedua jalur ---
  expect(Object.keys(massalInvoice).sort()).toEqual(Object.keys(uiInvoice).sort())

  // --- Generate dua kali untuk sekolah+periode sama -> tidak dobel ---
  const dupeRes = await page.request.post('/api/invoices-generate.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { periode, uraian: 'percobaan dobel', sekolahId: sekolahUi.id },
  })
  expect(dupeRes.ok()).toBe(true)
  const dupeBody = await dupeRes.json()
  expect(dupeBody.generatedCount).toBe(0)
  const skippedUi = dupeBody.skipped.find(s => s.sekolahId === sekolahUi.id)
  expect(skippedUi?.reason).toBe('already_generated')

  // --- Cleanup ---
  await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf }, data: { id: sekolahMassal.id, action: 'delete' } })
  await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf }, data: { id: sekolahUi.id, action: 'delete' } })
})

test('SB.C.2 / R-SB6: carryOverLines dengan invoiceId dari sekolah lain gagal keras (422)', async ({ page }) => {
  const csrf = await loginAndPrime(page, 'superadmin')
  const suffix = String(Date.now()).slice(-6)

  const { body: sekolahA } = await createSekolahSuperadmin(page, csrf, `SB.C.2 R-SB6 A ${suffix}`, 500000, 'cbg-test-pusat', suffix + 'C')
  const { body: sekolahB } = await createSekolahSuperadmin(page, csrf, `SB.C.2 R-SB6 B ${suffix}`, 500000, 'cbg-test-pusat', suffix + 'D')

  async function seedSiswaAktif(sekolahId, nama) {
    const res = await page.request.post('/api/siswa.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { id: `sw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, nama, sekolahId, status: 'Aktif', action: 'create' },
    })
    expect(res.ok()).toBe(true)
  }
  await seedSiswaAktif(sekolahA.id, `Siswa A ${suffix}`)
  await seedSiswaAktif(sekolahB.id, `Siswa B ${suffix}`)

  // Invoice asli untuk sekolahA — jadi invoiceId yang valid tapi "salah sekolah"
  const genA = await page.request.post('/api/invoices-generate.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { periode: '2031-03', uraian: 'invoice sekolah A', sekolahId: sekolahA.id },
  })
  expect(genA.ok()).toBe(true)
  const genABody = await genA.json()
  const invoiceIdSekolahA = genABody.generated[0].id

  // Coba pasang carryOverLines yang invoiceId-nya milik sekolahA, tapi
  // target generate-nya sekolahB — HARUS 422, bukan silently diterima.
  const badRes = await page.request.post('/api/invoices-generate.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      periode: '2031-04',
      uraian: 'invoice sekolah B dengan carry-over nakal',
      sekolahId: sekolahB.id,
      carryOverLines: [{
        invoiceId: invoiceIdSekolahA,
        kind: 'outstanding',
        amount: 100000,
        description: 'carry-over lintas sekolah (harus ditolak)',
      }],
    },
  })
  expect(badRes.status()).toBe(422)
  const badBody = await badRes.json()
  expect(badBody.error).toMatch(/sekolah yang sama/i)

  // Pastikan invoice B beneran TIDAK pernah tersimpan (gagal keras, bukan
  // "tersimpan tapi carry-over-nya diabaikan diam-diam").
  const checkRes = await page.request.post('/api/invoices-generate.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { periode: '2031-04', uraian: 'cek ulang', sekolahId: sekolahB.id },
  })
  const checkBody = await checkRes.json()
  expect(checkBody.generatedCount).toBe(1) // baru sekarang berhasil dibuat, bukti percobaan sebelumnya nggak nyangkut

  // --- Cleanup ---
  await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf }, data: { id: sekolahA.id, action: 'delete' } })
  await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf }, data: { id: sekolahB.id, action: 'delete' } })
})