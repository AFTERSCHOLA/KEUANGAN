import { test, expect, loginViaApi, primeCsrf, readEntity } from './fixtures.js'

// ============================================================
// Slice 2 — Overview Ringkas/Lengkap.
//
// Toggle segmented Ringkas/Lengkap di header Overview; default
// Ringkas; persist via uiState key overviewMode; Ringkas = tepat
// 4 kartu (Jumlah Siswa Aktif, Pemasukan bulan berjalan,
// Laba/Rugi berjalan, Jumlah Sekolah Mitra); Lengkap = tampilan
// existing. Pola: loginViaApi + getByRole-first + disposable
// data + webServer self-boot (tiru raport-verify.spec.js S5.2).
// ============================================================

const APP = 'http://localhost:5173'

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__ringkas_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__ringkas_reset_done', '1')
  })
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

async function apiPost(page, csrf, url, data) {
  const res = await page.request.post(url, {
    headers: { 'X-CSRF-Token': csrf },
    data,
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status(), body }
}

async function seedSchoolSiswa(page, suffix, tag) {
  await loginViaApi(page, 'superadmin')
  const csrf = await primeCsrf(page)
  const sch = await apiPost(page, csrf, '/api/sekolah.php', {
    action: 'create',
    id: `skl-${tag}-${suffix}`,
    nama: `SD Ringkas ${tag} ${suffix}`,
    spp: 150000,
    cabangId: 'cbg-test-pusat',
  })
  if (sch.status !== 201 && sch.status !== 200) {
    throw new Error(`seed sekolah gagal: ${sch.status} ${JSON.stringify(sch.body)}`)
  }
  const schoolId = sch.body.id || `skl-${tag}-${suffix}`
  const mkSiswa = async (stag, nama, status) => {
    const r = await apiPost(page, csrf, '/api/siswa.php', {
      action: 'create',
      id: `sw-${stag}-${suffix}`,
      nama,
      sekolahId: schoolId,
      status,
    })
    if (r.status !== 201 && r.status !== 200) {
      throw new Error(`seed siswa ${stag} gagal: ${r.status} ${JSON.stringify(r.body)}`)
    }
    return `sw-${stag}-${suffix}`
  }
  const siswaAktif = await mkSiswa(`${tag}a`, `Siswa Ringkas Aktif ${suffix}`, 'Aktif')
  const siswaKeluar = await mkSiswa(`${tag}b`, `Siswa Ringkas Keluar ${suffix}`, 'Berhenti')
  return { schoolId, siswaIds: [siswaAktif, siswaKeluar] }
}

async function cleanupSeeds(page, { schoolIds = [], siswaIds = [] } = {}) {
  try {
    await loginViaApi(page, 'superadmin')
    const csrf = await primeCsrf(page)
    for (const id of siswaIds) {
      await apiPost(page, csrf, '/api/siswa.php', { action: 'delete', id }).catch(() => {})
    }
    for (const id of schoolIds) {
      await apiPost(page, csrf, '/api/sekolah.php', { action: 'delete', id }).catch(() => {})
    }
  } catch {
    /* abaikan — cleanup best-effort */
  }
}

function ringkasCard(page, label) {
  return page.getByTestId('ringkas-card').filter({ hasText: label })
}

async function cardValue(card) {
  return card.locator('h3').first().innerText()
}

test('R1: fresh state → default Ringkas, tepat 4 kartu dengan angka benar', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  let seeds = { schoolIds: [], siswaIds: [] }

  await resetStorage(page)
  const seed = await seedSchoolSiswa(page, SUFFIX, 'r1')
  seeds = { schoolIds: [seed.schoolId], siswaIds: seed.siswaIds }

  try {
    await loginViaApi(page, 'adminCabang')
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')
    await openTab(page, 'Overview')

    // Toggle ada, default Ringkas terpilih.
    const ringkasBtn = page.getByRole('button', { name: 'Ringkas', exact: true })
    const lengkapBtn = page.getByRole('button', { name: 'Lengkap', exact: true })
    await expect(ringkasBtn).toBeVisible({ timeout: 15000 })
    await expect(lengkapBtn).toBeVisible()
    await expect(ringkasBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(lengkapBtn).toHaveAttribute('aria-pressed', 'false')

    // Tepat 4 kartu Ringkas, label verbatim.
    const cards = page.getByTestId('ringkas-card')
    await expect(cards).toHaveCount(4, { timeout: 15000 })
    for (const label of ['Jumlah Siswa Aktif', 'Pemasukan bulan berjalan', 'Laba/Rugi berjalan', 'Jumlah Sekolah Mitra']) {
      await expect(ringkasCard(page, label)).toBeVisible()
    }

    // Konten Lengkap tersembunyi di mode Ringkas.
    await expect(page.getByText('Laba / Rugi — Periode Berjalan')).toHaveCount(0)

    // Angka = data server dalam scope admin (tahan-polusi: dibaca live via API).
    const csrf = await primeCsrf(page)
    const siswa = await readEntity(page, 'siswa', csrf)
    const sekolah = await readEntity(page, 'sekolah', csrf)
    const expectedAktif = String(siswa.filter(s => s.status === 'Aktif').length)
    const expectedSekolah = String(sekolah.length)
    await expect.poll(() => cardValue(ringkasCard(page, 'Jumlah Siswa Aktif')), { timeout: 15000 }).toBe(expectedAktif)
    await expect.poll(() => cardValue(ringkasCard(page, 'Jumlah Sekolah Mitra')), { timeout: 15000 }).toBe(expectedSekolah)

    // Laba/Rugi: warna mengikuti tanda (emerald bila >= 0, rose bila < 0).
    const labaText = await cardValue(ringkasCard(page, 'Laba/Rugi berjalan'))
    const labaNeg = /[-−(]/.test(labaText) && /\d/.test(labaText)
    await expect(ringkasCard(page, 'Laba/Rugi berjalan').locator('h3').first()).toHaveClass(
      labaNeg ? /text-rose-400/ : /text-emerald-400/
    )

    expect(pageErrors).toHaveLength(0)
  } finally {
    await cleanupSeeds(page, seeds)
  }
})

test('R2: angka Ringkas SAMA dengan angka di mode Lengkap (Pemasukan + Laba/Rugi)', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  let seeds = { schoolIds: [], siswaIds: [] }

  await resetStorage(page)
  const seed = await seedSchoolSiswa(page, SUFFIX, 'r2')
  seeds = { schoolIds: [seed.schoolId], siswaIds: seed.siswaIds }

  try {
    await loginViaApi(page, 'adminCabang')
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')
    await openTab(page, 'Overview')

    await expect(page.getByTestId('ringkas-card')).toHaveCount(4, { timeout: 15000 })
    const pemasukanRingkas = await cardValue(ringkasCard(page, 'Pemasukan bulan berjalan'))
    const labaRingkas = await cardValue(ringkasCard(page, 'Laba/Rugi berjalan'))

    // Pindah ke Lengkap: kartu Ringkas hilang, konten existing muncul.
    await page.getByRole('button', { name: 'Lengkap', exact: true }).click()
    await expect(page.getByTestId('ringkas-card')).toHaveCount(0)
    await expect(page.getByText('Laba / Rugi — Periode Berjalan')).toBeVisible({ timeout: 15000 })

    // Nilai yang sama tampil di mode Lengkap (cross-check, bukan recompute).
    await expect(page.getByText(pemasukanRingkas).first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(labaRingkas).first()).toBeVisible()

    expect(pageErrors).toHaveLength(0)
  } finally {
    await cleanupSeeds(page, seeds)
  }
})

test('R3: pindah ke Lengkap → reload → tetap Lengkap (persist overviewMode)', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  let seeds = { schoolIds: [], siswaIds: [] }

  await resetStorage(page)
  const seed = await seedSchoolSiswa(page, SUFFIX, 'r3')
  seeds = { schoolIds: [seed.schoolId], siswaIds: seed.siswaIds }

  try {
    await loginViaApi(page, 'adminCabang')
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')
    await openTab(page, 'Overview')

    await expect(page.getByTestId('ringkas-card')).toHaveCount(4, { timeout: 15000 })
    await page.getByRole('button', { name: 'Lengkap', exact: true }).click()
    await expect(page.getByTestId('ringkas-card')).toHaveCount(0)

    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await openTab(page, 'Overview')

    // Tetap Lengkap setelah reload: toggle + konten + tanpa kartu Ringkas.
    await expect(page.getByRole('button', { name: 'Lengkap', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Ringkas', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('ringkas-card')).toHaveCount(0)
    await expect(page.getByText('Laba / Rugi — Periode Berjalan')).toBeVisible({ timeout: 15000 })

    expect(pageErrors).toHaveLength(0)
  } finally {
    await cleanupSeeds(page, seeds)
  }
})
