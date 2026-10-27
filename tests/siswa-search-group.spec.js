import { test, expect, loginAndPrime } from './fixtures.js'

// ============================================================
// M-F4 — Data Siswa search + grouping.
// Seeds 2 schools + 3 students via API, then asserts the top bar
// `Cari` filters rows and `Kelompokkan` renders group headers.
// ============================================================

const APP = 'http://localhost:5173'

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('M-F4: Data Siswa search filters and grouping headers render', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const csrf = await loginAndPrime(page, 'superadmin')

  for (const [kode, nama] of [['SGA', `Sim Sekolah GA ${suffix}`], ['SGB', `Sim Sekolah GB ${suffix}`]]) {
    const res = await page.request.post('/api/cabang.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { action: 'create', id: `cbg-${kode}-${suffix}`, kode: `${kode}${suffix}`, nama },
    })
    expect(res.ok()).toBeTruthy()
  }

  const mkSekolah = async (kode, nama) => {
    const res = await page.request.post('/api/sekolah.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { action: 'create', id: `sch-${kode}-${suffix}`, nama, spp: 100000, cabangId: `cbg-${kode}-${suffix}` },
    })
    expect(res.ok()).toBeTruthy()
    return `sch-${kode}-${suffix}`
  }
  const schA = await mkSekolah('SGA', `Sim Sekolah GA ${suffix}`)
  const schB = await mkSekolah('SGB', `Sim Sekolah GB ${suffix}`)

  const mkSiswa = async (id, nama, sekolahId, sekolahNama, extra = {}) => {
    const res = await page.request.post('/api/siswa.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { action: 'create', id, nama, kelas: 'X-1', wa: '08123456789', sekolahId, sekolahNama, status: 'Aktif', ...extra },
    })
    expect(res.ok()).toBeTruthy()
  }
  await mkSiswa(`sis-ga1-${suffix}`, `Sim Alpha ${suffix}`, schA, `Sim Sekolah GA ${suffix}`, { tingkat: 'Beginner' })
  await mkSiswa(`sis-ga2-${suffix}`, `Sim Beta ${suffix}`, schA, `Sim Sekolah GA ${suffix}`, { tingkat: 'Intermediate' })
  await mkSiswa(`sis-gb1-${suffix}`, `Sim Gamma ${suffix}`, schB, `Sim Sekolah GB ${suffix}`)

  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Siswa')

  // RED before fix: no searchbox / grouping select exist.
  const search = page.getByRole('searchbox', { name: 'Cari siswa' })
  await expect(search).toBeVisible()
  await search.fill(`Alpha ${suffix}`)
  await expect(page.getByText(`Sim Alpha ${suffix}`).first()).toBeVisible()
  await expect(page.getByText(`Sim Beta ${suffix}`)).toHaveCount(0)
  await search.fill('')
  await expect(page.getByText(`Sim Beta ${suffix}`).first()).toBeVisible()

  const group = page.getByLabel('Kelompokkan siswa')
  await expect(group).toBeVisible()
  await group.selectOption('sekolah')
  await expect(page.getByText(new RegExp(`Sim Sekolah GA ${suffix} \\(2 siswa\\)`))).toBeVisible()
  await expect(page.getByText(new RegExp(`Sim Sekolah GB ${suffix} \\(1 siswa\\)`))).toBeVisible()
  await group.selectOption('none')
  await expect(page.getByText(`Sim Gamma ${suffix}`).first()).toBeVisible()

  // Cleanup (best-effort).
  for (const id of [`sis-ga1-${suffix}`, `sis-ga2-${suffix}`, `sis-gb1-${suffix}`]) {
    await page.request.post('/api/siswa.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id } })
  }
  for (const id of [schA, schB]) {
    await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id } })
  }
  for (const id of [`cbg-SGA-${suffix}`, `cbg-SGB-${suffix}`]) {
    await page.request.post('/api/cabang.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id } })
  }

  expect(pageErrors).toHaveLength(0)
})
