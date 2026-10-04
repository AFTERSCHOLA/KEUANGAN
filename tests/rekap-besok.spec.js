import { test, expect, loginViaApi, primeCsrf, readEntity } from './fixtures.js'

// ============================================================
// Slice 4 — Pengingat H-1 di Rekap Saya ("Jadwal Sekolah Besok").
// H-day sudah ada ("Jadwal Sekolah Hari Ini"); slice ini menambah
// cermin Besok tanpa status pill. In-app only, tanpa store/server baru.
// ============================================================

const APP = 'http://localhost:5173'
const CABANG_ID = 'cbg-test-pusat'
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

function dayNameOf(date) {
  return DAY_NAMES[date.getDay()]
}

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__s4_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__s4_reset_done', '1')
  })
}

async function apiPost(page, csrf, url, data) {
  const res = await page.request.post(url, {
    headers: { 'X-CSRF-Token': csrf },
    data,
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status(), body }
}

test('S4: kartu Besok tampilkan sekolah besok saja, bukan yang hanya-hari-ini', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  const now = new Date()
  const tomorrowName = dayNameOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const todayName = dayNameOf(now)
  // Hari kontrol: nama hari yang bukan hari ini maupun besok.
  const otherName = DAY_NAMES.find(d => d !== todayName && d !== tomorrowName)
  const SCH_TOMORROW = `SD S4 Besok ${SUFFIX}`
  const SCH_TODAY = `SD S4 Ini ${SUFFIX}`
  const TRAINER_ID = 'trn-test-1'
  const schoolIds = []

  await resetStorage(page)
  try {
    await loginViaApi(page, 'superadmin')
    let csrf = await primeCsrf(page)
    // Sekolah Besok: jadwal besok (+ satu hari kontrol agar jadwalList realistis).
    // Waktu beda per sekolah: guard double-booking menolak satu trainer
    // di dua sekolah pada hari+jam yang sama.
    for (const [tag, nama, days, time, endTime] of [['s4b', SCH_TOMORROW, [tomorrowName, otherName], '09:00', '10:00'], ['s4t', SCH_TODAY, [todayName, otherName], '14:00', '15:00']]) {
      const r = await apiPost(page, csrf, '/api/sekolah.php', {
        action: 'create',
        id: `skl-${tag}-${SUFFIX}`,
        nama,
        spp: 150000,
        cabangId: CABANG_ID,
        jadwalList: days.map(d => ({ dayOfWeek: d, time, endTime })),
      })
      if (r.status !== 201 && r.status !== 200) throw new Error(`seed sekolah gagal: ${r.status} ${JSON.stringify(r.body)}`)
      schoolIds.push(r.body.id || `skl-${tag}-${SUFFIX}`)
    }
    // Tugaskan trn-test-1 ke kedua sekolah (append + cleanup di finally).
    const OWN_ROW_ID = `pgs-s4-${SUFFIX}`
    const trainers = await readEntity(page, 'trainer', csrf)
    const trnRec = trainers.find(t => t.id === TRAINER_ID)
    if (!trnRec) throw new Error(`trainer ${TRAINER_ID} tidak ditemukan`)
    const beforeRows = Array.isArray(trnRec.penugasanPengajar) ? trnRec.penugasanPengajar : []
    const { cabangId: _drop, ...trnNoCabang } = trnRec
    // Baris di-scope ke hari+jam sekolahnya: dua baris unscoped untuk
    // trainer yang sama selalu konflik (unscoped fan-out, guard
    // double-booking); triple berbeda = tidak konflik.
    const upd = await apiPost(page, csrf, '/api/trainer.php', {
      ...trnNoCabang,
      id: TRAINER_ID,
      action: 'update',
      version: trnRec.version,
      penugasanPengajar: [...beforeRows,
        { id: OWN_ROW_ID, sekolahId: schoolIds[0], trainerId: TRAINER_ID, asistenId: null, cabangId: CABANG_ID, periodeMulai: '2020-01-01', periodeSelesai: null, aktif: true, hari: tomorrowName, jamMulai: '09:00', jamSelesai: '10:00' },
        { id: `${OWN_ROW_ID}-t`, sekolahId: schoolIds[1], trainerId: TRAINER_ID, asistenId: null, cabangId: CABANG_ID, periodeMulai: '2020-01-01', periodeSelesai: null, aktif: true, hari: todayName, jamMulai: '14:00', jamSelesai: '15:00' },
      ],
    })
    if (upd.status !== 200) throw new Error(`assign gagal: ${upd.status} ${JSON.stringify(upd.body)}`)

    await loginViaApi(page, 'trainer')
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('navigation').getByRole('button', { name: 'Rekap Saya', exact: true }).click()

    const besok = page.locator('div.bg-white.rounded-2xl', { has: page.getByRole('heading', { name: 'Jadwal Sekolah Besok', exact: true }) })
    await expect(besok).toBeVisible({ timeout: 15000 })
    await expect(besok).toContainText(SCH_TOMORROW)
    await expect(besok).not.toContainText(SCH_TODAY)

    expect(pageErrors).toHaveLength(0)
  } finally {
    await loginViaApi(page, 'superadmin')
    const csrf2 = await primeCsrf(page)
    const cur = (await readEntity(page, 'trainer', csrf2)).find(t => t.id === TRAINER_ID)
    if (cur) {
      const { cabangId: _c2, ...noCab } = cur
      const kept = (Array.isArray(noCab.penugasanPengajar) ? noCab.penugasanPengajar : []).filter(a => !(a && typeof a.id === 'string' && a.id.startsWith(`pgs-s4-${SUFFIX}`)))
      await apiPost(page, csrf2, '/api/trainer.php', {
        ...noCab, id: TRAINER_ID, action: 'update', version: cur.version, penugasanPengajar: kept,
      }).catch(() => {})
    }
    for (const id of schoolIds) {
      await apiPost(page, csrf2, '/api/sekolah.php', { action: 'delete', id }).catch(() => {})
    }
  }
})
