import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// AUDIT_FOLLOWUP M-AF2.1 — honor-payment 403 path coverage
//
// The trainer (and admin_cabang) should never be able to write a
// honorPayments record directly. The server's authorize() deny-list
// at server/auth/authorize.php:105-107 rejects any create/update/
// delete/write against honorPayments for non-superadmin roles, and
// the trainer role can only ever write resource 'absensi' anyway.
//
// This test logs in as trainer and POSTs to /api/honorPayments.php
// directly. The 403 is the authoritative server-side contract per
// taste #61 — the server's deny-list, not a client-side guard.
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
