import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// AUDIT_FOLLOWUP M-AF2.1 — honor-payment 403 path coverage (trainer,
// unchanged) + AP.D.1 admin_cabang own-branch write (D-AP7).
//
// Trainer can never write honorPayments (authorize() trainer lane has no
// honorPayments branch). admin_cabang appends/corrects OWN-branch honor
// (branch-scoped lane, authorize.php) and stays 403 cross-branch; every
// write is trailed (insertLedger auditEvent, bootstrap.php). The 403/201
// below are the authoritative server-side contract per taste #61.
// ============================================================

const APP = 'http://localhost:5173'

async function primeCsrf(page) {
  const res = await page.request.get('/api/auth/csrf.php')
  if (!res.ok()) throw new Error(`csrf prime failed: ${res.status()}`)
  const body = await res.json()
  return body.csrfToken
}

test('M-AF2.1: trainer direct POST to /api/honorPayments.php returns 403 and local cache is unchanged', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'trainer')
  const csrf = await primeCsrf(page)

  // requireRecord() in server/bootstrap.php:68 enforces id + cabangId
  // as non-empty strings BEFORE authorize() is reached. We supply both
  // so the request goes all the way to the role-check that produces
  // the 403. The values themselves are irrelevant — trainer has no
  // honorPayments scope and authorize('write', 'honorPayments', …)
  // short-circuits to false at server/auth/authorize.php:105-107.
  const sampleHonor = {
    id: 'hrp-m-af2-1-attempt',
    trainerId: 'trn-test-1',
    cabangId: 'cbg-test-pusat',
    periode: new Date().toISOString().slice(0, 7),
    nominal: 50000,
    tanggalBayar: new Date().toISOString().slice(0, 10),
    cabangKode: 'TST',
  }

  const before = await page.evaluate(() => ({
    raw: JSON.parse(localStorage.getItem('afterschola_v4_honorPayments') || '[]'),
  }))
  const beforeIds = new Set(before.raw.map(p => p.id))

  const res = await page.request.post('/api/honorPayments.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { action: 'append', ...sampleHonor },
  })
  expect(res.status()).toBe(403)

  // Local cache MUST be unchanged. A 403 means authorize() denied
  // the write; nothing should be inserted client-side either
  // (honorPayments never had a deleteRemote() path because
  // WRITE_ENDPOINTS doesn't include it).
  const after = await page.evaluate(() => ({
    raw: JSON.parse(localStorage.getItem('afterschola_v4_honorPayments') || '[]'),
  }))
  expect(after.raw.length).toBe(before.raw.length)
  for (const existing of after.raw) {
    expect(beforeIds.has(existing.id)).toBe(true)
  }
  expect(after.raw.find(p => p.id === sampleHonor.id)).toBeUndefined()

  expect(pageErrors).toHaveLength(0)
})

test('AP.D.1: admin_cabang appends own-branch honor (201), denied cross-branch (403)', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'adminCabang')
  const csrf = await primeCsrf(page)
  const suffix = String(Date.now()).slice(-6)
  const trainerId = `trn-HDL-${suffix}`

  // temp trainer in own branch (deleted at the end; ledger rows for a
  // deleted trainer are inert — finance joins skip unknown ids).
  const createRes = await page.request.post('/api/trainer.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { id: trainerId, nama: `Trainer HDL ${suffix}`, honor: 50000, sekolahIds: [], action: 'create' },
  })
  expect(createRes.ok()).toBe(true)

  const payId = `hrp-hdl-${suffix}`
  const appendRes = await page.request.post('/api/honorPayments.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      action: 'append', id: payId, trainerId, cabangId: 'cbg-test-pusat',
      periode: new Date().toISOString().slice(0, 7), nominal: 25000,
      tanggalBayar: new Date().toISOString().slice(0, 10),
    },
  })
  expect(appendRes.status()).toBe(201)
  console.log('## AP.D.1 admin own-branch append -> 201')

  const crossRes = await page.request.post('/api/honorPayments.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      action: 'append', id: `hrp-hdl-x-${suffix}`, trainerId, cabangId: 'cbg-does-not-exist',
      periode: new Date().toISOString().slice(0, 7), nominal: 25000,
      tanggalBayar: new Date().toISOString().slice(0, 10),
    },
  })
  expect(crossRes.status()).toBe(403)
  console.log('## AP.D.1 admin cross-branch append -> 403')

  // correction-delete path (the UI Hapus flow) on own branch.
  const corrRes = await page.request.post('/api/honorPayments.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      action: 'correct', correctionOf: payId,
      record: {
        id: `hrp-hdl-c-${suffix}`, trainerId, cabangId: 'cbg-test-pusat',
        periode: new Date().toISOString().slice(0, 7), nominal: 0,
        tanggalBayar: new Date().toISOString().slice(0, 10),
      },
    },
  })
  expect(corrRes.status()).toBe(201)
  console.log('## AP.D.1 admin own-branch correct -> 201')

  const delRes = await page.request.post('/api/trainer.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { action: 'delete', id: trainerId },
  })
  expect(delRes.ok()).toBe(true)

  expect(pageErrors).toHaveLength(0)
})
