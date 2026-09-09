import { test, expect, loginAndPrime, logout, deleteSekolah } from './fixtures.js'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ============================================================
// PRODUCTION D9.1 — server cascade: deactivate users on
// cabang/trainer delete (docs/PRODUCTION_MILESTONES.md D9.1,
// from audit finding F-04, decision D-04 = A).
//
// Proves, through the real HTTP layer:
//   - deleting a `cabang` deactivates every active user bound
//     to it (users.active = 0, users.cabang_id = NULL) inside
//     the same transaction as the cabang DELETE;
//   - deleting a `trainer` does the same via users.trainer_id
//     (users.cabang_id is deliberately untouched — only the
//     dangling FK is nulled, reference-preserving per taste #35);
//   - the deactivated account can no longer log in (401 on
//     POST /api/auth/login.php, same generic error as
//     wrong-password — no enumeration leak);
//   - audit_log carries one `user_cascade_deactivated` event per
//     affected user (target_id = user id, metadata = the
//     pre-cascade FK ids only — no username/PII, taste #50);
//   - idempotence: a second delete of the same entity 422s
//     (record not found) and emits no additional cascade audit
//     rows, with zero state drift on the deactivated user row.
//
// DB-state and audit_log assertions go through a self-contained
// PHP probe (written to os.tmpdir() at beforeAll, removed at
// afterAll) that connects to the same afterschola_t3_test DB the
// HTTP server uses — the "verify hidden persistence invariants
// directly" pattern, since no API exposes audit_log.
//
// Prerequisites (same as tests/multi-account-crud-sync.spec.js):
//   - PHP server on 127.0.0.1:8000 (docroot server/),
//   - MySQL seeded per db-reset (superadmin@test.local +
//     admin.cabang@test.local + cbg-test-pusat branch).
//
// Test data is namespaced (admin.d91.* / trainer.d91.* /
// cbg-d91-* / sch-d91-*) and removed at the end of each run;
// a preclean in beforeAll also wipes markers from crashed
// prior runs (reactive test-data hygiene).
// ============================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const XAMPP_PHP = 'D:\\Games and Apps\\xampp\\php\\php.exe'
const PHP = process.env.PHP_BIN || (fs.existsSync(XAMPP_PHP) ? XAMPP_PHP : 'php')
const REPO_ROOT = path.resolve(__dirname, '..').replace(/\\/g, '/')
const PROBE = path.join(os.tmpdir(), 'cascade-d91-probe.php')
const SIM_TAG = 'D9.1'

const PROBE_SRC = `<?php
declare(strict_types=1);
$in = stream_get_contents(STDIN);
$req = json_decode((string) $in, true);
if (!is_array($req)) { fwrite(STDERR, "bad probe input\n"); exit(1); }
require_once '${REPO_ROOT}/server/bootstrap.php';
$pdo = database();
$cmd = (string) ($req['cmd'] ?? '');
$arg = $req['arg'] ?? null;

if ($cmd === 'user') {
    $stmt = $pdo->prepare('SELECT id, username, role, active, cabang_id, trainer_id FROM users WHERE id = :id');
    $stmt->execute([':id' => $arg]);
    $row = $stmt->fetch();
    echo json_encode($row === false ? null : [
        'id' => $row['id'],
        'username' => $row['username'],
        'role' => $row['role'],
        'active' => (int) $row['active'],
        'cabangId' => $row['cabang_id'],
        'trainerId' => $row['trainer_id'],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($cmd === 'audit') {
    $count = $pdo->prepare("SELECT COUNT(*) FROM audit_log WHERE event_type = 'user_cascade_deactivated' AND target_id = :id");
    $count->execute([':id' => $arg]);
    $meta = $pdo->prepare("SELECT metadata FROM audit_log WHERE event_type = 'user_cascade_deactivated' AND target_id = :id ORDER BY id DESC LIMIT 1");
    $meta->execute([':id' => $arg]);
    $row = $meta->fetch();
    echo json_encode([
        'count' => (int) $count->fetchColumn(),
        'metadata' => $row === false ? null : json_decode((string) $row['metadata'], true),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($cmd === 'preclean' || $cmd === 'clean') {
    $pdo->exec("DELETE FROM sekolah WHERE id LIKE 'sch-d91-%'");
    $pdo->exec("DELETE FROM cabang WHERE id LIKE 'cbg-d91-%'");
    $pdo->exec("DELETE FROM users WHERE username LIKE 'admin.d91.%' OR username LIKE 'trainer.d91.%'");    if ($cmd === 'clean' && is_array($arg) && $arg !== []) {
        $ids = array_values(array_filter($arg, 'is_string'));
        if ($ids !== []) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $pdo->prepare("DELETE FROM audit_log WHERE target_id IN ({$ph})")->execute($ids);
        }
    }
    echo json_encode(['ok' => true]);
    exit;
}

fwrite(STDERR, "unknown probe cmd: {$cmd}\n");
exit(1);
`

function probe(cmd, arg = null) {
  const out = execFileSync(PHP, [PROBE], { input: JSON.stringify({ cmd, arg }) })
  return JSON.parse(out.toString())
}

async function tryLogin(page, username, password) {
  const res = await page.request.post('/api/auth/login.php', {
    data: { username, password },
    headers: { 'Content-Type': 'application/json' },
  })
  let body = null
  try { body = await res.json() } catch {}
  return { status: res.status(), body }
}

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__d91_reset')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__d91_reset', '1')
  })
}

test.beforeAll(() => {
  fs.writeFileSync(PROBE, PROBE_SRC)
  // Wipe markers from a crashed prior run so this one starts clean.
  probe('preclean')
})

test.afterAll(() => {
  try { fs.unlinkSync(PROBE) } catch {}
})

test.describe(`PRODUCTION D9.1 — users cascade on cabang/trainer delete (${SIM_TAG})`, () => {
  test('D9.1 cabang delete deactivates bound users (401 login, audit row, idempotent)', async ({ page, pageErrors }) => {
    await resetStorage(page)
    const createdIds = []
    let csrf = await loginAndPrime(page, 'superadmin')

    const suffix = String(Date.now()).slice(-6)
    const branchId = `cbg-d91-${suffix}`
    const kode = `D9${suffix.slice(-4)}`

    try {
      // ---- Seed: branch + admin account bound to it. The branch holds no
      // sekolah/trainer/ledger rows, so the 7-table dependency scan in
      // masterDelete passes and the delete reaches the users cascade.
      const createBranch = await page.request.post('/api/cabang.php', {
        headers: { 'X-CSRF-Token': csrf },
        data: { action: 'create', id: branchId, kode, nama: `${SIM_TAG} Cascade Cabang ${suffix}` },
      })
      expect(createBranch.status()).toBe(201)

      const adminUsername = `admin.d91.${suffix}.test`
      const createAdmin = await page.request.post('/api/users.php', {
        headers: { 'X-CSRF-Token': csrf },
        data: {
          action: 'create',
          role: 'admin_cabang',
          username: adminUsername,
          displayName: `Admin ${SIM_TAG} ${suffix}`,
          cabangId: branchId,
        },
      })
      expect(createAdmin.status()).toBe(201)
      const adminBody = await createAdmin.json()
      const adminUserId = adminBody.user.id
      const adminPassword = adminBody.initialPassword
      createdIds.push(adminUserId, branchId)

      // ---- Pre-condition: the account CAN log in while its branch lives.
      const preLogin = await tryLogin(page, adminUsername, adminPassword)
      expect(preLogin.status).toBe(200)
      expect(preLogin.body.user.username).toBe(adminUsername)

      // ---- Switch back to superadmin (only role allowed to delete a cabang).
      await logout(page)
      await page.context().clearCookies()
      csrf = await loginAndPrime(page, 'superadmin')

      const del = await page.request.post('/api/cabang.php', {
        headers: { 'X-CSRF-Token': csrf },
        data: { id: branchId, action: 'delete' },
      })
      expect(del.status()).toBe(200)

      // ---- The bound admin can no longer log in (401, generic error).
      const postLogin = await tryLogin(page, adminUsername, adminPassword)
      expect(postLogin.status).toBe(401)
      expect(postLogin.body.error).toBe('Nama pengguna atau kata sandi salah')

      // ---- users row: soft-deactivated, dangling FK nulled, row preserved.
      const row = probe('user', adminUserId)
      expect(row).toBeTruthy()
      expect(row.active).toBe(0)
      expect(row.cabangId).toBeNull()
      expect(row.username).toBe(adminUsername)

      // ---- audit_log: exactly one user_cascade_deactivated for this user,
      // carrying the pre-cascade FK ids and no PII (taste #50).
      const audit = probe('audit', adminUserId)
      expect(audit.count).toBe(1)
      expect(audit.metadata.cabangId).toBe(branchId)
      expect(audit.metadata.trainerId).toBeUndefined()
      expect(audit.metadata.username).toBeUndefined()

      // ---- Idempotence: second delete 422s (record gone), no new cascade
      // audit rows, and zero state drift on the deactivated user.
      const del2 = await page.request.post('/api/cabang.php', {
        headers: { 'X-CSRF-Token': csrf },
        data: { id: branchId, action: 'delete' },
      })
      expect(del2.status()).toBe(422)
      expect(probe('audit', adminUserId).count).toBe(1)
      const rowAfter = probe('user', adminUserId)
      expect(rowAfter.active).toBe(0)
      expect(rowAfter.cabangId).toBeNull()

      expect(pageErrors).toHaveLength(0)
    } finally {
      // Reactive cleanup (taste #66): remove this run's users/audit rows;
      // the branch row itself was already deleted by the delete under test.
      probe('clean', createdIds)
    }
  })

  test('D9.1 trainer delete deactivates bound users (401 login, audit row, idempotent)', async ({ page, pageErrors }) => {
    await resetStorage(page)
    const createdIds = []
    let csrf = await loginAndPrime(page, 'superadmin')

    const suffix = String(Date.now()).slice(-6) + 't'

    try {
      // ---- Seed: sekolah + trainer-with-account in the seeded admin's
      // branch (cbg-test-pusat) so the admin_cabang role guard at
      // trainer.php (superadmin cannot delete a trainer) passes —
      // same setup as tests/cascade-cleanup.spec.js Test B.
      const sekolahId = `sch-d91-${suffix}`
      const createSekolah = await page.request.post('/api/sekolah.php', {
        headers: { 'X-CSRF-Token': csrf },
        data: { action: 'create', id: sekolahId, nama: `${SIM_TAG} Sekolah`, spp: 100000, cabangId: 'cbg-test-pusat' },
      })
      expect(createSekolah.status()).toBe(201)
      createdIds.push(sekolahId)

      const trainerUsername = `trainer.d91.${suffix}.test`
      const createTrainer = await page.request.post('/api/users.php', {
        headers: { 'X-CSRF-Token': csrf },
        data: {
          action: 'create',
          role: 'trainer',
          username: trainerUsername,
          displayName: `Trainer ${SIM_TAG} ${suffix}`,
          cabangId: 'cbg-test-pusat',
          trainer: { nama: `Trainer ${SIM_TAG} ${suffix}`, wa: '08123456789', jadwal: 'Senin', honor: 50000, sekolahIds: [sekolahId] },
        },
      })
      expect(createTrainer.status()).toBe(201)
      const trainerBody = await createTrainer.json()
      const trainerUserId = trainerBody.user.id
      const trainerId = trainerBody.user.trainerId
      const trainerPassword = trainerBody.initialPassword
      expect(trainerId).toBeTruthy()
      createdIds.push(trainerUserId, trainerId)

      // ---- Pre-condition: the trainer account CAN log in.
      const preLogin = await tryLogin(page, trainerUsername, trainerPassword)
      expect(preLogin.status).toBe(200)
      expect(preLogin.body.user.username).toBe(trainerUsername)

      // ---- Switch to admin_cabang (the only role allowed to delete a
      // trainer), then delete the trainer row.
      await logout(page)
      await page.context().clearCookies()
      csrf = await loginAndPrime(page, 'adminCabang')

      const del = await page.request.post('/api/trainer.php', {
        headers: { 'X-CSRF-Token': csrf },
        data: { id: trainerId, action: 'delete' },
      })
      expect(del.status()).toBe(200)

      // ---- The trainer's login account can no longer log in (401, generic).
      const postLogin = await tryLogin(page, trainerUsername, trainerPassword)
      expect(postLogin.status).toBe(401)
      expect(postLogin.body.error).toBe('Nama pengguna atau kata sandi salah')

      // ---- users row: active = 0, dangling trainer_id nulled, cabang_id
      // deliberately preserved (only the deleted reference is cleared).
      const row = probe('user', trainerUserId)
      expect(row).toBeTruthy()
      expect(row.active).toBe(0)
      expect(row.trainerId).toBeNull()
      expect(row.cabangId).toBe('cbg-test-pusat')
      expect(row.username).toBe(trainerUsername)

      // ---- audit_log: exactly one user_cascade_deactivated, carrying the
      // pre-cascade trainer id, no PII.
      const audit = probe('audit', trainerUserId)
      expect(audit.count).toBe(1)
      expect(audit.metadata.trainerId).toBe(trainerId)
      expect(audit.metadata.cabangId).toBe('cbg-test-pusat')
      expect(audit.metadata.username).toBeUndefined()

      // ---- Idempotence: second delete 422s, no new audit rows, no drift.
      const del2 = await page.request.post('/api/trainer.php', {
        headers: { 'X-CSRF-Token': csrf },
        data: { id: trainerId, action: 'delete' },
      })
      expect(del2.status()).toBe(422)
      expect(probe('audit', trainerUserId).count).toBe(1)
      const rowAfter = probe('user', trainerUserId)
      expect(rowAfter.active).toBe(0)
      expect(rowAfter.trainerId).toBeNull()

      expect(pageErrors).toHaveLength(0)
    } finally {
      // Remove the leftover sekolah through the API (superadmin), then the
      // SQL probe purges this run's users + audit rows.
      try {
        await logout(page)
        await page.context().clearCookies()
        const cleanupCsrf = await loginAndPrime(page, 'superadmin')
        await deleteSekolah(page, cleanupCsrf, `sch-d91-${suffix}`)
      } catch {}
      probe('clean', createdIds)
    }
  })
})
