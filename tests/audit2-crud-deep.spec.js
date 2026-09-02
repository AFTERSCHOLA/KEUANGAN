// Deliberately NOT part of CI — deeper CRUD roundtrip + styling audit.

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
    if (sessionStorage.getItem('__audit2_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__audit2_reset_done', '1')
  })
})

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

async function clearState(page) {
  await page.evaluate(() => {
    Object.keys(localStorage).filter(k => k.startsWith('afterschola_v4')).forEach(k => localStorage.removeItem(k))
    sessionStorage.clear()
  })
}

test('AUDIT2: superadmin Sekolah — full CRUD roundtrip', async ({ page }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Sekolah')

  // CREATE
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await page.waitForTimeout(200)
  const namaInput = page.locator('div:has(> label:text("Nama Sekolah")) input').first()
  await namaInput.fill('SD Audit Sim')
  const sppInput = page.locator('div:has(> label:text("SPP Bulanan")) input').first()
  await sppInput.fill('100000')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await page.waitForTimeout(800)

  // VERIFY card appears
  const card = page.locator('h3', { hasText: 'SD Audit Sim' })
  if (!(await card.count())) {
    find('P1', 'Data Sekolah', 'create', 'Sekolah card missing after save', 'SchoolList save flow')
  } else {
    console.log('[AUDIT2] Sekolah create OK — card visible')
  }

  // EDIT
  const editBtn = page.getByTitle('Edit sekolah').first()
  if (await editBtn.count()) {
    await editBtn.click()
    await page.waitForTimeout(300)
    const editNama = page.locator('div:has(> label:text("Nama Sekolah")) input').first()
    if (await editNama.count()) {
      await editNama.fill('SD Audit Sim Edit')
      await page.getByRole('button', { name: 'Simpan', exact: true }).click()
      await page.waitForTimeout(800)
      const renamed = await page.locator('h3', { hasText: 'SD Audit Sim Edit' }).count()
      if (!renamed) find('P2', 'Data Sekolah', 'edit', 'Edit did not persist rename', 'SchoolList edit flow')
      else console.log('[AUDIT2] Sekolah edit OK')
    } else {
      find('P2', 'Data Sekolah', 'edit', 'Edit modal missing Nama Sekolah field', 'SchoolList edit modal')
    }
  } else {
    find('P2', 'Data Sekolah', 'edit', 'Edit sekolah button missing on card', 'AF1 known issue')
  }

  // DELETE
  const deleteBtn = page.getByRole('button', { name: /Hapus/i }).first()
  if (await deleteBtn.count()) {
    await deleteBtn.click()
    await page.waitForTimeout(300)
    // Confirm dialog flow
    const confirm = page.getByRole('button', { name: /Hapus/i }).last()
    if (await confirm.count()) {
      await confirm.click()
      await page.waitForTimeout(800)
      console.log('[AUDIT2] Sekolah delete OK')
    } else {
      find('P2', 'Data Sekolah', 'delete', 'Delete confirm dialog missing', 'SchoolList delete confirm')
    }
  } else {
    find('P2', 'Data Sekolah', 'delete', 'Hapus button missing on card', 'SchoolList delete action')
  }
})

test('AUDIT2: admin_cabang Sekolah — branch-scoped create', async ({ page }) => {
  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Sekolah')

  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await page.waitForTimeout(200)
  const fields = await page.locator('div:has(> label) input, div:has(> label) select').count()
  console.log(`[AUDIT2][admin_cabang] Sekolah form fields=${fields}`)
  // Branch select should be auto-locked to admin's own branch
  const cabangSelect = page.locator('div:has(> label:text("Cabang")) select')
  const disabled = await cabangSelect.first().isDisabled()
  console.log(`[AUDIT2][admin_cabang] Cabang select disabled=${disabled}`)
  await page.screenshot({ path: 'audit2-sekolah-admin.png', fullPage: true })
})

test('AUDIT2: superadmin Cabang — full create + visible', async ({ page }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Cabang')

  await page.getByRole('button', { name: 'Tambah Cabang' }).click()
  await page.waitForTimeout(300)
  // The form uses labels NOT wrapped in div with input child — fill by
  // label-anchored locator.
  await page.getByText('Nama Cabang', { exact: true }).locator('..').locator('input').fill('Cabang Audit Sim')
  await page.getByText('Kode Cabang', { exact: true }).locator('..').locator('input').fill('CAS')

  // The form requires Admin Cabang fields too (createAdminAccount default true).
  await page.getByText('Nama Admin Cabang', { exact: true }).locator('..').locator('input').fill('Audit Admin Sim')
  await page.getByText('Username Login Admin', { exact: true }).locator('..').locator('input').fill('audit.admin.sim')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await page.waitForTimeout(1500)

  // If password dialog appears, dismiss it.
  const dismiss = page.getByRole('button', { name: /Saya sudah catat, tutup/ })
  if (await dismiss.count()) {
    await dismiss.click()
    await page.waitForTimeout(500)
  }

  const visible = await page.getByText('Cabang Audit Sim', { exact: true }).count()
  console.log(`[AUDIT2][superadmin] Cabang created visible=${visible}`)
  if (!visible) {
    find('P1', 'Data Cabang', 'create', 'Cabang Audit Sim card not visible after save', 'BranchManager create flow may have failed silently')
  }
  await page.screenshot({ path: 'audit2-cabang-after-create.png', fullPage: true })
})

test('AUDIT2: trainer Absensi — QuickSession and Simpan flow shape', async ({ page }) => {
  await loginViaApi(page, 'trainer')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await clearState(page)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await openTab(page, 'Data Absensi')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'audit2-absensi-trainer.png', fullPage: true })

  // If trainer has 0 sekolah assigned, Input Absensi may be disabled or show empty state.
  const inputBtn = page.getByRole('button', { name: 'Input Absensi' })
  console.log(`[AUDIT2][trainer] Input Absensi button count=${await inputBtn.count()}`)
})

test('AUDIT2: visual — palette consistency across tabs', async ({ page }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  const palette = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button.bg-blue-600, button[class*="bg-blue-600"]')].slice(0, 3).map(b => ({
      bg: getComputedStyle(b).backgroundColor,
      color: getComputedStyle(b).color,
      radius: getComputedStyle(b).borderRadius,
      padding: getComputedStyle(b).padding,
    }))
    const cards = [...document.querySelectorAll('main .bg-white')].slice(0, 3).map(c => ({
      bg: getComputedStyle(c).backgroundColor,
      radius: getComputedStyle(c).borderRadius,
      padding: getComputedStyle(c).padding,
      shadow: getComputedStyle(c).boxShadow,
    }))
    return { buttons, cards }
  })
  console.log('[AUDIT2][styling] buttons:', JSON.stringify(palette.buttons))
  console.log('[AUDIT2][styling] cards:', JSON.stringify(palette.cards))

  // Snapshot each tab for visual parity review.
  for (const t of ['Overview', 'Data Sekolah', 'Data Siswa', 'Data Trainer', 'Data Absensi', 'Data Pembayaran', 'Data Keuangan', 'Umur Piutang', 'Data Cabang']) {
    await openTab(page, t)
    await page.waitForTimeout(400)
    await page.screenshot({ path: `audit2-tab-${t.replace(/\s/g, '-')}.png`, fullPage: true })
  }
})

test('AUDIT2: write report', async () => {
  let md = `# Audit Report 2 (deep CRUD + styling) — 2026-09-02\n\n`
  md += `Findings: ${findings.length}\n\n`
  for (const f of findings) {
    md += `- **[${f.severity}]** ${f.tab} → ${f.surface}: ${f.summary}\n  > ${f.evidence}\n`
  }
  await fs.writeFile('audit-report-2.md', md)
  console.log(`[AUDIT2] report: audit-report-2.md`)
})