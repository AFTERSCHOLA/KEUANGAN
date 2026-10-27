import { test, expect, loginAndPrime } from './fixtures.js'

// ============================================================
// M-F7 — Trainer card Jadwal collapses behind `Lihat jadwal (N)`.
// Single superadmin session (avoids the second-login session race):
// seeds 2 schools with jadwal + 1 trainer on both, asserts the
// collapsed default, expand content, and re-collapse.
// ============================================================

const APP = 'http://localhost:5173'

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('M-F7: trainer card jadwal collapses and expands', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const csrf = await loginAndPrime(page, 'superadmin')

  const mkSekolah = async (kode, nama, day) => {
    const id = `sch-jd-${kode}-${suffix}`
    const res = await page.request.post('/api/sekolah.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: {
        action: 'create', id, nama, spp: 100000, cabangId: 'cbg-test-pusat',
        jadwalList: [{ dayOfWeek: day, time: '14:00', endTime: '15:00' }],
      },
    })
    expect(res.ok()).toBeTruthy()
    return id
  }
  const schA = await mkSekolah('A', `Sim Sekolah JD A ${suffix}`, 'Senin')
  const schB = await mkSekolah('B', `Sim Sekolah JD B ${suffix}`, 'Rabu')

  const nama = `Sim Trainer JD ${suffix}`
  const created = await page.request.post('/api/users.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      action: 'create', role: 'trainer', username: `jd.t-${suffix}`,
      displayName: nama, cabangId: 'cbg-test-pusat',
      trainer: { nama, wa: '08123456789', honor: 50000, sekolahIds: [schA, schB] },
    },
  })
  expect(created.ok()).toBeTruthy()
  const trainerId = (await created.json())?.trainer?.id
  expect(trainerId).toBeTruthy()

  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Trainer')
  const card = page.locator('div.bg-white', { has: page.getByRole('heading', { name: nama }) }).first()
  await expect(card.getByRole('heading', { name: nama })).toBeVisible()

  // RED before fix: full wall-of-text renders inline, no toggle.
  const toggle = card.getByRole('button', { name: 'Lihat jadwal (2)' })
  await expect(toggle).toBeVisible()
  await expect(card.getByText('Rabu 14:00–15:00')).toHaveCount(0)
  await toggle.click()
  await expect(card.getByText(/Senin 14:00–15:00/)).toBeVisible()
  await expect(card.getByText(/Rabu 14:00–15:00/)).toBeVisible()
  await card.getByRole('button', { name: 'Sembunyikan jadwal' }).click()
  await expect(card.getByText('Rabu 14:00–15:00')).toHaveCount(0)

  // Cleanup (best-effort).
  await page.request.post('/api/trainer.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: trainerId } })
  for (const id of [schA, schB]) {
    await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id } })
  }

  expect(pageErrors).toHaveLength(0)
})
