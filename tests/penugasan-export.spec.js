import fs from 'node:fs'
import { test, expect, loginViaApi, primeCsrf } from './fixtures.js'

// ============================================================
// PG.C.1 — Timetable CSV export (Unduh CSV).
//
// VERIFY (docs/PENUGASAN_MILESTONES.md PG.C.1):
// -> download fires, filename carries the picked date, parsed rows
//    equal the visible table cells (comma names stay quoted, BOM kept);
// -> zero pageerror.
// ============================================================

const APP = 'http://localhost:5173'
const TRAINER_ID = 'trn-test-1'
const CABANG_ID = 'cbg-test-pusat'
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

function localYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Minimal quote-aware CSV parse (matches downloadCSV quoting in csv.js:
// fields with , \n " come wrapped in ", inner " doubled as "").
function parseCSV(text) {
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* skip */ } else field += c
  }
  row.push(field); rows.push(row)
  return rows.filter(r => !(r.length === 1 && r[0] === ''))
}

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('PG.C.1: Unduh CSV downloads date-named file equal to visible rows', async ({ page, pageErrors }) => {
  test.setTimeout(120_000)
  const suffix = String(Date.now()).slice(-6)
  const now = new Date()
  const today = localYMD(now)
  const todayName = DAY_NAMES[now.getDay()]
  // Comma in the name exercises downloadCSV quoting end-to-end.
  const namaSekolah = `SD PGC Sim, ${suffix}`
  const sekolahId = `skl-PGC-${Date.now()}`
  const yearAgo = localYMD(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000))
  const yearAhead = localYMD(new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000))

  await loginViaApi(page, 'superadmin')
  const csrf = await primeCsrf(page)
  const sekolahRes = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      id: sekolahId, nama: namaSekolah, spp: 500000, cabangId: CABANG_ID, action: 'create',
      jadwalList: [{ dayOfWeek: todayName, time: '14:00', endTime: '15:00' }],
    },
  })
  if (!sekolahRes.ok()) throw new Error(`seed sekolah failed: ${sekolahRes.status()} ${await sekolahRes.text()}`)

  const trainerListRes = await page.request.get('/api/read.php?entity=trainer')
  const currentTrainer = (await trainerListRes.json()).find(t => t.id === TRAINER_ID)
  const { cabangId: _omit, ...trainerWithoutCabang } = currentTrainer
  const trainerUpdateRes = await page.request.post('/api/trainer.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      ...trainerWithoutCabang, id: TRAINER_ID, action: 'update',
      penugasanPengajar: [...(currentTrainer.penugasanPengajar || []), {
        id: `pgs-PGC-${Date.now()}`, sekolahId, trainerId: TRAINER_ID, asistenId: null,
        cabangId: CABANG_ID, periodeMulai: yearAgo, periodeSelesai: yearAhead, aktif: true,
      }],
    },
  })
  if (!trainerUpdateRes.ok()) throw new Error(`seed penugasan failed: ${trainerUpdateRes.status()} ${await trainerUpdateRes.text()}`)

  try {
    await gotoApp(page)
    await openTab(page, 'Jadwal Penugasan')
    const row = page.getByRole('row').filter({ hasText: suffix }).filter({ hasText: '14:00' })
    await expect(row).toBeVisible({ timeout: 15000 })

    const tableText = await row.innerText()
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.getByRole('button', { name: 'Unduh CSV', exact: true }).click(),
    ])
    expect(download.suggestedFilename()).toBe(`Jadwal_Penugasan_${today}.csv`)
    const path = await download.path()
    const raw = fs.readFileSync(path, 'utf8')
    expect(raw.charCodeAt(0)).toBe(0xFEFF) // Excel BOM kept
    const rows = parseCSV(raw.slice(1))
    expect(rows[0]).toEqual(['Sekolah', 'Trainer', 'Asisten', 'Waktu', 'Tanggal'])
    expect(rows).toHaveLength(2)
    const [, schoolCell, trainerCell, asistenCell, waktuCell, tanggalCell] = [null, ...rows[1]]
    expect(schoolCell).toBe(namaSekolah)
    expect(trainerCell).toBe('Trainer Test Satu')
    expect(asistenCell).toBe('—')
    expect(waktuCell).toBe(`${todayName} 14:00–15:00`)
    expect(tanggalCell).toBe(today)
    // File mirrors the visible row exactly.
    for (const cell of [schoolCell, waktuCell]) expect(tableText).toContain(cell)

    expect(pageErrors).toEqual([])
  } finally {
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
