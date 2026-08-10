import { chromium } from '@playwright/test'

const BASE = 'http://localhost:5173'
const results = []
const check = (name, pass, detail = '') => results.push({ name, pass, detail })

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

// 1. App boots, Pengaturan nav item exists
await page.goto(BASE)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(500)
check('boot: title present', (await page.locator('h1.text-yellow-300').first().textContent()) === 'Afterschola')
const pengaturan = page.getByRole('button', { name: 'Pengaturan' })
check('nav: Pengaturan item visible', await pengaturan.isVisible())
const backupBtn = page.getByRole('button', { name: 'Backup & Restore' })
const pengaturanBox = await pengaturan.boundingBox()
const backupBox = await backupBtn.boundingBox()
check('nav: Pengaturan is below Backup & Restore', pengaturanBox.y > backupBox.y)

// 2. Open Pengaturan modal
await pengaturan.click()
await page.waitForTimeout(300)
check('modal: opens', await page.getByRole('heading', { name: 'Pengaturan' }).isVisible())
check('modal: Logo URL input', await page.getByPlaceholder('https://contoh.com/logo.png').isVisible())
check('modal: Dashboard Title input', await page.getByPlaceholder('Afterschola').isVisible())
check('modal: BackupRestorePanel embedded', await page.getByRole('button', { name: 'Unduh Backup' }).isVisible())
check('modal: Restore picker embedded', await page.getByRole('button', { name: /Pilih File Backup/ }).isVisible())

// 3. Save a new title + logo URL, close modal
await page.getByPlaceholder('Afterschola').fill('SekolahKu')
await page.getByPlaceholder('https://contoh.com/logo.png').fill('https://example.com/logo.png')
await page.getByRole('button', { name: 'Simpan' }).click()
await page.waitForTimeout(300)

// 4. Sidebar title reflects saved setting (persisted in localStorage)
const sidebarTitle = await page.locator('h1.text-yellow-300').first().textContent()
check('sidebar title = saved title', sidebarTitle === 'SekolahKu', `got "${sidebarTitle}"`)
const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_settings') || '{}'))
check('settings persisted to afterschola_v4_settings', settings.title === 'SekolahKu' && settings.logoUrl === 'https://example.com/logo.png', JSON.stringify(settings))

// 5. Reload — title persists
await page.reload()
await page.waitForLoadState('networkidle')
await page.waitForTimeout(500)
const afterReload = await page.locator('h1.text-yellow-300').first().textContent()
check('title persists after reload', afterReload === 'SekolahKu', `got "${afterReload}"`)

check('zero console errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()

for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
}
const failed = results.filter(r => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
