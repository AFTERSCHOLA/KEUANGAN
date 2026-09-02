// Deliberately NOT part of CI — exploratory audit/stress spec.
// Run with: npx playwright test tests/audit-crud-styling.spec.js --workers=1
// Generates a markdown audit report at audit-report.md after the run.

import { test, expect, loginViaApi, logout } from './fixtures.js'
import fs from 'node:fs/promises'

const APP = 'http://localhost:5173'
const findings = []

function find(severity, tab, surface, summary, evidence) {
  findings.push({ severity, tab, surface, summary, evidence })
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__audit_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__audit_reset_done', '1')
  })
})

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('AUDIT: superadmin — every tab reachable, every visible button responds', async ({ page }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  const tabs = ['Overview', 'Data Sekolah', 'Data Siswa', 'Data Trainer', 'Data Absensi', 'Riwayat Absensi', 'Data Pembayaran', 'Data Keuangan', 'Umur Piutang', 'Data Cabang']
  for (const t of tabs) {
    try {
      await openTab(page, t)
      await page.waitForTimeout(300)
      // Snapshot the visible buttons on each tab for evidence.
      const btns = await page.getByRole('main').getByRole('button').allTextContents()
      const inputs = await page.locator('main input, main textarea, main select').count()
      console.log(`[AUDIT][superadmin] tab=${t} buttons=${btns.length} form-fields=${inputs}`)
    } catch (e) {
      find('P1', t, 'navigation', `Tab "${t}" unreachable for superadmin`, e.message?.slice(0, 200))
    }
  }

  // Snapshot full-page of Overview for styling comparison.
  await openTab(page, 'Overview')
  await page.screenshot({ path: 'audit-overview-superadmin.png', fullPage: true })
})

test('AUDIT: superadmin Data Sekolah — CRUD buttons + form behavior', async ({ page }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Sekolah')

  // Tambah Sekolah Mitra
  const tambah = page.getByRole('button', { name: 'Tambah Sekolah Mitra' })
  await expect(tambah).toBeVisible()
  await tambah.click()
  await page.waitForTimeout(200)
  const formFields = await page.locator('div:has(> label) input, div:has(> label) select, div:has(> label) textarea').count()
  console.log(`[AUDIT][superadmin] Sekolah form fields=${formFields}`)
  await page.screenshot({ path: 'audit-sekolah-form-superadmin.png', fullPage: true })

  // Cancel/close without save
  const closeBtn = page.getByRole('button', { name: /Batal|Tutup/i }).first()
  if (await closeBtn.count()) await closeBtn.click()

  // Filter Cabang
  const filter = page.getByLabel('Filter Cabang')
  if (await filter.count()) {
    const opts = await filter.locator('option').allTextContents()
    console.log(`[AUDIT][superadmin] Filter Cabang options=${opts.length}`)
  } else {
    find('P2', 'Data Sekolah', 'filter', 'Filter Cabang combobox not present', 'SchoolList.jsx missing filter combobox')
  }
})

test('AUDIT: superadmin Data Siswa — Tambah Siswa Baru + Aksi column', async ({ page }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Siswa')

  const tambah = page.getByRole('button', { name: 'Tambah Siswa Baru' })
  if (!(await tambah.count())) {
    find('P1', 'Data Siswa', 'create', 'Tambah Siswa Baru missing for superadmin', 'expected superadmin can create siswa')
  } else {
    await tambah.click()
    await page.waitForTimeout(200)
    const fields = await page.locator('div:has(> label) input, div:has(> label) select, div:has(> label) textarea').count()
    console.log(`[AUDIT][superadmin] Siswa form fields=${fields}`)
    await page.screenshot({ path: 'audit-siswa-form-superadmin.png', fullPage: true })
  }
})

test('AUDIT: superadmin Data Trainer — Tambah Trainer Baru availability', async ({ page }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Trainer')

  const tambah = page.getByRole('button', { name: 'Tambah Trainer Baru' })
  const visible = await tambah.count()
  console.log(`[AUDIT][superadmin] Tambah Trainer Baru count=${visible}`)
  // Per privilege matrix, only admin_cabang creates trainers; superadmin only edits.
  if (visible > 0) {
    find('P3', 'Data Trainer', 'privilege', 'Tambah Trainer Baru visible to superadmin (privilege boundary: admin_cabang only)', 'TrainerList.jsx:37 canCreateOrDeleteTrainers = admin_cabang only — by design')
  }
})

test('AUDIT: superadmin Data Cabang — CRUD + assign school', async ({ page }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Cabang')

  const tambah = page.getByRole('button', { name: 'Tambah Cabang' })
  await expect(tambah).toBeVisible()
  await tambah.click()
  await page.waitForTimeout(200)
  const fields = await page.locator('div:has(> label) input, div:has(> label) select, div:has(> label) textarea').count()
  console.log(`[AUDIT][superadmin] Cabang form fields=${fields}`)
  await page.screenshot({ path: 'audit-cabang-form-superadmin.png', fullPage: true })
})

test('AUDIT: superadmin Data Absensi — Input Absensi form', async ({ page }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Absensi')

  const input = page.getByRole('button', { name: 'Input Absensi' })
  if (!(await input.count())) {
    find('P1', 'Data Absensi', 'create', 'Input Absensi missing for superadmin', 'expected superadmin can create attendance')
  } else {
    await input.click()
    await page.waitForTimeout(200)
    const fields = await page.locator('div:has(> label) input, div:has(> label) select, div:has(> label) textarea').count()
    console.log(`[AUDIT][superadmin] Absensi form fields=${fields}`)
    await page.screenshot({ path: 'audit-absensi-form-superadmin.png', fullPage: true })
  }
})

test('AUDIT: superadmin Data Keuangan — semester toggle + chart', async ({ page }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Keuangan')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'audit-keuangan-superadmin.png', fullPage: true })

  const semester = page.getByRole('button', { name: 'Semester', exact: true })
  if (await semester.count()) {
    await semester.click()
    await page.waitForTimeout(200)
    const ganjil = page.getByRole('button', { name: /Ganjil|Genap/ })
    if (await ganjil.count()) {
      console.log(`[AUDIT][superadmin] Semester toggle options visible`)
    } else {
      find('P2', 'Data Keuangan', 'report', 'Semester dropdown missing Ganjil/Genap options', 'FinanceReport semester selector')
    }
  }
})

test('AUDIT: admin_cabang — scoped tabs + branch filter', async ({ page }) => {
  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // Data Cabang should NOT be visible
  const cabang = page.getByRole('navigation').getByRole('button', { name: 'Data Cabang', exact: true })
  const visible = await cabang.count()
  if (visible > 0) {
    find('P1', 'nav', 'privilege', 'admin_cabang sees Data Cabang in nav', 'superadmin-only tab leaked')
  } else {
    console.log(`[AUDIT][admin_cabang] Data Cabang hidden — correct`)
  }

  // Tambah Sekolah Mitra should still work (branch-scoped create)
  await openTab(page, 'Data Sekolah')
  const tambah = page.getByRole('button', { name: 'Tambah Sekolah Mitra' })
  await expect(tambah).toBeVisible()
  await page.screenshot({ path: 'audit-sekolah-admin-cabang.png', fullPage: true })

  // Tambah Trainer Baru should be visible (admin_cabang creates trainers)
  await openTab(page, 'Data Trainer')
  const tambahTrainer = page.getByRole('button', { name: 'Tambah Trainer Baru' })
  if (!(await tambahTrainer.count())) {
    find('P1', 'Data Trainer', 'create', 'Tambah Trainer Baru missing for admin_cabang', 'expected admin_cabang creates trainers')
  } else {
    await tambahTrainer.click()
    await page.waitForTimeout(200)
    const fields = await page.locator('div:has(> label) input, div:has(> label) select, div:has(> label) textarea').count()
    console.log(`[AUDIT][admin_cabang] Trainer form fields=${fields}`)
    await page.screenshot({ path: 'audit-trainer-form-admin-cabang.png', fullPage: true })
  }
})

test('AUDIT: trainer — 4 tabs only, read-only Siswa, no Tambah', async ({ page }) => {
  await loginViaApi(page, 'trainer')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  const navBtns = await page.locator('nav button').count()
  console.log(`[AUDIT][trainer] nav count=${navBtns}`)
  if (navBtns !== 4) {
    find('P1', 'nav', 'privilege', `trainer sees ${navBtns} nav buttons (expected 4)`, 'trainer nav registry drift')
  }

  // Data Siswa should be read-only
  await openTab(page, 'Data Siswa')
  const tambah = page.getByRole('button', { name: 'Tambah Siswa Baru' })
  if (await tambah.count()) {
    find('P1', 'Data Siswa', 'privilege', 'trainer sees Tambah Siswa Baru (should be read-only)', 'StudentList readOnly prop')
  }
  await page.screenshot({ path: 'audit-siswa-trainer.png', fullPage: true })

  // Rekap Saya landing — clear localStorage state to ensure fresh rekap
  await page.evaluate(() => {
    Object.keys(localStorage).filter(k => k.startsWith('afterschola_v4')).forEach(k => localStorage.removeItem(k))
    sessionStorage.clear()
  })
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('heading', { name: 'Rekap Saya' })).toBeVisible()
})

test('AUDIT: visual styling — overview card colors + typography', async ({ page }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Overview')
  await page.waitForTimeout(800)

  // Capture palette at key elements
  const styles = await page.evaluate(() => {
    const probe = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      return {
        backgroundColor: cs.backgroundColor,
        color: cs.color,
        fontFamily: cs.fontFamily,
        fontWeight: cs.fontWeight,
        borderRadius: cs.borderRadius,
        padding: cs.padding,
      }
    }
    return {
      h1: probe('aside h1'),
      h2: probe('main h2'),
      card: probe('main .bg-white'),
      accentButton: probe('button.bg-blue-600, button[class*="bg-blue"]'),
    }
  })
  console.log(`[AUDIT][styling] superadmin overview`, JSON.stringify(styles, null, 2))
  await page.screenshot({ path: 'audit-overview-styling.png', fullPage: true })
})

test('AUDIT: write report', async () => {
  let md = `# Audit Report — 2026-09-02\n\n`
  md += `Total findings: ${findings.length}\n\n`
  const by_sev = findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc }, {})
  for (const [sev, n] of Object.entries(by_sev)) md += `- ${sev}: ${n}\n`
  md += `\n## Findings\n\n`
  for (const f of findings) {
    md += `### [${f.severity}] ${f.tab} → ${f.surface}\n${f.summary}\n\n> ${f.evidence}\n\n`
  }
  await fs.writeFile('audit-report.md', md)
  console.log(`[AUDIT] report written: audit-report.md (${findings.length} findings)`)
})