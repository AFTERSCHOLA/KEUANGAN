// AP.A.3 VERIFY (persists per taste #16): editing a school's jadwalList
// propagates to the timetable with ZERO penugasan writes (D-AP2 live
// reference). Run: npx playwright test tests/auto-penugasan-livejadwal.spec.js --project=default --workers=1
import { test, expect, loginViaApi } from './fixtures.js'

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const todayName = DAY_NAMES[new Date().getDay()]
const localToday = (() => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
})()

function fieldInput(page, label) {
  return page.locator(`div:has(> label:text-is("${label}"))`).first().locator('input').first()
}
function fieldSelect(page, label) {
  return page.locator(`div:has(> label:text-is("${label}"))`).first().locator('select').first()
}
async function readViaApi(page, entity, csrf) {
  const res = await page.request.get(`/api/read.php?entity=${entity}`, {
    headers: csrf ? { 'X-CSRF-Token': csrf } : undefined,
  })
  if (!res.ok()) throw new Error(`read ${entity} -> ${res.status()}`)
  const body = await res.json()
  return Array.isArray(body) ? body : (body[entity] || [])
}
async function primeCsrf(page) {
  const res = await page.request.get('/api/auth/csrf.php')
  if (!res.ok()) throw new Error(`csrf prime -> ${res.status()}`)
  return (await res.json()).csrfToken
}

test('AP.A.3 school jadwal edit propagates with zero penugasan writes', async ({ page, pageErrors }) => {
  test.setTimeout(480000)
  const SUFFIX = `aj${String(Date.now()).slice(-6)}`
  const SCH = `SDN AJ ${SUFFIX}`
  const TRAINER_NAME = `Trainer AJ ${SUFFIX}`

  await loginViaApi(page, 'adminCabang')
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('button', { name: 'Data Sekolah' })).toBeVisible({ timeout: 20000 })
  await page.waitForFunction(() => localStorage.getItem('afterschola_v4_cabang') !== null, null, { timeout: 15000 })

  // school with one today slot 15:30-17:00
  await page.getByRole('button', { name: 'Data Sekolah' }).click()
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  const cabangSel = fieldSelect(page, 'Cabang')
  if (await cabangSel.count()) {
    const opts = await cabangSel.locator('option').allTextContents()
    const own = opts.find(o => !o.includes('Pilih') && o.trim() !== '')
    if (own) await cabangSel.selectOption({ label: own.trim() })
  }
  await fieldInput(page, 'Nama Sekolah').fill(SCH)
  await page.getByRole('button', { name: '+ Tambah Jadwal' }).click()
  const newRow = page.locator('div.space-y-2 > .flex.gap-2.items-center').first()
  await newRow.locator('select').selectOption(todayName)
  await newRow.getByLabel('Jam mulai').fill('15:30')
  await newRow.getByLabel('Jam selesai').fill('17:00')
  await page.locator('div:has(> label:text-is("SPP Bulanan"))').first().locator('input').fill('150000')
  await page.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByText(SCH).first()).toBeVisible({ timeout: 15000 })

  // trainer linked (auto-row; no account needed for this guard)
  await page.getByRole('button', { name: 'Data Trainer' }).click()
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await fieldInput(page, 'Nama Trainer').fill(TRAINER_NAME)
  await page.locator('label', { hasText: SCH }).locator('input[type="checkbox"]').check()
  const accBox = page.locator('label', { hasText: 'Buat akun login untuk trainer ini' }).locator('input[type="checkbox"]')
  if (await accBox.count() && await accBox.isChecked()) await accBox.uncheck()
  await page.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByText(TRAINER_NAME).first()).toBeVisible({ timeout: 15000 })

  let csrf = await primeCsrf(page)
  let trainers = await readViaApi(page, 'trainer', csrf)
  let trow = trainers.find(t => t.nama === TRAINER_NAME)
  const before = JSON.stringify(trow.penugasanPengajar || [])
  const versionBefore = trow.version
  expect(JSON.parse(before).length).toBe(1)

  // edit ONLY the school slot time
  await page.getByRole('button', { name: 'Data Sekolah' }).click()
  const card = page.locator('div.bg-white.rounded-2xl', { hasText: SCH }).first()
  await card.getByRole('button', { name: 'Edit sekolah' }).click()
  const editRow = page.locator('div.space-y-2 > .flex.gap-2.items-center').first()
  await editRow.getByLabel('Jam mulai').fill('16:00')
  await editRow.getByLabel('Jam selesai').fill('17:30')
  await page.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByText(SCH).first()).toBeVisible({ timeout: 15000 })

  // trainer payload untouched
  trainers = await readViaApi(page, 'trainer', csrf)
  trow = trainers.find(t => t.nama === TRAINER_NAME)
  console.log(`## AP.A.3 version ${versionBefore} -> ${trow.version}`)
  expect(trow.version).toBe(versionBefore)
  expect(JSON.stringify(trow.penugasanPengajar || [])).toBe(before)

  // timetable shows the NEW time
  await page.getByRole('button', { name: 'Jadwal Penugasan' }).click()
  await page.locator('input[type="date"]').fill(localToday)
  await page.waitForTimeout(800)
  const timeRow = page.locator('tbody tr', { hasText: SCH }).first()
  await expect(timeRow).toBeVisible({ timeout: 15000 })
  const waktuText = await timeRow.textContent()
  console.log('## AP.A.3 timetable row:', JSON.stringify(waktuText?.slice(0, 160)))
  expect(waktuText).toContain('16:00')

  // cleanup
  const schId = (await readViaApi(page, 'sekolah', csrf)).find(s => s.nama === SCH).id
  console.log(`## AP.A.3 cleanup trainer -> ${(await page.request.post('/api/trainer.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: trow.id } })).status()}`)
  console.log(`## AP.A.3 cleanup sekolah -> ${(await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: schId } })).status()}`)
  expect(((await readViaApi(page, 'trainer', csrf)).filter(t => (t.nama || '').includes(SUFFIX))).length).toBe(0)
  expect(((await readViaApi(page, 'sekolah', csrf)).filter(s => (s.nama || '').includes(SUFFIX))).length).toBe(0)

  expect(pageErrors).toHaveLength(0)
})
