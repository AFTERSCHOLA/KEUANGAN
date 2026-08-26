import { test as base, expect } from '@playwright/test'

// Suite-wide pageerror collector: auto-installed on every test, writing into a
// fresh per-test array (replaces the dead window.__playwrightConsoleErrors hook).
// Tests read their own array by destructuring `pageErrors` from the fixture.
export const test = base.extend({
  pageErrors: [async ({ page }, use) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await use(errors)
  }, { auto: true }],
})

// M5.1.1: the app boots into a role-picker gate. Every spec that starts from
// a wiped store must select a role before the dashboard renders. The guard is
// idempotent so a deliberate page.reload() inside a test keeps the session.
export async function loginAsAdmin(page) {
  const picker = page.getByText('Pilih Peran Masuk')
  if ((await picker.count()) > 0) {
    await page.getByRole('button', { name: 'Pilih peran Superadmin' }).click()
    await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  }
}

export { expect }
