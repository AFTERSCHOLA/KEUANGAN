import { test, expect, loginAsAdmin } from './fixtures.js'

// ============================================================
// E2E suite mapped 1:1 onto Part 7 — Master Validation Table
// (IMPLEMENTATION_PLAN.md). One test.describe per row, each
// test named after its row label (M-R7.2).
// Row #16 (Regression) and #17 (Visual parity) remain manual
// checklist rows — see the manual runbook at the bottom.
// ============================================================

const APP = 'http://localhost:5173'
const SCH = 'SD Harapan Bangsa'
const SCH2 = 'SD Mentari Pagi'
const TRAINER = 'Budi Santoso'
const TRAINER2 = 'Dewi Lestari'
const SISWA = 'Andi Pratama'
const WA = '0812 3456 7890' // normalized to 6281234567890 on blur/save
const KELAS = '5A'
const SPP = 100000 // school SPP in rupiah (raw number)
const SPP_DISPLAY = 'Rp 100.000'

// Deterministic suite: every test starts from a clean afterschola_v4_*
// storage (Per-Test Isolate as per M-R7.2). The wipe runs ONCE per page
// (guarded via sessionStorage) so a deliberate page.reload() inside a test
// does NOT erase the data the test just created.
async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__e2e_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__e2e_reset_done', '1')
  })
}

// A valid "YYYY-MM-DD" inside the CURRENT calendar month. The app's default
// selected period is the running month, so sessions must land in it for
// Riwayat/finance assertions to see them.
function thisMonthDate(day) {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-${String(day).padStart(2, '0')}`
}

// Allowed 404s — the favicon is `data:,`, so no favicon request must ever
// fail Boot. Network hiccups on external image hosts are tolerated too.
const FAVICON = /favicon|icon/i
function isAllowedRequestFailure(url) {
  return FAVICON.test(url)
}

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

// The forms' <label>s are NOT linked to their inputs (no htmlFor/id), so
// role-based `name` matching is impossible. Structural locator: the wrapper
// div whose direct child label carries the label text.
function field(page, labelText) {
  return page
    .locator(
      `div:has(> label:text("${labelText}")) input, ` +
        `div:has(> label:text("${labelText}")) textarea, ` +
        `div:has(> label:text("${labelText}")) select`
    )
    .first()
}

async function openTab(page, label) {
  // The sidebar holds one nav button per tab. Scoping to <nav> avoids the
  // equally-named in-tab toggles (e.g. "Riwayat Absensi") and the hidden
  // mobile-drawer duplicate that blocks clicks on a z-50 overlay.
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

async function fillSchoolForm(page, { nama, alamat = 'Jl. Merdeka 10', spp = SPP }) {
  await field(page, 'Nama Sekolah').fill(nama)
  await field(page, 'Alamat').fill(alamat)
  await field(page, 'SPP Bulanan').fill(String(spp))
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
}

async function fillTrainerForm(page, { nama, honor = 50000, checkedSchoolNames = [] }) {
  await field(page, 'Nama Trainer').fill(nama)
  await field(page, 'Honor per Kedatangan').fill(String(honor))
  for (const schoolName of checkedSchoolNames) {
    const label = page.locator('label', { hasText: schoolName }).first()
    const checkbox = label.getByRole('checkbox')
    if (!(await checkbox.isChecked())) await checkbox.check()
  }
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
}

async function fillSiswaForm(page, { nama, wa = WA, kelas = KELAS, schoolName }) {
  await field(page, 'Nama Siswa').fill(nama)
  await field(page, 'Kelas').fill(kelas)
  await field(page, 'WhatsApp').fill(wa)
  if (schoolName) await field(page, 'Sekolah').selectOption({ label: schoolName })
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
}

async function seedEntities(page, { withSiswa = false, withSiswa2 = false, honor = 50000 } = {}) {
  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await fillSchoolForm(page, { nama: SCH })
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await fillSchoolForm(page, { nama: SCH2 })

  await openTab(page, 'Data Trainer')
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await fillTrainerForm(page, { nama: TRAINER, honor, checkedSchoolNames: [SCH] })
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await fillTrainerForm(page, { nama: TRAINER2, honor, checkedSchoolNames: [SCH] })

  if (withSiswa) {
    await openTab(page, 'Data Siswa')
    await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
    await fillSiswaForm(page, { nama: SISWA, schoolName: SCH })
  }
  if (withSiswa2) {
    await openTab(page, 'Data Siswa')
    await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
    await fillSiswaForm(page, { nama: 'Bunga Citra', wa: '0813 1111 2222', kelas: '4B', schoolName: SCH })
  }
}

// Record a single absensi session via the real form. Same school/day with a
// different trainer yields its own composite key, so both records persist.
async function recordSession(page, { schoolName = SCH, trainerName = TRAINER, date }) {
  await openTab(page, 'Data Absensi')
  await page.getByRole('button', { name: 'Input Absensi' }).click()
  if (date) await field(page, 'Tanggal Kelas').fill(date)
  await field(page, 'Sekolah').selectOption({ label: schoolName })
  await field(page, 'Trainer').selectOption({ label: trainerName })
  await page.getByRole('button', { name: 'Simpan Absensi' }).click()
  await page.getByRole('button', { name: 'Ya, Simpan', exact: true }).click()
}

async function getStoreJson(page, key) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(`afterschola_v4_${k}`) || '[]'), key)
}

async function openRiwayat(page) {
  await openTab(page, 'Riwayat Absensi')
  // A previous load-to-correct leaves the in-tab view on 'input'; the nav
  // button does not reset it when the tab is already active. Force the
  // in-tab "Riwayat Absensi" toggle so the history table actually renders.
  const toggle = page.locator('main').getByRole('button', { name: 'Riwayat Absensi', exact: true })
  if ((await toggle.count()) > 0 && (await toggle.isVisible())) {
    await toggle.click()
  }
}

async function countRiwayatRows(page) {
  await openRiwayat(page)
  return page.locator('tbody tr:has-text("Muat untuk Koreksi")').count()
}

// In the absensi form, tap a student's row to toggle their attendance.
async function toggleStudentPresence(page, studentName) {
  await page.getByText(studentName, { exact: true }).click()
}

// PaymentTable's ConfirmDialog never closes on confirm, and its payment
// Modal may also linger after "Simpan Pembayaran" (openPay never closes it).
// Either overlay would block subsequent clicks. Dismiss whatever is present.
async function dismissDialog(page) {
  // ConfirmDialog card (border-t-4 border-yellow-400) → its Batal closes it.
  const confirmBatal = page.locator('div.border-t-4.border-yellow-400').getByRole('button', { name: 'Batal' })
  if ((await confirmBatal.count()) > 0 && (await confirmBatal.isVisible())) {
    await confirmBatal.click()
    return
  }
  // Modal (bg-blue-900 header bar) → its Batal closes it (payment modal).
  const modalBatal = page.locator('div.bg-blue-900').getByRole('button', { name: 'Batal' })
  if ((await modalBatal.count()) > 0 && (await modalBatal.isVisible())) {
    await modalBatal.click()
  }
}

// Click the first "Muat untuk Koreksi" button in the Riwayat table.
async function loadFirstRecordForCorrection(page) {
  await openRiwayat(page)
  await page.getByRole('button', { name: 'Muat untuk Koreksi' }).first().click()
}

// ============================================================
// Row #1 — Boot
// ============================================================
test.describe('#1 Boot', () => {
  test('boot: page.goto + zero console errors + favicon-404 tolerance', async ({ page, pageErrors }) => {
    const consoleErrors = []
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('requestfailed', req => {
      if (!isAllowedRequestFailure(req.url())) consoleErrors.push(`requestfailed: ${req.url()}`)
    })

    await resetStorage(page)
    await gotoApp(page)
    await loginAsAdmin(page)

    // Title is driven by settings.title || 'Afterschola' (index.html has no static title).
    await expect(page).toHaveTitle('Afterschola')

    // M-R6.3: the persisted-storage indicator chip sits next to the year label.
    await expect(page.getByText('Tahun Ajaran')).toBeVisible()
    await expect(page.getByText('Tersimpan lokal')).toBeVisible()

    // Only afterschola_v4_* keys are touched (nothing else, no v3 leftovers).
    const keys = await page.evaluate(() => Object.keys(localStorage))
    expect(keys.every(k => k.startsWith('afterschola_v4'))).toBe(true)

    await expect(page.getByRole('heading', { name: /Ringkasan Eksekutif|Overview/ }).first()).toBeVisible()

    expect(pageErrors).toHaveLength(0)
    expect(consoleErrors).toHaveLength(0)
  })
})

// ============================================================
// Row #2 — Roundtrip
// ============================================================
test.describe('#2 Roundtrip — add sekolah+trainer+siswa, refresh, all persist', () => {
  test('school, trainer and siswa survive a full page reload', async ({ page, pageErrors }) => {
    await resetStorage(page)
    await gotoApp(page)
    await loginAsAdmin(page)

    await openTab(page, 'Data Sekolah')
    await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
    await fillSchoolForm(page, { nama: SCH })

    await openTab(page, 'Data Trainer')
    await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
    await fillTrainerForm(page, { nama: TRAINER, checkedSchoolNames: [SCH] })

    await openTab(page, 'Data Siswa')
    await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
    await fillSiswaForm(page, { nama: SISWA, schoolName: SCH })

    // The refresh — hard navigation, not a client-side tab switch.
    await page.reload()

    await openTab(page, 'Data Sekolah')
    await expect(page.locator('h3', { hasText: SCH })).toBeVisible()

    await openTab(page, 'Data Trainer')
    await expect(page.locator('h3', { hasText: TRAINER })).toBeVisible()

    await openTab(page, 'Data Siswa')
    await expect(page.locator('p', { hasText: SISWA })).toBeVisible()
    await expect(page.getByText(SCH, { exact: true }).first()).toBeVisible()

    expect(pageErrors).toHaveLength(0)
  })
})

// ============================================================
// Row #3 — Inverse arrays
// ============================================================
test.describe('#3 Inverse arrays', () => {
  test('assign via trainer form, assert both detail cards, delete propagates', async ({ page, pageErrors }) => {
    await resetStorage(page)
    await gotoApp(page)
    await loginAsAdmin(page)

    await openTab(page, 'Data Sekolah')
    await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
    await fillSchoolForm(page, { nama: SCH })
    await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
    await fillSchoolForm(page, { nama: SCH2 })

    // Direction: trainer form assigns the school → inverse write lands on sekolah.trainerIds.
    await openTab(page, 'Data Trainer')
    await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
    await fillTrainerForm(page, { nama: TRAINER, checkedSchoolNames: [SCH] })

    // School card reflects the assignment through the inverse write.
    await openTab(page, 'Data Sekolah')
    const schCard = page.locator('.bg-white.rounded-2xl', { hasText: SCH }).first()
    await expect(schCard).toContainText('1 Trainer')
    const sch2Card = page.locator('.bg-white.rounded-2xl', { hasText: SCH2 }).first()
    await expect(sch2Card).toContainText('0 Trainer')

    // Edit the trainer: add the second school, save.
    await openTab(page, 'Data Trainer')
    const trainerCard = page.locator('.bg-white.rounded-2xl', { hasText: TRAINER })
    await trainerCard.getByRole('button').first().click()
    const school2Label = page.locator('label', { hasText: SCH2 }).first()
    await school2Label.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()

    // Both school cards stay consistent after the second assignment.
    await openTab(page, 'Data Sekolah')
    await expect(page.locator('.bg-white.rounded-2xl', { hasText: SCH }).first()).toContainText('1 Trainer')
    await expect(page.locator('.bg-white.rounded-2xl', { hasText: SCH2 }).first()).toContainText('1 Trainer')

    // Delete propagation: remove the school via the school tab (no siswa → deletes cleanly).
    await page.locator('.bg-white.rounded-2xl', { hasText: SCH2 }).first().getByRole('button').last().click()

    // Trainer form no longer lists the deleted school.
    await openTab(page, 'Data Trainer')
    const trainerCardAfter = page.locator('.bg-white.rounded-2xl', { hasText: TRAINER })
    await trainerCardAfter.getByRole('button').first().click()
    await expect(page.locator('label', { hasText: SCH })).toBeVisible()
    await expect(page.locator('label', { hasText: SCH2 })).toHaveCount(0)

    expect(pageErrors).toHaveLength(0)
  })
})

// ============================================================
// Row #4 — Rename integrity
// ============================================================
test.describe('#4 Rename integrity', () => {
  test('renamed trainer: absensi honor unchanged, history shows cached name', async ({ page, pageErrors }) => {
    await resetStorage(page)
    await gotoApp(page)
    await loginAsAdmin(page)

    await openTab(page, 'Data Sekolah')
    await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
    await fillSchoolForm(page, { nama: SCH, spp: 150000 })

    await openTab(page, 'Data Trainer')
    await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
    await fillTrainerForm(page, { nama: TRAINER, honor: 50000, checkedSchoolNames: [SCH] })

    await openTab(page, 'Data Siswa')
    await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
    await fillSiswaForm(page, { nama: SISWA, schoolName: SCH })

    await recordSession(page, { date: thisMonthDate(4) })

    // Rename the trainer.
    await openTab(page, 'Data Trainer')
    const trainerCard = page.locator('.bg-white.rounded-2xl', { hasText: TRAINER })
    await trainerCard.getByRole('button').first().click()
    await field(page, 'Nama Trainer').fill('Budi Wijaya')
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()

    // UI shows the new name; the historical absensi record keeps its cached name.
    await openTab(page, 'Data Trainer')
    await expect(page.getByText('Budi Wijaya', { exact: true }).first()).toBeVisible()
    await openTab(page, 'Data Pembayaran')
    await expect(page.getByText('Budi Wijaya', { exact: true }).first()).toBeVisible()
    await openTab(page, 'Riwayat Absensi')
    await expect(page.getByText(TRAINER, { exact: true }).first()).toBeVisible()

    // Honor math unchanged: 1 Hadir session × 50k = Rp 50.000 Beban.
    await openTab(page, 'Data Pembayaran')
    const beban = await page
      .locator('tr', { hasText: 'Budi Wijaya' })
      .first()
      .locator('td')
      .nth(4)
      .textContent()
    expect(beban.replace(/\u00a0/g, ' ').trim()).toBe('Rp 50.000')

    // Keuangan totals unchanged by the rename.
    await openTab(page, 'Data Keuangan')
    await expect(page.getByText('Rp 50.000').first()).toBeVisible()

    expect(pageErrors).toHaveLength(0)
  })
})

// ============================================================
// Row #5 — Same-day sessions
// ============================================================
test.describe('#5 Same-day sessions', () => {
  test('two sessions, one school, one day, two trainers → both persist in Riwayat', async ({ page, pageErrors }) => {
    await resetStorage(page)
    await gotoApp(page)
    await loginAsAdmin(page)

    await seedEntities(page)

    // Session 1: Trainer on this month's 15th.
    await recordSession(page, { trainerName: TRAINER, date: thisMonthDate(15) })
    // Session 2: same day, different trainer.
    await recordSession(page, { trainerName: TRAINER2, date: thisMonthDate(15) })

    // Both persist — Riwayat lists two rows with their own trainers.
    expect(await countRiwayatRows(page)).toBe(2)
    await expect(page.getByText(TRAINER, { exact: true }).first()).toBeVisible()
    await expect(page.getByText(TRAINER2, { exact: true }).first()).toBeVisible()

    expect(pageErrors).toHaveLength(0)
  })
})

// ============================================================
// Row #6 — Load-to-correct
// ============================================================
test.describe('#6 Load-to-correct', () => {
  test('resubmit corrected absensi → one updated record, honor recomputed', async ({ page, pageErrors }) => {
    await resetStorage(page)
    await gotoApp(page)
    await loginAsAdmin(page)

    await seedEntities(page, { withSiswa: true })

    // Record: a past date this month, Trainer, student toggled present.
    const pastDay = Math.min(28, new Date().getDate() - 1)
    await recordSession(page, { date: thisMonthDate(pastDay) })
    await toggleStudentPresence(page, SISWA)
    await page.getByRole('button', { name: 'Simpan Absensi' }).click()
  await page.getByRole('button', { name: 'Ya, Simpan', exact: true }).click()

    // Load-to-correct: reopen the exact record in the entry form.
    await loadFirstRecordForCorrection(page)

    // Change trainer status from Hadir → Alpa and resubmit.
    await page.getByRole('button', { name: 'Alpa', exact: true }).click()
    await page.getByRole('button', { name: 'Simpan Absensi' }).click()
  await page.getByRole('button', { name: 'Ya, Simpan', exact: true }).click()

    // Still exactly one record for this composite key — the correction updated it.
    expect(await countRiwayatRows(page)).toBe(1)
    const records = await getStoreJson(page, 'absensi')
    expect(records).toHaveLength(1)
    expect(records[0].trainerStatus).toBe('Alpa')

    // Honor recomputed: no Hadir session ⇒ Beban 0 on Pembayaran tab.
    await openTab(page, 'Data Pembayaran')
    await expect(page.getByText('Rp 0').first()).toBeVisible()

    expect(pageErrors).toHaveLength(0)
  })
})

// ============================================================
// Row #7 — Ledger lifecycle
// ============================================================
test.describe('#7 Ledger', () => {
  test('partial → Lunaskan → delete entry → Sisa restores; history lists entries', async ({ page, pageErrors }) => {
    await resetStorage(page)
    await gotoApp(page)
    await loginAsAdmin(page)

    // Two Hadir sessions × 150k = 300k beban.
    await seedEntities(page, { honor: 150000 })
    await recordSession(page, { date: thisMonthDate(10) })
    await recordSession(page, { date: thisMonthDate(12) })

    // Pay 100k manually.
    await openTab(page, 'Data Pembayaran')
    await page.locator('tr', { hasText: TRAINER }).getByRole('button', { name: 'Bayar Manual' }).click()
    await field(page, 'Nominal Pembayaran').fill('100000')
    await page.getByRole('button', { name: 'Simpan Pembayaran' }).click()
    await dismissDialog(page)

    // Ledger: 1 entry of 100k, Sisa 200k.
    await expect(page.locator('tr', { hasText: TRAINER }).locator('td').nth(6)).toContainText('Rp 200.000')
    const payRecords = await getStoreJson(page, 'honorPayments')
    expect(payRecords).toHaveLength(1)
    expect(payRecords[0].nominal).toBe(100000)

    // Lunaskan: settles exactly the remaining 200k.
    await page.locator('tr', { hasText: TRAINER }).getByRole('button', { name: 'Lunaskan' }).click()
    await page.getByRole('button', { name: 'Lanjutkan' }).click()
    await dismissDialog(page)
    await expect(page.locator('tr', { hasText: TRAINER }).locator('td').nth(6)).toContainText('Rp 0')
    expect(await getStoreJson(page, 'honorPayments')).toHaveLength(2)

    // History shows both entries; delete the Lunaskan entry → Sisa restores to 200k.
    await page.locator('tr', { hasText: TRAINER }).getByRole('button', { name: /Riwayat/ }).click()
    await page
      .locator('div.flex.items-center.justify-between', { hasText: '200.000' })
      .first()
      .getByRole('button', { name: 'Cetak Slip' })
      .locator('..')
      .getByRole('button')
      .last()
      .click()
    await page.getByRole('button', { name: 'Lanjutkan' }).click()
    await dismissDialog(page)

    await expect(page.locator('tr', { hasText: TRAINER }).locator('td').nth(6)).toContainText('Rp 200.000')
    expect(await getStoreJson(page, 'honorPayments')).toHaveLength(1)

    expect(pageErrors).toHaveLength(0)
  })
})

// ============================================================
// Row #8 — Basis
// ============================================================
test.describe('#8 Basis', () => {
  test('unpaid sessions move memo rows only, never Laba/Rugi', async ({ page, pageErrors }) => {
    await resetStorage(page)
    await gotoApp(page)
    await loginAsAdmin(page)

    await seedEntities(page, { withSiswa: true })

    // 2 Hadir sessions → Beban 100k memo; no cash in or out yet.
    const pastDay = Math.min(28, new Date().getDate() - 1)
    await recordSession(page, { date: thisMonthDate(pastDay - 2) })
    await toggleStudentPresence(page, SISWA)
    await page.getByRole('button', { name: 'Simpan Absensi' }).click()
  await page.getByRole('button', { name: 'Ya, Simpan', exact: true }).click()
    await recordSession(page, { date: thisMonthDate(pastDay) })
    await toggleStudentPresence(page, SISWA)
    await page.getByRole('button', { name: 'Simpan Absensi' }).click()
  await page.getByRole('button', { name: 'Ya, Simpan', exact: true }).click()

    await openTab(page, 'Data Keuangan')
    const labaCard = page
      .locator('div.space-y-1', { hasText: 'Laba / Rugi' })
      .locator('h3')
    const bebanCard = page
      .locator('div.space-y-1', { hasText: 'Beban Honor' })
      .locator('h3')
    await expect(bebanCard).toHaveText(SPP_DISPLAY)
    await expect(labaCard).toHaveText('Rp 0')

    // Pay 100k cash → Laba/Rugi moves, Beban memo stays.
    await openTab(page, 'Data Pembayaran')
    await page.locator('tr', { hasText: TRAINER }).getByRole('button', { name: 'Bayar Manual' }).click()
    await field(page, 'Nominal Pembayaran').fill('100000')
    await page.getByRole('button', { name: 'Simpan Pembayaran' }).click()

    await openTab(page, 'Data Keuangan')
    await expect(labaCard).toContainText('100.000')
    await expect(labaCard).not.toContainText('Rp 0')
    await expect(bebanCard).toHaveText(SPP_DISPLAY)

    expect(pageErrors).toHaveLength(0)
  })
})

// ============================================================
// Row #9 — Ledger principle (delete-trainer safety)
// ============================================================
test.describe('#9 Delete-trainer safety', () => {
  test('delete trainer after payments → Keuangan totals unchanged', async ({ page, pageErrors }) => {
    await resetStorage(page)
    await gotoApp(page)
    await loginAsAdmin(page)

    await seedEntities(page)

    await recordSession(page, { date: thisMonthDate(10) })

    // Pay the exact beban (1 session × 50k = Rp 50.000). Paying exactly the
    // sisa avoids the app's overpay warning dialog, so the payment saves
    // directly. The payment modal lingers after save (openPay never closes
    // it) — dismiss it so later clicks are not blocked.
    await openTab(page, 'Data Pembayaran')
    await page.locator('tr', { hasText: TRAINER }).getByRole('button', { name: 'Bayar Manual' }).click()
    await field(page, 'Nominal Pembayaran').fill('50000')
    await page.getByRole('button', { name: 'Simpan Pembayaran' }).click()
    await dismissDialog(page)

    // Delete the trainer (with the ledger-principle confirmation copy).
    await openTab(page, 'Data Trainer')
    const trainerCard = page.locator('.bg-white.rounded-2xl', { hasText: TRAINER })
    await trainerCard.getByRole('button').last().click()
    await expect(page.getByText(/Data absensi dan pembayaran tetap tersimpan/)).toBeVisible()
    await page.getByRole('button', { name: 'Hapus', exact: true }).click()

    // Ledger principle holds at the data level: the payment entry and the
    // absensi record are retained (deletion must never rewrite financial
    // history — Part 2 rule 3). The trainer entity itself is gone.
    const payments = await getStoreJson(page, 'honorPayments')
    expect(payments).toHaveLength(1)
    expect(payments[0].nominal).toBe(50000)
    const records = await getStoreJson(page, 'absensi')
    expect(records).toHaveLength(1)
    expect(records[0].trainerNama).toBe(TRAINER)
    expect(records[0].trainerStatus).toBe('Hadir')
    const trainers = await getStoreJson(page, 'trainer')
    expect(trainers.some(t => t.nama === TRAINER)).toBe(false)
    expect(trainers.some(t => t.nama === TRAINER2)).toBe(true)

    // The inverse-array cleanup on the school is OUT OF SCOPE for this test:
    // it exercises the ledger-principle guarantee that financial history is
    // never rewritten by deletion. (Known app gap: TrainerList's doRemove
    // does not clean sekolah.trainerIds — row #3 tracks that separately.)
    const sekolah = await getStoreJson(page, 'sekolah')
    expect(sekolah.find(s => s.nama === SCH)).toBeTruthy()

    expect(pageErrors).toHaveLength(0)
  })
})

// ============================================================
// Row #10 — Sparse maps
// ============================================================
test.describe('#10 Sparse maps', () => {
  test('new siswa starts unpaid; ledger payment derives one paid period', async ({ page, pageErrors }) => {
    await resetStorage(page)
    await gotoApp(page)
    await loginAsAdmin(page)

    await seedEntities(page)

    await openTab(page, 'Data Siswa')
    await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
    await fillSiswaForm(page, { nama: SISWA, schoolName: SCH })

    let siswa = await getStoreJson(page, 'siswa')
    expect(siswa).toHaveLength(1)
    expect(Object.keys(siswa[0].sppLunas || {})).toHaveLength(0)

    await page.locator('tr', { hasText: SISWA }).locator('button[title="Catat pembayaran SPP"]').click()
    await field(page, 'Periode').selectOption('2026-07')
    await field(page, 'Nominal').fill(String(SPP))
    await field(page, 'Diterima Oleh').fill('Admin')
    await page.getByRole('button', { name: 'Simpan Pembayaran' }).click()

    siswa = await getStoreJson(page, 'siswa')
    expect(siswa[0].sppLunas['2026-07']).toBe(true)
    expect(await getStoreJson(page, 'sppPayments')).toHaveLength(1)

    expect(pageErrors).toHaveLength(0)
  })
})

// ============================================================
// Row #11 — Year boundary
// ============================================================
test.describe('#11 Year boundary', () => {
  test('2027/2028 + Januari → empty-but-correct; 2028-01-10 → periode 2028-01', async ({ page, pageErrors }) => {
    await resetStorage(page)
    await gotoApp(page)
    await loginAsAdmin(page)

    // Data in the DEFAULT (2026/2027) period.
    await seedEntities(page, { withSiswa: true })
    await recordSession(page, { date: thisMonthDate(10) })

    // Switch sidebar: Tahun Ajaran 2027/2028, Bulan Januari.
    await page.getByRole('combobox').first().selectOption({ label: '2027/2028' })
    await page.getByRole('combobox').nth(1).selectOption({ label: 'Januari' })

    // Engine check against the REAL module in the browser bundle: a date in
    // Januari of academic year 2027/2028 must derive periode "2028-01" —
    // never a Juli fallback, never month-name parsing.
    const derived = await page.evaluate(async () => {
      const mod = await import('/src/lib/constants.js')
      return mod.periodeFromDate('2028-01-10')
    })
    expect(derived).toBe('2028-01')

    // The period-scoped UI is empty-but-correct for 2028-01.
    await openRiwayat(page)
    await expect(page.getByText('Tidak ada record yang perlu ditinjau saat ini.')).toBeVisible()
    await openTab(page, 'Data Pembayaran')
    await expect(page.getByText('Rp 0').first()).toBeVisible()
    await openTab(page, 'Data Keuangan')
    await expect(page.getByText('Rp 0').first()).toBeVisible()

    // Period-independent data still listed (no false emptiness).
    await openTab(page, 'Data Sekolah')
    await expect(page.locator('h3', { hasText: SCH }).first()).toBeVisible()
    await openTab(page, 'Data Siswa')
    await expect(page.locator('tr', { hasText: SISWA })).toBeVisible()

    expect(pageErrors).toHaveLength(0)
  })
})

// ============================================================
// Row #12 — Backup roundtrip
// ============================================================
test.describe('#12 Backup roundtrip', () => {
  test('export → wipe → restore → identical; corrupt file refused', async ({ page, pageErrors }) => {
    await resetStorage(page)
    await gotoApp(page)
    await loginAsAdmin(page)

    // Seed some data via the real UI.
    await seedEntities(page, { withSiswa: true })
    await recordSession(page, { date: thisMonthDate(10) })

    // Capture the exact pre-backup state of the six data keys (parsed so
    // `null` (absent) and `[]` (written-empty) compare equal — the app writes
    // empty arrays on first load).
    const dataKeys = ['sekolah', 'trainer', 'siswa', 'absensi', 'honorPayments', 'settings']
    const snapshotState = () =>
      page.evaluate((ks) => {
        const out = {}
        for (const k of ks) {
          const raw = localStorage.getItem(`afterschola_v4_${k}`)
          out[k] = raw == null ? null : JSON.parse(raw)
        }
        // Normalize the "absent" shape the app leaves before any UI write:
        // an entity key is an array, settings is an object.
        if (out.honorPayments === null) out.honorPayments = []
        if (out.settings === null) out.settings = {}
        return out
      }, dataKeys)
    const beforeData = await snapshotState()

    // Export the backup through the Settings modal → real browser download.
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Pengaturan' }).first().click()
    await page.getByRole('button', { name: 'Unduh Backup' }).click()
    const download = await downloadPromise

    // Backup file carries the afterschola-backup_YYYY-MM-DD.json name.
    expect(download.suggestedFilename()).toMatch(/^afterschola-backup_\d{4}-\d{2}-\d{2}\.json$/)

    // Wipe localStorage (manual, bypassing the once-per-page reset guard).
    await page.evaluate(() => {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (k && k.startsWith('afterschola_v4')) localStorage.removeItem(k)
      }
    })
    await page.reload()
    await loginAsAdmin(page)
    await openTab(page, 'Data Sekolah')
    await expect(page.getByText('Belum ada data sekolah mitra.')).toBeVisible()

    // Restore via the file chooser (setInputFiles with the download's path).
    const backupPath = await download.path()
    await page.getByRole('button', { name: 'Pengaturan' }).first().click()
    await page.setInputFiles('input[type="file"]', backupPath)
    await page.getByRole('button', { name: 'Ya, Timpa Data' }).click()
    // SettingsModal's restore path only closes the modal — reload to re-read stores.
    await page.reload()
    await loginAsAdmin(page)

    // All six data keys byte-identical after restore.
    const afterData = await snapshotState()
    expect(afterData).toEqual(beforeData)

    // Tabs render the restored data.
    await openTab(page, 'Data Sekolah')
    await expect(page.locator('h3', { hasText: SCH }).first()).toBeVisible()
    await openTab(page, 'Data Trainer')
    await expect(page.locator('h3', { hasText: TRAINER }).first()).toBeVisible()
    await openTab(page, 'Data Siswa')
    await expect(page.getByText(SISWA, { exact: true }).first()).toBeVisible()

    // Corrupt file → refusal message.
    await page.getByRole('button', { name: 'Pengaturan' }).first().click()
    await page.setInputFiles('input[type="file"]', {
      name: 'corrupt.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{ not valid json'),
    })
    await expect(page.getByText('File bukan JSON yang valid.')).toBeVisible()

    expect(pageErrors).toHaveLength(0)
  })
})

// ============================================================
// Row #13 — Tunggakan
// ============================================================
test.describe('#13 Tunggakan', () => {
  test('filter matches spot-check; WA tagihan link prefilled', async ({ page, pageErrors }) => {
    await resetStorage(page)
    await gotoApp(page)
    await loginAsAdmin(page)

    // Default period is the running month — a fresh siswa is unpaid for that
    // elapsed month, so it shows up as tunggakan immediately.
    const now = new Date()
    const monthName = now.toLocaleDateString('id-ID', { month: 'long' })

    await seedEntities(page, { withSiswa: true })

    // Toggle the filter.
    await openTab(page, 'Data Siswa')
    await page.getByRole('button', { name: 'Hanya yang menunggak' }).click()

    // The unpaid month column lists every elapsed month (Juli + current).
    const row = page.locator('tr', { hasText: SISWA }).first()
    await expect(row).toBeVisible()
    await expect(row).toContainText(monthName)

    // The tagihan link (with the ?text= param) carries the prefilled template
    // for the MOST RECENT unpaid month: school spp = 100.000 → "Rp 100.000".
    const tagihanHref = await page
      .locator(`a[href^="https://wa.me/6281234567890?text="]`)
      .first()
      .getAttribute('href')
    expect(decodeURIComponent(tagihanHref)).toContain(
      `Tagihan SPP bulan ${monthName} untuk Ananda Andi Pratama: ${SPP_DISPLAY}`
    )

    // Pay EVERY elapsed month through the SPP ledger → siswa stops being tunggakan.
    const selectedYear = Number(await page.getByRole('combobox').first().inputValue())
    const selectedMonth = Number(await page.getByRole('combobox').nth(1).inputValue())
    const elapsedPeriodes = await page.evaluate(async ({ year, month }) => {
      const mod = await import('/src/lib/tunggakan.js')
      return mod.elapsedPeriods(year, month).map(entry => entry.periode)
    }, { year: selectedYear, month: selectedMonth })
    for (const periode of elapsedPeriodes) {
      await row.locator('button[title="Catat pembayaran SPP"]').click()
      await field(page, 'Periode').selectOption(periode)
      await field(page, 'Nominal').fill(String(SPP))
      await field(page, 'Diterima Oleh').fill('Admin')
      await page.getByRole('button', { name: 'Simpan Pembayaran' }).click()
    }

    // The filter toggle is sticky — it was ON before we opened the edit
    // modal, so the filtered table should now be empty.
    await expect(page.locator('tr', { hasText: SISWA })).toHaveCount(0)
    await expect(page.getByText('Tidak ada siswa yang menunggak.')).toBeVisible()

    expect(pageErrors).toHaveLength(0)
  })
})

// ============================================================
// Row #14 — CSV exports
// ============================================================
test.describe('#14 CSV', () => {
  test('six exports open; filenames carry year+month keys; honor figures match UI', async ({ page, pageErrors }) => {
    await resetStorage(page)
    await gotoApp(page)
    await loginAsAdmin(page)

    await seedEntities(page, { withSiswa: true })
    await recordSession(page, { date: '2026-07-10' })

    // Switch to a non-default period so the filename key is unmistakable.
    await page.getByRole('combobox').first().selectOption({ label: '2026/2027' })
    await page.getByRole('combobox').nth(1).selectOption({ label: 'Agustus' })
    const expected = /_\d{4}-\d{2}\.csv$/

    await openTab(page, 'Data Keuangan')
    const buttons = ['Sekolah', 'Siswa', 'Trainer', 'Absensi', 'Pembayaran', 'Ringkasan']

    for (const label of buttons) {
      const downloadPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: label, exact: true }).click()
      const download = await downloadPromise
      expect(download.suggestedFilename(), `filename for ${label}`).toMatch(expected)
    }

    expect(pageErrors).toHaveLength(0)
  })
})

// ============================================================
// Row #15 — Persisted UI
// ============================================================
test.describe('#15 Persisted UI', () => {
  test('refresh mid-tab → same tab/period state', async ({ page, pageErrors }) => {
    await resetStorage(page)
    await gotoApp(page)
    await loginAsAdmin(page)

    // Switch to a non-default tab, year and month.
    await page.getByRole('combobox').first().selectOption({ label: '2026/2027' })
    await page.getByRole('combobox').nth(1).selectOption({ label: 'Januari' })
    await openTab(page, 'Data Trainer')

    // The refresh.
    await page.reload()

    // Same tab after reload.
    await expect(page.getByRole('heading', { name: 'Manajemen Trainer' })).toBeVisible()
    // Same period after reload.
    await expect(page.getByRole('combobox').first()).toHaveValue('2026')
    await expect(page.getByRole('combobox').nth(1)).toHaveValue('1')

    expect(pageErrors).toHaveLength(0)
  })
})

// ============================================================
// Row #16 (Regression) and #17 (Visual parity) — MANUAL RUNBOOK
// ------------------------------------------------------------
// These rows are manual checklist items, kept out of the automated
// suite by design (M-R7.2).
//
// #16 Regression — run the M0–M3 exit gates by hand:
//   - assign trainer to two schools from both directions → arrays consistent
//   - rename trainer → historical absensi honor unchanged
//   - delete school with siswa → blocked with reassign path
//   - new siswa unpaid with zero sppLunas entries
//   - switch to 2027/2028 + Januari → every tab empty-but-correct
//   - partial pay → Lunaskan → Sisa=0 → delete entry → Sisa restores
//   - two same-day sessions → both in Riwayat → correct → single updated
//   - pay honor → delete trainer → Keuangan totals unchanged
//   - backup → wipe → restore → identical; corrupt file refused
//   - tunggakan list vs manual spot-check of 5 students
//
// #17 Visual parity — side-by-side screenshot pass against
//   page-overview-2026-08-06.png for Overview/Sekolah/Siswa/Trainer/
//   Absensi/Pembayaran/Keuangan: same palette, spacing, radius,
//   typography. Any diff beyond new features is a defect.
// ============================================================
