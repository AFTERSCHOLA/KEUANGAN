import { test, expect, loginViaApi, primeCsrf } from './fixtures.js'

// ============================================================
// PG.B.1 — Daily timetable view (Jadwal Penugasan).
//
// VERIFY (docs/PENUGASAN_MILESTONES.md PG.B.1):
// -> seeded school with 2 same-day slots expands to 2 rows with Waktu
//    text equal to formatJadwalList per slot;
// -> another date without slots shows the empty state;
// -> zero pageerror.
// ============================================================

const APP = 'http://localhost:5173'
const TRAINER_ID = 'trn-test-1'
const CABANG_ID = 'cbg-test-pusat'
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

function localYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('PG.B.1: daily timetable expands slots per date, hides other dates', async ({ page, pageErrors }) => {
  // Heavier than sibling specs (school seed + trainer versioned update +
  // full hydrate + date-switch + API cleanup): 60s default races the
  // tail cleanup on slow runs. Scoped to this spec file only.
  test.setTimeout(120_000)
  const suffix = String(Date.now()).slice(-6)
  const now = new Date()
  const today = localYMD(now)
  const todayName = DAY_NAMES[now.getDay()]
  const tomorrow = localYMD(new Date(now.getTime() + 24 * 60 * 60 * 1000))
  const namaSekolah = `SD PGB Sim ${suffix}`
  const sekolahId = `skl-PGB-${Date.now()}`
  const yearAgo = localYMD(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000))
  const yearAhead = localYMD(new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000))

  await loginViaApi(page, 'superadmin')
  let csrf = await primeCsrf(page)
  const sekolahRes = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      id: sekolahId, nama: namaSekolah, spp: 500000, cabangId: CABANG_ID, action: 'create',
      jadwalList: [
        { dayOfWeek: todayName, time: '14:00', endTime: '15:00' },
        { dayOfWeek: todayName, time: '16:00', endTime: '17:00' },
      ],
    },
  })
  if (!sekolahRes.ok()) throw new Error(`seed sekolah failed: ${sekolahRes.status()} ${await sekolahRes.text()}`)

  const trainerListRes = await page.request.get('/api/read.php?entity=trainer')
  if (!trainerListRes.ok()) throw new Error(`read trainer failed: ${trainerListRes.status()}`)
  const currentTrainer = (await trainerListRes.json()).find(t => t.id === TRAINER_ID)
  if (!currentTrainer) throw new Error(`trainer ${TRAINER_ID} missing`)
  const { cabangId: _omit, ...trainerWithoutCabang } = currentTrainer
  const trainerUpdateRes = await page.request.post('/api/trainer.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      ...trainerWithoutCabang, id: TRAINER_ID, action: 'update',
      penugasanPengajar: [...(currentTrainer.penugasanPengajar || []), {
        id: `pgs-PGB-${Date.now()}`, sekolahId, trainerId: TRAINER_ID, asistenId: null,
        cabangId: CABANG_ID, periodeMulai: yearAgo, periodeSelesai: yearAhead, aktif: true,
      }],
    },
  })
  if (!trainerUpdateRes.ok()) throw new Error(`seed penugasan failed: ${trainerUpdateRes.status()} ${await trainerUpdateRes.text()}`)

  try {
    await gotoApp(page)
    await openTab(page, 'Jadwal Penugasan')
    await expect(page.getByRole('heading', { name: 'Jadwal Penugasan' })).toBeVisible()
    await expect(page.getByText(`Tanggal: ${today}`, { exact: false })).toBeVisible({ timeout: 15000 })

    // 2 same-day slots -> 2 rows, Waktu text equals formatJadwalList per slot.
    // Scoped to this run's school rows via text filters (not role name:
    // Chromium exposes no accessible name on <tr> here, so name-filtered
    // row locators never resolve). Leftover seeds from other runs share
    // Waktu text but never this run's school name.
    const row14 = page.getByRole('row').filter({ hasText: namaSekolah }).filter({ hasText: '14:00' })
    const row16 = page.getByRole('row').filter({ hasText: namaSekolah }).filter({ hasText: '16:00' })
    await expect(row14).toBeVisible({ timeout: 15000 })
    await expect(row16).toBeVisible()
    await expect(row14.getByRole('cell', { name: `${todayName} 14:00–15:00`, exact: true })).toBeVisible()
    await expect(row16.getByRole('cell', { name: `${todayName} 16:00–17:00`, exact: true })).toBeVisible()

    // Another date without slots -> empty state, rows hidden.
    // NOTE: getByLabel() never resolves here — the picker label has no
    // htmlFor/id association (same app-wide pattern noted in testing
    // taste #5), so the label engine stalls instead of matching. Target
    // the tab's single date input structurally instead. No app change:
    // the component already re-derives on onChange.
    await page.locator('main input[type="date"]').evaluate((el, v) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, tomorrow)
    await expect(page.getByText('Belum ada jadwal penugasan untuk tanggal ini.')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('cell', { name: namaSekolah })).toHaveCount(0)

    expect(pageErrors).toEqual([])
  } finally {
    // No re-login: this spec never leaves the superadmin session, so the
    // seed-time session is still valid for cleanup API calls. (A redundant
    // loginViaApi POST here stalled the vite→PHP proxy twice in a row;
    // identical re-login patterns pass in specs that actually switch roles.)
    csrf = await primeCsrf(page)
    const listRes = await page.request.get('/api/read.php?entity=trainer')
    if (listRes.ok()) {
      const current = (await listRes.json()).find(t => t.id === TRAINER_ID)
      if (current) {
        const next = (current.penugasanPengajar || []).filter(a => a && a.sekolahId !== sekolahId)
        const { cabangId: _o2, ...rest } = current
        await page.request.post('/api/trainer.php', {
          headers: { 'X-CSRF-Token': csrf },
          data: { ...rest, id: TRAINER_ID, action: 'update', penugasanPengajar: next },
        })
      }
    }
    await page.request.post('/api/sekolah.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { id: sekolahId, action: 'delete' },
    })
  }
})
