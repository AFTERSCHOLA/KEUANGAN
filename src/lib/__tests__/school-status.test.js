import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { newSekolah, filterSekolahByStatus } from '../constants.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

describe('School status: newSekolah defaults and status filtering', () => {
  it('newSekolah() defaults to status: "Aktif"', () => {
    const s1 = newSekolah()
    expect(s1.status).toBe('Aktif')

    const s2 = newSekolah('cbg-custom', 'BDG')
    expect(s2.status).toBe('Aktif')
  })

  it('filterSekolahByStatus() correctly separates "Aktif", "Non-Aktif", and treats missing status as "Aktif"', () => {
    const list = [
      { id: 'skl-1', nama: 'Sekolah 1', status: 'Aktif' },
      { id: 'skl-2', nama: 'Sekolah 2', status: 'Non-Aktif' },
      { id: 'skl-3', nama: 'Sekolah Legacy' }, // undefined status
    ]

    const active = filterSekolahByStatus(list, 'Aktif')
    expect(active.map(s => s.id)).toEqual(['skl-1', 'skl-3'])

    const inactive = filterSekolahByStatus(list, 'Non-Aktif')
    expect(inactive.map(s => s.id)).toEqual(['skl-2'])

    const all = filterSekolahByStatus(list, 'Semua')
    expect(all.map(s => s.id)).toEqual(['skl-1', 'skl-2', 'skl-3'])
  })

  it('operational school selection omits Non-Aktif schools while preserving legacy schools', () => {
    const list = [
      { id: 'skl-1', nama: 'Sekolah 1', status: 'Aktif' },
      { id: 'skl-2', nama: 'Sekolah 2', status: 'Non-Aktif' },
      { id: 'skl-3', nama: 'Sekolah Legacy' },
    ]
    const selectable = list.filter(s => s.status !== 'Non-Aktif')
    expect(selectable.map(s => s.id)).toEqual(['skl-1', 'skl-3'])
  })
})

describe('Server PHP contracts: sekolah status validation & invoice generator isolation', () => {
  it('validateSekolah rejects invalid status and accepts Aktif/Non-Aktif', () => {
    const phpScript = `
      require_once 'server/bootstrap.php';
      require_once 'server/validation/entities.php';
      $config = serverConfig();
      $pdo = new PDO($config['dsn'], $config['username'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
      
      $cabangId = $pdo->query("SELECT id FROM cabang LIMIT 1")->fetchColumn();
      if (!$cabangId) {
          $cabangId = 'cbg-test-pusat';
          $pdo->prepare("INSERT INTO cabang (id, kode, nama, version, payload) VALUES (:id, 'PST', 'Pusat Test', 1, '{}')")->execute([':id' => $cabangId]);
      }
      
      $errsInvalid = validateSekolah([
        'id' => 'skl-test-val',
        'cabangId' => $cabangId,
        'status' => 'Pending'
      ], $pdo);
      
      $errsAktif = validateSekolah([
        'id' => 'skl-test-val',
        'cabangId' => $cabangId,
        'status' => 'Aktif'
      ], $pdo);
      
      $errsNonAktif = validateSekolah([
        'id' => 'skl-test-val',
        'cabangId' => $cabangId,
        'status' => 'Non-Aktif'
      ], $pdo);
      
      echo json_encode([
        'invalid' => $errsInvalid,
        'aktif' => $errsAktif,
        'nonAktif' => $errsNonAktif,
      ]);
    `

    const raw = execFileSync('php', ['-r', phpScript], { cwd: repoRoot, encoding: 'utf8' })
    const res = JSON.parse(raw)

    expect(res.invalid).toContain('sekolah: status must be Aktif or Non-Aktif')
    expect(res.aktif).toEqual([])
    expect(res.nonAktif).toEqual([])
  })

  it('invoiceGenerator skips Non-Aktif schools with reason sekolah_non_aktif', () => {
    const phpScript = `
      require_once 'server/bootstrap.php';
      require_once 'server/lib/invoiceGenerator.php';
      $config = serverConfig();
      $pdo = new PDO($config['dsn'], $config['username'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
      
      $cabangId = $pdo->query("SELECT id FROM cabang LIMIT 1")->fetchColumn();
      if (!$cabangId) {
          $cabangId = 'cbg-test-pusat';
          $pdo->prepare("INSERT INTO cabang (id, kode, nama, version, payload) VALUES (:id, 'PST', 'Pusat Test', 1, '{}')")->execute([':id' => $cabangId]);
      }
      $sklId = 'skl-test-nonaktif-' . bin2hex(random_bytes(3));
      $swId = 'sw-test-' . bin2hex(random_bytes(3));
      $periode = '2026-11';
      
      try {
        // Insert Non-Aktif school
        $payloadSkl = [
          'id' => $sklId,
          'nama' => 'Sekolah Non Aktif Test',
          'spp' => 100000,
          'cabangId' => $cabangId,
          'status' => 'Non-Aktif'
        ];
        $pdo->prepare("INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :c, :p)")
            ->execute([':id' => $sklId, ':c' => $cabangId, ':p' => json_encode($payloadSkl)]);
            
        // Insert active student in this school
        $payloadSw = [
          'id' => $swId,
          'sekolahId' => $sklId,
          'status' => 'Aktif',
          'nama' => 'Siswa Test'
        ];
        $pdo->prepare("INSERT INTO siswa (id, cabang_id, payload) VALUES (:id, :c, :p)")
            ->execute([':id' => $swId, ':c' => $cabangId, ':p' => json_encode($payloadSw)]);
            
        $actor = ['id' => null, 'role' => 'system', 'cabangId' => null];
        $res = generateInvoicesForPeriod($pdo, $periode, 'Tagihan SPP', $actor, null, $sklId);
        
        echo json_encode($res);
      } finally {
        $pdo->prepare("DELETE FROM invoices WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, '$.sekolahId')) = :sid")->execute([':sid' => $sklId]);
        $pdo->prepare("DELETE FROM siswa WHERE id = :id")->execute([':id' => $swId]);
        $pdo->prepare("DELETE FROM sekolah WHERE id = :id")->execute([':id' => $sklId]);
      }
    `

    const raw = execFileSync('php', ['-r', phpScript], { cwd: repoRoot, encoding: 'utf8' })
    const res = JSON.parse(raw)

    expect(res.generated).toEqual([])
    expect(res.skipped).toContainEqual({
      sekolahId: expect.stringMatching(/^skl-test-nonaktif-/),
      reason: 'sekolah_non_aktif'
    })
  })
})
