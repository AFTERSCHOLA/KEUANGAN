// PM.5.14 (F-09): Antrean Verifikasi toggle label + persisted state.
//
// VERIFY (PLAYWRIGHT_MIGRATION_MILESTONES.md PM.5.14): open Riwayat Absensi
// as Admin Cabang, assert the toggle label matches the phase (`Tampilkan
// semua absensi` when showAll=false / `Hanya antrian verifikasi` when
// showAll=true), click the toggle, assert the label flips, refresh the page,
// assert the state survived via localStorage.

import { test, expect, loginViaApi } from './fixtures.js'

const APP = 'http://localhost:5173'
const STORAGE_KEY = 'afterschola_v4_riwayat_show_all'

test('PM.5.14: Riwayat toggle label flips and survives refresh', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // Start from a known phase: clear any persisted toggle first.
  await page.evaluate(k => localStorage.removeItem(k), STORAGE_KEY)

  await page.getByRole('navigation').getByRole('button', { name: 'Riwayat Absensi', exact: true }).click()

  // Phase 1 — showAll=false: label reads "Tampilkan semua absensi".
  const toggle = page.getByRole('button', { name: 'Tampilkan semua absensi', exact: true })
  await expect(toggle).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Antrian Verifikasi' })).toBeVisible()

  // Phase 2 — click: label flips, heading follows, state persists to
  // localStorage (RiwayatAbsensi.jsx:23-33).
  await toggle.click()
  await expect(page.getByRole('button', { name: 'Hanya antrian verifikasi', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Semua Absensi' })).toBeVisible()
  expect(await page.evaluate(k => localStorage.getItem(k), STORAGE_KEY)).toBe('true')

  // Phase 3 — refresh: the chosen phase survives the reload.
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.getByRole('navigation').getByRole('button', { name: 'Riwayat Absensi', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Hanya antrian verifikasi', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Semua Absensi' })).toBeVisible()

  // Phase 4 — flip back so the test leaves the storage key clean.
  await page.getByRole('button', { name: 'Hanya antrian verifikasi', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Tampilkan semua absensi', exact: true })).toBeVisible()
  expect(await page.evaluate(k => localStorage.getItem(k), STORAGE_KEY)).toBe('false')

  expect(pageErrors).toHaveLength(0)
})
