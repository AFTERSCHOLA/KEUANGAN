// Temporary ad-hoc debug probe (REMOVE after passing) — dumps post-login state.
import { test, expect, loginViaApi } from './fixtures.js'

test('probe: superadmin post-login dump', async ({ page, pageErrors }) => {
  test.setTimeout(90000)
  await loginViaApi(page, 'superadmin')
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(4000)
  const url = page.url()
  const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 1500)
  const navBtns = await page.getByRole('navigation').getByRole('button').allTextContents().catch(() => [])
  const allBtns = (await page.getByRole('button').allTextContents().catch(() => [])).slice(0, 30)
  const lsKeys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('afterschola'))).catch(() => [])
  const cabangRaw = await page.evaluate(() => localStorage.getItem('afterschola_v4_cabang')?.slice(0, 300)).catch(() => null)
  console.log('## PROBE url:', url)
  console.log('## PROBE navBtns:', JSON.stringify(navBtns))
  console.log('## PROBE allBtns:', JSON.stringify(allBtns))
  console.log('## PROBE lsKeys:', JSON.stringify(lsKeys))
  console.log('## PROBE cabangRaw:', cabangRaw)
  console.log('## PROBE bodyHead:', JSON.stringify(bodyText.slice(0, 800)))
  console.log('## PROBE pageErrors:', JSON.stringify(pageErrors))
})
