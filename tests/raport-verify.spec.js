import { test, expect, loginViaApi, primeCsrf, readEntity } from './fixtures.js'

// ============================================================
// Slice 1 Raport — Data Siswa Tingkat/Mapel + Raport legs.
//
// S5 (Task 5): admin mengisi Tingkat + Mapel di Data Siswa →
// tersimpan server (reload → tetap); trainer read-only.
// S6 (Task 6): RaportList/Form CRUD + verifikasi (tab Raport,
// exemplar 90/88/89/90 → total 357, duplikat → 1 record +
// load-to-correct, scope trainer, verifikasi admin).
// S7 (Task 7): legs cetak di-append di file ini (bukan file
// baru) oleh task berikutnya.
// ============================================================

const APP = 'http://localhost:5173'

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__s5_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__s5_reset_done', '1')
  })
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

// Pola tests/siswa-row-button-anchor.spec.js: label tanpa htmlFor,
// jadi dicari lewat div pembungkus di dalam dialog.
function fieldInDialog(page, labelText) {
  return page.getByRole('dialog').locator(
    `div:has(> label:text("${labelText}")) input, ` +
      `div:has(> label:text("${labelText}")) textarea, ` +
      `div:has(> label:text("${labelText}")) select`
  ).first()
}

async function getStoreJson(page, key) {
  return page.evaluate(k => JSON.parse(localStorage.getItem(`afterschola_v4_${k}`) || '[]'), key)
}

async function waitForSiswaByName(page, nama) {
  await expect.poll(
    () => getStoreJson(page, 'siswa').then(arr => arr.some(r => r.nama === nama)),
    { message: `menunggu "${nama}" muncul di cache lokal (siswa) setelah writeRemote()`, timeout: 15000 }
  ).toBe(true)
}

test('S5.1: admin set Tingkat Beginner + Mapel Scratch 3 tersimpan dan bertahan setelah reload', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  const SIM_SCH_NAME = `SD S5 Sim ${SUFFIX}`
  const SIM_SW_NAME = `Siswa S5 Sim ${SUFFIX}`

  await resetStorage(page)
  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // Seed sekolah milik cabang admin lewat UI (cabang diturunkan server dari sesi).
  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await page.getByRole('dialog').locator('div:has(> label:text("Nama Sekolah")) input').first().fill(SIM_SCH_NAME)
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect.poll(
    () => getStoreJson(page, 'sekolah').then(arr => arr.some(s => s.nama === SIM_SCH_NAME)),
    { timeout: 15000 }
  ).toBe(true)

  // Tambah siswa, lalu Edit untuk mengisi Tingkat + Mapel.
  await openTab(page, 'Data Siswa')
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  await fieldInDialog(page, 'Nama Siswa').fill(SIM_SW_NAME)
  await page.getByRole('dialog').locator('div:has(> label:text("Sekolah")) select').first().selectOption({ label: SIM_SCH_NAME })
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await waitForSiswaByName(page, SIM_SW_NAME)

  const row = page.locator('tr', { has: page.getByText(SIM_SW_NAME) }).first()
  await expect(row).toBeVisible()
  const aksiButtons = row.locator('td div.flex button')
  await expect.poll(() => aksiButtons.count(), { timeout: 10000 }).toBeGreaterThanOrEqual(2)
  // Urutan tombol Aksi: [SPP?, Edit, Hapus] — Edit selalu kedua dari akhir
  // (pola targetRow.locator('button').last() untuk Hapus di
  // tests/student-delete-absensi.spec.js).
  const n = await aksiButtons.count()
  await aksiButtons.nth(n - 2).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  await fieldInDialog(page, 'Tingkat').selectOption('Beginner')
  await fieldInDialog(page, 'Mapel').fill('Scratch 3')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  // Tersimpan: cache lokal membawa tingkat/mapel baru (writeRemote → server → cache).
  await expect.poll(async () => {
    const arr = await getStoreJson(page, 'siswa')
    const s = arr.find(r => r.nama === SIM_SW_NAME)
    return s ? `${s.tingkat || ''}|${s.mapel || ''}` : 'belum-ada'
  }, { timeout: 15000 }).toBe('Beginner|Scratch 3')

  // Badge tampil di baris (gaya badge Trial).
  await expect(row.getByText('Beginner', { exact: true })).toBeVisible()
  await expect(row.getByText('Scratch 3', { exact: true })).toBeVisible()

  // Reload → nilai tetap (bukti persist server, bukan sekadar cache lokal).
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Siswa')
  const rowAfter = page.locator('tr', { has: page.getByText(SIM_SW_NAME) }).first()
  await expect(rowAfter.getByText('Beginner', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(rowAfter.getByText('Scratch 3', { exact: true })).toBeVisible()

  // Nilai form ikut bertahan bila dialog dibuka ulang.
  const aksiAfter = rowAfter.locator('td div.flex button')
  await expect.poll(() => aksiAfter.count(), { timeout: 10000 }).toBeGreaterThanOrEqual(2)
  const m = await aksiAfter.count()
  await aksiAfter.nth(m - 2).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(fieldInDialog(page, 'Tingkat')).toHaveValue('Beginner')
  await expect(fieldInDialog(page, 'Mapel')).toHaveValue('Scratch 3')
  await page.getByRole('button', { name: 'Batal', exact: true }).click()

  expect(pageErrors).toHaveLength(0)
})

// ============================================================
// S6 (Task 6) — Daftar + Form Raport.
// Kontrak komponen (RaportList.jsx/RaportForm.jsx + tab Raport
// di App.jsx): filter "Filter semester"/"Filter sekolah"/"Cari";
// tombol "Tambah Raport"; dialog "Tambah Raport"/"Koreksi Raport"
// berisi label Siswa, Semester, Tahun Ajaran, Helping Team,
// Computational Thinking, Problem Solving, Creativity, Grade,
// Catatan, Status; tombol Simpan/Batal; baris aksi Koreksi,
// Ajukan (trainer, Draft), Verifikasi (admin, Diajukan), Hapus;
// duplikat → pesan `Raport semester ini sudah ada — buka untuk
// koreksi` + muat-ke-form; badge Draft/Diajukan/Terverifikasi.
// ============================================================

const DUPLICATE_MSG = 'Raport semester ini sudah ada — buka untuk koreksi'

async function apiPost(page, csrf, url, data) {
  const res = await page.request.post(url, {
    headers: { 'X-CSRF-Token': csrf },
    data,
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status(), body }
}

function academicYearNow() {
  const now = new Date()
  return now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

async function seedSchoolSiswaAsSuperadmin(page, schoolName, siswaName, suffix, tag) {
  await loginViaApi(page, 'superadmin')
  const csrf = await primeCsrf(page)
  const schRes = await apiPost(page, csrf, '/api/sekolah.php', {
    action: 'create',
    id: `skl-${tag}-${suffix}`,
    nama: schoolName,
    spp: 150000,
    cabangId: 'cbg-test-pusat',
  })
  if (schRes.status !== 201 && schRes.status !== 200) {
    throw new Error(`seed sekolah gagal: ${schRes.status} ${JSON.stringify(schRes.body)}`)
  }
  const schoolId = schRes.body.id || `skl-${tag}-${suffix}`
  const siswaId = `sw-${tag}-${suffix}`
  const sswRes = await apiPost(page, csrf, '/api/siswa.php', {
    action: 'create',
    id: siswaId,
    nama: siswaName,
    sekolahId: schoolId,
    status: 'Aktif',
  })
  if (sswRes.status !== 201 && sswRes.status !== 200) {
    throw new Error(`seed siswa gagal: ${sswRes.status} ${JSON.stringify(sswRes.body)}`)
  }
  return { csrf, schoolId, siswaId }
}

async function cleanupRaportSeeds(page, { raportIds = [], siswaIds = [], schoolIds = [] } = {}) {
  await loginViaApi(page, 'superadmin')
  const csrf = await primeCsrf(page)
  for (const id of raportIds) {
    await apiPost(page, csrf, '/api/raport.php', { action: 'delete', id }).catch(() => {})
  }
  for (const id of siswaIds) {
    await apiPost(page, csrf, '/api/siswa.php', { action: 'delete', id }).catch(() => {})
  }
  for (const id of schoolIds) {
    await apiPost(page, csrf, '/api/sekolah.php', { action: 'delete', id }).catch(() => {})
  }
}

async function fillRaportNilai(dialog, { helpingTeam, computationalThinking, problemSolving, creativity, grade, catatan }) {
  await dialog.getByLabel('Helping Team').fill(String(helpingTeam))
  await dialog.getByLabel('Computational Thinking').fill(String(computationalThinking))
  await dialog.getByLabel('Problem Solving').fill(String(problemSolving))
  await dialog.getByLabel('Creativity').fill(String(creativity))
  await dialog.getByLabel('Grade').fill(grade)
  if (catatan !== undefined) await dialog.getByLabel('Catatan').fill(catatan)
}

test('S6.1: admin buat raport exemplar → total 357; simpan-ulang → tetap 1 record (load-to-correct); hapus', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  const SCH_NAME = `SD S6A Sim ${SUFFIX}`
  const SW_NAME = `Siswa S6A Sim ${SUFFIX}`
  let schoolId = null
  let siswaId = null
  let raportId = null

  await resetStorage(page)
  const seed = await seedSchoolSiswaAsSuperadmin(page, SCH_NAME, SW_NAME, SUFFIX, 's6a')
  schoolId = seed.schoolId
  siswaId = seed.siswaId

  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // Reachability: tab Raport terdaftar (Task 6 mendaftarkan di App.jsx).
  await openTab(page, 'Raport')
  await expect(page.getByRole('button', { name: 'Tambah Raport' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByLabel('Filter semester')).toBeVisible()
  await expect(page.getByLabel('Filter sekolah')).toBeVisible()
  await expect(page.getByLabel('Cari')).toBeVisible()

  // Buat raport exemplar 90/88/89/90 + grade A-.
  await page.getByRole('button', { name: 'Tambah Raport' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Siswa').selectOption({ label: SW_NAME })
  await dialog.getByLabel('Semester', { exact: true }).selectOption('Ganjil')
  await fillRaportNilai(dialog, {
    helpingTeam: 90, computationalThinking: 88, problemSolving: 89, creativity: 90,
    grade: 'A-', catatan: 'Contoh catatan S6',
  })
  await dialog.getByRole('button', { name: 'Simpan', exact: true }).click()

  const row = page.locator('tr', { has: page.getByText(SW_NAME) }).first()
  await expect(row).toBeVisible({ timeout: 15000 })
  await expect(row.getByText('357', { exact: true })).toBeVisible()
  await expect(row.getByText('A-', { exact: true })).toBeVisible()
  await expect(row.getByText('Draft', { exact: true })).toBeVisible()

  const rapots = await (async () => {
    await loginViaApi(page, 'superadmin')
    const csrf = await primeCsrf(page)
    return readEntity(page, 'raport', csrf)
  })()
  const own = rapots.filter(r => r.siswaId === siswaId)
  expect(own.length).toBe(1)
  raportId = own[0].id

  // Kembali sebagai admin untuk simpan-ulang semester yang sama.
  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Raport')

  // Filter Cari: nonsense → kosong; nama → ketemu lagi.
  await page.getByLabel('Cari').fill(`tak-ada-${SUFFIX}`)
  await expect(page.getByText('Belum ada raport.')).toBeVisible({ timeout: 10000 })
  await page.getByLabel('Cari').fill(SW_NAME)
  await expect(page.locator('tr', { has: page.getByText(SW_NAME) }).first()).toBeVisible({ timeout: 10000 })
  await page.getByLabel('Cari').fill('')

  // Simpan-ulang (siswa + semester + tahun ajaran sama) → 409 + muat-ke-form.
  await page.getByRole('button', { name: 'Tambah Raport' }).click()
  const dialog2 = page.getByRole('dialog')
  await expect(dialog2).toBeVisible()
  await dialog2.getByLabel('Siswa').selectOption({ label: SW_NAME })
  await dialog2.getByLabel('Semester', { exact: true }).selectOption('Ganjil')
  await fillRaportNilai(dialog2, {
    helpingTeam: 80, computationalThinking: 80, problemSolving: 80, creativity: 80,
    grade: 'B',
  })
  await dialog2.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect(dialog2.getByText(DUPLICATE_MSG)).toBeVisible({ timeout: 15000 })

  // Muat-ke-form: Simpan lagi menimpa record yang sama (update, bukan duplikat).
  await dialog2.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect(dialog2).toHaveCount(0, { timeout: 15000 })
  const rowAfter = page.locator('tr', { has: page.getByText(SW_NAME) }).first()
  await expect(rowAfter.getByText('320', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(page.locator('tr', { has: page.getByText(SW_NAME) })).toHaveCount(1)

  // Hapus via ConfirmDialog Hapus/Batal.
  await rowAfter.getByRole('button', { name: 'Hapus' }).click()
  const confirm = page.getByRole('dialog')
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Hapus', exact: true }).click()
  await expect(page.locator('tr', { has: page.getByText(SW_NAME) })).toHaveCount(0, { timeout: 15000 })
  raportId = null

  expect(pageErrors).toHaveLength(0)

  await cleanupRaportSeeds(page, { raportIds: [], siswaIds: [siswaId], schoolIds: [schoolId] })
})

test('S6.2: trainer isi murid sendiri OK (Diajukan); murid luar-scope tak dapat ditulis', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  const SCH_IN = `SD S6B In ${SUFFIX}`
  const SW_IN = `Siswa S6B In ${SUFFIX}`
  const SCH_OUT = `SD S6B Out ${SUFFIX}`
  const SW_OUT = `Siswa S6B Out ${SUFFIX}`
  const TRAINER_ID = 'trn-test-1'
  let schoolIn = null
  let siswaIn = null
  let schoolOut = null
  let siswaOut = null
  let raportIds = []

  await resetStorage(page)

  // Seed 2 sekolah + 2 siswa sebagai superadmin.
  await loginViaApi(page, 'superadmin')
  let csrf = await primeCsrf(page)
  const mkSchool = async (tag, nama) => {
    const r = await apiPost(page, csrf, '/api/sekolah.php', {
      action: 'create', id: `skl-${tag}-${SUFFIX}`, nama, spp: 150000, cabangId: 'cbg-test-pusat',
    })
    if (r.status !== 201 && r.status !== 200) throw new Error(`seed sekolah ${tag} gagal: ${r.status}`)
    return r.body.id || `skl-${tag}-${SUFFIX}`
  }
  const mkSiswa = async (tag, nama, sekolahId) => {
    const id = `sw-${tag}-${SUFFIX}`
    const r = await apiPost(page, csrf, '/api/siswa.php', {
      action: 'create', id, nama, sekolahId, status: 'Aktif',
    })
    if (r.status !== 201 && r.status !== 200) throw new Error(`seed siswa ${tag} gagal: ${r.status}`)
    return id
  }
  schoolIn = await mkSchool('s6bin', SCH_IN)
  siswaIn = await mkSiswa('s6bin', SW_IN, schoolIn)
  schoolOut = await mkSchool('s6bout', SCH_OUT)
  siswaOut = await mkSiswa('s6bout', SW_OUT, schoolOut)

  // Tugaskan trn-test-1 ke sekolah IN saja (append, bukan replace).
  const trainers = await readEntity(page, 'trainer', csrf)
  const trnRec = trainers.find(t => t.id === TRAINER_ID)
  if (!trnRec) throw new Error(`trainer ${TRAINER_ID} tidak ditemukan`)
  const beforeRows = Array.isArray(trnRec.penugasanPengajar) ? trnRec.penugasanPengajar : []
  const ownRowId = `pgs-s6b-${SUFFIX}`
  const pastDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const { cabangId: _dropCabang, ...trnNoCabang } = trnRec
  const upd = await apiPost(page, csrf, '/api/trainer.php', {
    ...trnNoCabang,
    id: TRAINER_ID,
    action: 'update',
    version: trnRec.version,
    penugasanPengajar: [...beforeRows, {
      id: ownRowId,
      sekolahId: schoolIn,
      trainerId: TRAINER_ID,
      asistenId: null,
      cabangId: 'cbg-test-pusat',
      periodeMulai: pastDate,
      periodeSelesai: null,
      aktif: true,
    }],
  })
  if (upd.status !== 200) throw new Error(`assign trainer gagal: ${upd.status} ${JSON.stringify(upd.body)}`)

  try {
    await loginViaApi(page, 'trainer')
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')

    // Tab Raport tersedia untuk trainer.
    await openTab(page, 'Raport')
    await expect(page.getByRole('button', { name: 'Tambah Raport' })).toBeVisible({ timeout: 15000 })

    // Murid luar-scope: tak ada opsi tulis untuknya.
    await page.getByRole('button', { name: 'Tambah Raport' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const siswaSelect = dialog.getByLabel('Siswa')
    await expect(siswaSelect.locator(`option:text("${SW_IN}")`)).toHaveCount(1, { timeout: 10000 })
    await expect(siswaSelect.locator(`option:text("${SW_OUT}")`)).toHaveCount(0)
    await expect(page.locator('tr', { has: page.getByText(SW_OUT) })).toHaveCount(0)

    // Murid sendiri: isi OK sebagai Draft.
    await siswaSelect.selectOption({ label: SW_IN })
    await dialog.getByLabel('Semester', { exact: true }).selectOption('Ganjil')
    await fillRaportNilai(dialog, {
      helpingTeam: 80, computationalThinking: 80, problemSolving: 80, creativity: 80,
      grade: 'B',
    })
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click()
    const row = page.locator('tr', { has: page.getByText(SW_IN) }).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    await expect(row.getByText('320', { exact: true })).toBeVisible()
    await expect(row.getByText('Draft', { exact: true })).toBeVisible()

    // Transisi Draft → Diajukan oleh trainer.
    await row.getByRole('button', { name: 'Ajukan' }).click()
    await expect(row.getByText('Diajukan', { exact: true })).toBeVisible({ timeout: 15000 })

    // Trainer tak boleh memverifikasi: opsi Terverifikasi tak ada di form.
    await row.getByRole('button', { name: 'Koreksi' }).click()
    const editDialog = page.getByRole('dialog')
    await expect(editDialog).toBeVisible()
    await expect(editDialog.getByLabel('Status').locator('option:text("Terverifikasi")')).toHaveCount(0)
    await editDialog.getByRole('button', { name: 'Batal', exact: true }).click()

    expect(pageErrors).toHaveLength(0)

    // Kumpulkan id raport untuk cleanup.
    await loginViaApi(page, 'superadmin')
    csrf = await primeCsrf(page)
    const rapots = await readEntity(page, 'raport', csrf)
    raportIds = rapots.filter(r => r.siswaId === siswaIn).map(r => r.id)
  } finally {
    // Kembalikan penugasan trn-test-1 (hapus baris milik run ini), lalu
    // hapus data seed dengan urutan terbalik.
    await loginViaApi(page, 'superadmin')
    const csrf2 = await primeCsrf(page)
    const cur = (await readEntity(page, 'trainer', csrf2)).find(t => t.id === TRAINER_ID)
    if (cur) {
      const { cabangId: _c2, ...noCab } = cur
      const kept = (Array.isArray(noCab.penugasanPengajar) ? noCab.penugasanPengajar : []).filter(a => !(a && a.id === ownRowId))
      await apiPost(page, csrf2, '/api/trainer.php', {
        ...noCab, id: TRAINER_ID, action: 'update', version: cur.version, penugasanPengajar: kept,
      }).catch(() => {})
    }
    for (const id of raportIds) {
      await apiPost(page, csrf2, '/api/raport.php', { action: 'delete', id }).catch(() => {})
    }
    for (const id of [siswaIn, siswaOut]) {
      if (id) await apiPost(page, csrf2, '/api/siswa.php', { action: 'delete', id }).catch(() => {})
    }
    for (const id of [schoolIn, schoolOut]) {
      if (id) await apiPost(page, csrf2, '/api/sekolah.php', { action: 'delete', id }).catch(() => {})
    }
  }
})

test('S6.3: admin verifikasi raport Diajukan → badge Terverifikasi', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  const SCH_NAME = `SD S6C Sim ${SUFFIX}`
  const SW_NAME = `Siswa S6C Sim ${SUFFIX}`
  const RAPORT_ID = `rpt-s6c-${SUFFIX}`
  let schoolId = null
  let siswaId = null

  await resetStorage(page)

  // Seed sekolah + siswa + raport Diajukan sebagai superadmin (via API).
  await loginViaApi(page, 'superadmin')
  let csrf = await primeCsrf(page)
  const sch = await apiPost(page, csrf, '/api/sekolah.php', {
    action: 'create', id: `skl-s6c-${SUFFIX}`, nama: SCH_NAME, spp: 150000, cabangId: 'cbg-test-pusat',
  })
  if (sch.status !== 201 && sch.status !== 200) throw new Error(`seed sekolah gagal: ${sch.status}`)
  schoolId = sch.body.id || `skl-s6c-${SUFFIX}`
  siswaId = `sw-s6c-${SUFFIX}`
  const ssw = await apiPost(page, csrf, '/api/siswa.php', {
    action: 'create', id: siswaId, nama: SW_NAME, sekolahId: schoolId, status: 'Aktif',
  })
  if (ssw.status !== 201 && ssw.status !== 200) throw new Error(`seed siswa gagal: ${ssw.status}`)
  const rpt = await apiPost(page, csrf, '/api/raport.php', {
    action: 'create',
    id: RAPORT_ID,
    siswaId,
    cabangId: 'cbg-test-pusat',
    semester: 'Ganjil',
    tahunAjaran: academicYearNow(),
    nilai: { helpingTeam: 90, computationalThinking: 88, problemSolving: 89, creativity: 90 },
    total: 357,
    rataRata: 89.25,
    grade: 'A-',
    catatan: 'Siap diverifikasi',
    status: 'Diajukan',
  })
  if (rpt.status !== 201 && rpt.status !== 200) throw new Error(`seed raport gagal: ${rpt.status} ${JSON.stringify(rpt.body)}`)

  // Admin verifikasi via tombol baris.
  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Raport')
  const row = page.locator('tr', { has: page.getByText(SW_NAME) }).first()
  await expect(row).toBeVisible({ timeout: 15000 })
  await expect(row.getByText('357', { exact: true })).toBeVisible()
  await expect(row.getByText('Diajukan', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: 'Verifikasi' }).click()
  await expect(row.getByText('Terverifikasi', { exact: true })).toBeVisible({ timeout: 15000 })

  expect(pageErrors).toHaveLength(0)

  await cleanupRaportSeeds(page, { raportIds: [RAPORT_ID], siswaIds: [siswaId], schoolIds: [schoolId] })
})

// ============================================================
// S7 (Task 7) — Template cetak RaportTemplate + navigasi cetak.
// Kontrak komponen (RaportTemplate.jsx + tombol Cetak di
// RaportList.jsx): baris aksi "Cetak" membuka cetakan berisi kop
// logo (fallback bila kosong), judul PENILAIAN AKHIR SISWA,
// Nama/Kelas/Tingkat/Mapel/Semester, tabel 4 aspek + Total, baris
// Nilai Akhir + Grade, Catatan, baris tanggal Bandung + tanda
// tangan Instruktur; toolbar no-print berisi tombol Kembali /
// Cetak Raport (window.print); root printable-report. Nilai cetak
// = record (tidak dihitung-ulang di render).
// ============================================================

async function seedExemplarRaport(page, suffix, tag) {
  const SCH_NAME = `SD ${tag} Sim ${suffix}`
  const SW_NAME = `Siswa ${tag} Sim ${suffix}`
  const CATATAN = `Catatan ${tag} ${suffix}`
  await loginViaApi(page, 'superadmin')
  const csrf = await primeCsrf(page)
  const sch = await apiPost(page, csrf, '/api/sekolah.php', {
    action: 'create', id: `skl-${tag.toLowerCase()}-${suffix}`, nama: SCH_NAME, spp: 150000, cabangId: 'cbg-test-pusat',
  })
  if (sch.status !== 201 && sch.status !== 200) throw new Error(`seed sekolah gagal: ${sch.status}`)
  const schoolId = sch.body.id || `skl-${tag.toLowerCase()}-${suffix}`
  const siswaId = `sw-${tag.toLowerCase()}-${suffix}`
  const ssw = await apiPost(page, csrf, '/api/siswa.php', {
    action: 'create', id: siswaId, nama: SW_NAME, sekolahId: schoolId, status: 'Aktif',
    kelas: '3A', tingkat: 'Beginner', mapel: 'Scratch 3',
  })
  if (ssw.status !== 201 && ssw.status !== 200) throw new Error(`seed siswa gagal: ${ssw.status}`)
  const raportId = `rpt-${tag.toLowerCase()}-${suffix}`
  const rpt = await apiPost(page, csrf, '/api/raport.php', {
    action: 'create',
    id: raportId,
    siswaId,
    cabangId: 'cbg-test-pusat',
    semester: 'Ganjil',
    tahunAjaran: academicYearNow(),
    nilai: { helpingTeam: 90, computationalThinking: 88, problemSolving: 89, creativity: 90 },
    total: 357,
    rataRata: 89.25,
    grade: 'A-',
    catatan: CATATAN,
    status: 'Terverifikasi',
  })
  if (rpt.status !== 201 && rpt.status !== 200) throw new Error(`seed raport gagal: ${rpt.status} ${JSON.stringify(rpt.body)}`)
  return { schoolId, siswaId, raportId, schName: SCH_NAME, swName: SW_NAME, catatan: CATATAN }
}

async function openPrintView(page, swName) {
  await openTab(page, 'Raport')
  const row = page.locator('tr', { has: page.getByText(swName) }).first()
  await expect(row).toBeVisible({ timeout: 15000 })
  await row.getByRole('button', { name: 'Cetak', exact: true }).click()
  const printable = page.locator('.printable-report')
  await expect(printable).toBeVisible({ timeout: 10000 })
  return printable
}

test('S7.1: cetakan exemplar memuat 357/89,25/A-/catatan; Cetak Raport memanggil window.print', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)

  await resetStorage(page)
  const seed = await seedExemplarRaport(page, SUFFIX, 'S7A')

  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  const printable = await openPrintView(page, seed.swName)
  await expect(printable.getByText('PENILAIAN AKHIR SISWA')).toBeVisible()
  await expect(printable.getByText(seed.swName)).toBeVisible()
  await expect(printable.getByText('Helping Team')).toBeVisible()
  await expect(printable.getByText('Computational Thinking')).toBeVisible()
  await expect(printable.getByText('357', { exact: true })).toBeVisible()
  await expect(printable.getByText('89,25', { exact: true })).toBeVisible()
  await expect(printable.getByText('A-', { exact: true })).toBeVisible()
  await expect(printable.getByText(seed.catatan)).toBeVisible()
  await expect(printable.getByText('Instruktur')).toBeVisible()
  await expect(printable.getByText(/Bandung,/)).toBeVisible()

  // Intercept window.print + assert terpanggil (testing taste).
  await page.evaluate(() => {
    window.__printCalled = false
    window.print = () => { window.__printCalled = true }
  })
  await page.getByRole('button', { name: 'Cetak Raport', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__printCalled), { timeout: 5000 }).toBe(true)

  // Kembali menutup cetakan → daftar tampil lagi.
  await page.getByRole('button', { name: 'Kembali', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Tambah Raport' })).toBeVisible({ timeout: 10000 })

  expect(pageErrors).toHaveLength(0)

  await cleanupRaportSeeds(page, { raportIds: [seed.raportId], siswaIds: [seed.siswaId], schoolIds: [seed.schoolId] })
})

test('S7.2: cetakan tetap render saat logo/pengaturan kosong', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)

  await resetStorage(page)
  const seed = await seedExemplarRaport(page, SUFFIX, 'S7B')

  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // Kosongkan logo + pengaturan cetak (Review Focus 5) lalu reload.
  await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('afterschola_v4_settings')
      const parsed = raw ? JSON.parse(raw) : {}
      delete parsed.logoUrl
      delete parsed.logoEntry
      delete parsed.penandatangan
      localStorage.setItem('afterschola_v4_settings', JSON.stringify(parsed))
    } catch {
      /* abaikan — template harus tetap render */
    }
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  const printable = await openPrintView(page, seed.swName)
  await expect(printable.getByText('PENILAIAN AKHIR SISWA')).toBeVisible()
  await expect(printable.getByText(seed.swName)).toBeVisible()
  await expect(printable.getByText('357', { exact: true })).toBeVisible()
  await expect(printable.getByText('89,25', { exact: true })).toBeVisible()

  expect(pageErrors).toHaveLength(0)

  await cleanupRaportSeeds(page, { raportIds: [seed.raportId], siswaIds: [seed.siswaId], schoolIds: [seed.schoolId] })
})

test('S5.2: trainer Data Siswa read-only — tombol tulis tak ada', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await loginViaApi(page, 'trainer')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Siswa')

  await expect(page.getByRole('button', { name: 'Tambah Siswa Baru' })).toHaveCount(0)
  await expect(page.getByText('Aksi', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Simpan', exact: true })).toHaveCount(0)

  expect(pageErrors).toHaveLength(0)
})

test('S6.4: superadmin koreksi grade → tersimpan (toleransi cabangId cocok)', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  const SCH_NAME = `SD S6D Sim ${SUFFIX}`
  const SW_NAME = `Siswa S6D Sim ${SUFFIX}`
  const RAPORT_ID = `rpt-s6d-${SUFFIX}`
  let schoolId = null
  let siswaId = null

  await resetStorage(page)

  // Seed sekolah + siswa + raport sebagai superadmin (create wajib cabangId).
  await loginViaApi(page, 'superadmin')
  const csrf = await primeCsrf(page)
  const sch = await apiPost(page, csrf, '/api/sekolah.php', {
    action: 'create', id: `skl-s6d-${SUFFIX}`, nama: SCH_NAME, spp: 150000, cabangId: 'cbg-test-pusat',
  })
  if (sch.status !== 201 && sch.status !== 200) throw new Error(`seed sekolah gagal: ${sch.status}`)
  schoolId = sch.body.id || `skl-s6d-${SUFFIX}`
  siswaId = `sw-s6d-${SUFFIX}`
  const ssw = await apiPost(page, csrf, '/api/siswa.php', {
    action: 'create', id: siswaId, nama: SW_NAME, sekolahId: schoolId, status: 'Aktif',
  })
  if (ssw.status !== 201 && ssw.status !== 200) throw new Error(`seed siswa gagal: ${ssw.status}`)
  const rpt = await apiPost(page, csrf, '/api/raport.php', {
    action: 'create',
    id: RAPORT_ID,
    siswaId,
    cabangId: 'cbg-test-pusat',
    semester: 'Ganjil',
    tahunAjaran: academicYearNow(),
    nilai: { helpingTeam: 80, computationalThinking: 80, problemSolving: 80, creativity: 80 },
    total: 320,
    rataRata: 80,
    grade: 'B',
    catatan: 'Seed S6D',
    status: 'Draft',
  })
  if (rpt.status !== 201 && rpt.status !== 200) throw new Error(`seed raport gagal: ${rpt.status} ${JSON.stringify(rpt.body)}`)

  // Superadmin koreksi grade lewat UI — record roundtrip membawa
  // cabangId tersimpan; pre-fix selalu 422 di sini.
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Raport')
  const row = page.locator('tr', { has: page.getByText(SW_NAME) }).first()
  await expect(row).toBeVisible({ timeout: 15000 })
  await expect(row.getByText('B', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: 'Koreksi' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Grade').fill('A-')
  await dialog.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect(dialog).toHaveCount(0, { timeout: 15000 })
  const rowAfter = page.locator('tr', { has: page.getByText(SW_NAME) }).first()
  await expect(rowAfter.getByText('A-', { exact: true })).toBeVisible({ timeout: 15000 })

  expect(pageErrors).toHaveLength(0)

  await cleanupRaportSeeds(page, { raportIds: [RAPORT_ID], siswaIds: [siswaId], schoolIds: [schoolId] })
})
