<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/exportShell.php';
require_once __DIR__ . '/../lib/exportMatrix.php';

/**
 * EX.1 VERIFY (renderer leg) + HTTP protection leg.
 *
 * Renderer leg runs with zero prerequisites (pure functions, no DB).
 * HTTP leg needs MySQL + a spawned PHP server; it is skipped with a
 * clear message when `--no-http` is passed or the DB is unreachable —
 * never fabricated (taste #56).
 *
 * Usage:
 *   php server/tests/export-doc.check.php            (both legs)
 *   php server/tests/export-doc.check.php --no-http  (renderer only)
 */

$failures = 0;
$total = 0;
function docCheck(string $label, bool $condition, string $detail = ''): void {
    global $failures, $total;
    $total++;
    if ($condition) {
        echo "  OK   $label\n";
    } else {
        $failures++;
        echo "  FAIL $label" . ($detail !== '' ? " — $detail" : '') . "\n";
    }
}

function containsAll(string $html, array $needles): array {
    $missing = [];
    foreach ($needles as $n) {
        if (strpos($html, $n) === false) $missing[] = $n;
    }
    return $missing;
}

// --- fixtures ---------------------------------------------------------
$expDates = [];
for ($d = 1; $d <= 31; $d++) $expDates[] = '2026-08-' . str_pad((string) $d, 2, '0', STR_PAD_LEFT);
function expRowCells(array $dates, array $filled): array {
    $cells = array_fill_keys($dates, []);
    foreach ($filled as $date => $entries) $cells[$date] = $entries;
    return $cells;
}
$fixtureMatrix = [
    'periode' => '2026-08',
    'dates' => $expDates,
    'rows' => [
        [
            'sekolahId' => 'skl-exp-A',
            'nama' => 'SD Simulasi Dok A',
            'cells' => expRowCells($expDates, [
                '2026-08-04' => [['nama' => 'Widia', 'label' => 'I', 'status' => 'Hadir', 'keterangan' => null, 'catatan' => null]],
                '2026-08-05' => [['nama' => 'Asyifa', 'label' => 'A', 'status' => 'Hadir', 'keterangan' => 'EXPO', 'catatan' => 'Catatan ralat']],
                '2026-08-06' => [['nama' => 'Budi', 'label' => 'I', 'status' => 'Izin', 'keterangan' => 'Pengganti', 'catatan' => null]],
            ]),
        ],
        [
            'sekolahId' => 'skl-exp-B',
            'nama' => 'SD Libur Panjang',
            'cells' => expRowCells($expDates, [
                '2026-08-17' => [['nama' => 'Citra', 'label' => 'I', 'status' => 'Hadir', 'keterangan' => 'LIBUR', 'catatan' => null]],
            ]),
        ],
    ],
];

// --- renderer leg -------------------------------------------------------
echo "--- renderer leg ---\n";

$html = renderExportMatrix($fixtureMatrix, []);
assert(strpos($html, 'NAMA SEKOLAH') !== false);
assert(substr_count($html, 'Widia (I)') === 1);

$missing = containsAll($html, [
    'NO', 'NAMA SEKOLAH', 'Widia (I)', 'Asyifa (A) — EXPO, Catatan ralat',
    'Budi (I) — Izin, Pengganti', 'Citra (I) — LIBUR', 'Agustus 2026',
    'Senin', '2026-08-01', '2026-08-31', '@page', 'landscape', 'Rekap',
]);
docCheck('matrix slots render (NO + NAMA SEKOLAH + cells + tokens + Agustus 2026)', count($missing) === 0, implode(' | ', $missing));
docCheck('Widia (I) appears exactly once', substr_count($html, 'Widia (I)') === 1, 'count=' . substr_count($html, 'Widia (I)'));
docCheck('full-month columns (31 date titles)', strpos($html, '2026-08-01') !== false && strpos($html, '2026-08-31') !== false);
docCheck('31-day month renders two printable blocks', substr_count($html, '<table class="x-table"') === 2, 'tables=' . substr_count($html, '<table class="x-table"'));
$shortHtml = renderExportMatrix(['periode' => '2026-02', 'dates' => ['2026-02-01', '2026-02-02'], 'rows' => [['sekolahId' => 's', 'nama' => 'SD Mini', 'cells' => ['2026-02-01' => [], '2026-02-02' => []]]]], []);
docCheck('short months stay one block', substr_count($shortHtml, '<table class="x-table"') === 1);
docCheck('each block repeats NO + NAMA SEKOLAH', substr_count($html, 'NAMA SEKOLAH') === 2);

// buildExportMatrix port pins (rule-for-rule vs src/lib/trainerAttendance.js)
$absensiRaw = [
    ['id' => 'r1', 'trainerId' => 'trn-w', 'sekolahId' => 'skl-a', 'tanggal' => '2026-08-04', 'periode' => '2026-08', 'status' => 'Hadir', 'keterangan' => null, 'catatan' => null, 'cabangId' => 'cbg-x', 'peran' => 'I'],
    ['id' => 'r2', 'trainerId' => 'trn-a', 'sekolahId' => 'skl-a', 'tanggal' => '2026-08-04', 'periode' => '2026-08', 'status' => 'Hadir', 'keterangan' => 'EXPO', 'catatan' => 'Catatan ralat', 'cabangId' => 'cbg-x'],
    ['id' => 'r3', 'trainerId' => 'trn-w', 'sekolahId' => 'skl-a', 'tanggal' => '2026-08-05', 'periode' => '2026-08', 'status' => 'Izin', 'keterangan' => 'Pengganti', 'catatan' => null, 'cabangId' => 'cbg-x', 'peran' => null],
    ['id' => 'r4-orig', 'trainerId' => 'trn-w', 'sekolahId' => 'skl-a', 'tanggal' => '2026-08-06', 'periode' => '2026-08', 'status' => 'Alpa', 'keterangan' => null, 'catatan' => null, 'cabangId' => 'cbg-x', 'peran' => 'I'],
    ['id' => 'r4-corr', 'trainerId' => 'trn-w', 'sekolahId' => 'skl-a', 'tanggal' => '2026-08-06', 'periode' => '2026-08', 'status' => 'Hadir', 'keterangan' => null, 'catatan' => null, 'cabangId' => 'cbg-x', 'peran' => 'I', 'correctionOf' => 'r4-orig'],
    ['id' => 'r5', 'trainerId' => 'trn-w', 'sekolahId' => 'skl-a', 'tanggal' => '2026-09-01', 'periode' => '2026-09', 'status' => 'Hadir', 'keterangan' => null, 'catatan' => null, 'cabangId' => 'cbg-x', 'peran' => 'I'],
];
$sekolahRaw = [['id' => 'skl-a', 'nama' => 'SD Simulasi Dok A'], ['id' => 'skl-other', 'nama' => 'ZZZ Tanpa Baris']];
$trainerRaw = [['id' => 'trn-w', 'nama' => 'Widia', 'tipePengajar' => 'instruktur'], ['id' => 'trn-a', 'nama' => 'Asyifa', 'tipePengajar' => 'asisten']];
$m = buildExportMatrix($absensiRaw, $sekolahRaw, $trainerRaw, '2026-08');
docCheck('builder keeps all calendar days as columns', count($m['dates']) === 31 && $m['dates'][0] === '2026-08-01' && $m['dates'][30] === '2026-08-31', 'dates=' . count($m['dates']));
docCheck('builder drops schools without records', count($m['rows']) === 1 && $m['rows'][0]['nama'] === 'SD Simulasi Dok A', json_encode(array_column($m['rows'], 'nama'), JSON_UNESCAPED_UNICODE));
$cell0404 = $m['rows'][0]['cells']['2026-08-04'] ?? null;
docCheck('same-day entries sorted by name (id locale)', is_array($cell0404) && count($cell0404) === 2 && $cell0404[0]['nama'] === 'Asyifa' && $cell0404[1]['nama'] === 'Widia', json_encode($cell0404, JSON_UNESCAPED_UNICODE));
docCheck('peran wins, tipePengajar is fallback only', ($cell0404[1]['label'] ?? null) === 'I' && ($cell0404[0]['label'] ?? null) === 'A', json_encode($cell0404, JSON_UNESCAPED_UNICODE));
$cell0406 = $m['rows'][0]['cells']['2026-08-06'] ?? null;
docCheck('correctionOf latest-wins (superseded hidden)', is_array($cell0406) && count($cell0406) === 1 && ($cell0406[0]['status'] ?? null) === 'Hadir', json_encode($cell0406, JSON_UNESCAPED_UNICODE));

// Identical-display-line parity with the client (seenDisplayLines key
// sekolahId|trainerId|tanggal|cellText): twin same-person records
// collapse to 1 line, same-name distinct trainers keep 2.
$twinAbsensi = [
    ['id' => 'dup-1', 'trainerId' => 'trn-w', 'sekolahId' => 'skl-a', 'tanggal' => '2026-08-10', 'periode' => '2026-08', 'status' => 'Hadir', 'keterangan' => null, 'catatan' => null, 'cabangId' => 'cbg-x'],
    ['id' => 'dup-2', 'trainerId' => 'trn-w', 'sekolahId' => 'skl-a', 'tanggal' => '2026-08-10', 'periode' => '2026-08', 'status' => 'Hadir', 'keterangan' => null, 'catatan' => null, 'cabangId' => 'cbg-x'],
    ['id' => 'dup-3', 'trainerId' => 'trn-k', 'sekolahId' => 'skl-a', 'tanggal' => '2026-08-10', 'periode' => '2026-08', 'status' => 'Hadir', 'keterangan' => null, 'catatan' => null, 'cabangId' => 'cbg-x'],
];
$twinTrainer = [
    ['id' => 'trn-w', 'nama' => 'Kembar', 'tipePengajar' => 'instruktur'],
    ['id' => 'trn-k', 'nama' => 'Kembar', 'tipePengajar' => 'instruktur'],
];
$twinM = buildExportMatrix($twinAbsensi, $sekolahRaw, $twinTrainer, '2026-08');
$twinCell = $twinM['rows'][0]['cells']['2026-08-10'] ?? null;
docCheck('twin same-person records collapse to 1 line', is_array($twinCell) && count($twinCell) === 2, json_encode($twinCell, JSON_UNESCAPED_UNICODE));
$twinIds = is_array($twinCell) ? array_column($twinCell, 'trainerId') : [];
sort($twinIds);
docCheck('entry carries trainerId; same-name distinct trainers both kept', $twinIds === ['trn-k', 'trn-w'], json_encode($twinIds));

docCheck('cell text bare Hadir', exportMatrixCellText(['nama' => 'Widia', 'label' => 'I', 'status' => 'Hadir', 'keterangan' => null, 'catatan' => null]) === 'Widia (I)');
docCheck('cell text joins keterangan', exportMatrixCellText(['nama' => 'Widia', 'label' => 'I', 'status' => 'Izin', 'keterangan' => null, 'catatan' => null]) === 'Widia (I) — Izin');
docCheck('cell text joins keterangan + extra', exportMatrixCellText(['nama' => 'Widia', 'label' => 'I', 'status' => 'Izin', 'keterangan' => 'Acara keluarga', 'catatan' => null]) === 'Widia (I) — Izin, Acara keluarga');
docCheck('cell text joins EXPO + catatan', exportMatrixCellText(['nama' => 'Widia', 'label' => 'A', 'status' => 'Hadir', 'keterangan' => 'EXPO', 'catatan' => 'Catatan ralat']) === 'Widia (A) — EXPO, Catatan ralat');

$emptyHtml = renderExportMatrix(['periode' => '2026-08', 'dates' => $expDates, 'rows' => []], []);
docCheck('empty matrix renders friendly row', strpos($emptyHtml, 'Belum ada absensi') !== false);

$evil = $fixtureMatrix;
$evil['rows'][0]['nama'] = '<script>alert(1)</script>';
docCheck('interpolated strings are escaped', strpos(renderExportMatrix($evil, []), '<script>alert(1)</script>') === false);

// --- HTTP protection leg (skipped with --no-http) -------------------
if (in_array('--no-http', $argv, true)) {
    echo "--- http leg SKIPPED (--no-http) ---\n";
} else {
    echo "--- http leg ---\n";

    $docConfig = @require __DIR__ . '/../config.php';
    if (!is_array($docConfig)) {
        fwrite(STDERR, "config.php tidak me-return array — DB untuk http leg tidak tersedia\n");
        exit(1);
    }
    try {
        $docPdo = new PDO($docConfig['dsn'], $docConfig['username'], $docConfig['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    } catch (PDOException $e) {
        fwrite(STDERR, 'BLOCKER: MySQL tidak terjangkau untuk http leg: ' . $e->getMessage() . "\n");
        exit(1);
    }

    // Spawn: PHP_BINARY + free port + tree-kill reaper (mirrors M3.3).
    $docFindPort = function (): int {
        $socket = @stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
        if ($socket === false) {
            fwrite(STDERR, "Could not allocate a free port: {$errstr}\n");
            exit(1);
        }
        $name = stream_socket_get_name($socket, false);
        fclose($socket);
        $parts = explode(':', (string) $name);
        return (int) end($parts);
    };
    $docRoot = realpath(__DIR__ . '/../..');
    $docPort = $docFindPort();
    $docBase = "http://127.0.0.1:$docPort";
    $docOut = tempnam(sys_get_temp_dir(), 'doc_stdout_');
    $docErr = tempnam(sys_get_temp_dir(), 'doc_stderr_');
    $docServer = proc_open(
        sprintf('%s -S 127.0.0.1:%d -t %s', escapeshellarg(PHP_BINARY), $docPort, escapeshellarg($docRoot)),
        [1 => ['file', $docOut, 'w'], 2 => ['file', $docErr, 'w']],
        $docPipes
    );
    $docPid = is_resource($docServer) ? (proc_get_status($docServer)['pid'] ?? 0) : 0;
    $docStop = function () use (&$docServer, $docPid): void {
        if (isset($docServer) && is_resource($docServer)) {
            if (PHP_OS_FAMILY === 'Windows' && (int) $docPid > 0) @exec('taskkill /PID ' . (int) $docPid . ' /T /F 2>NUL');
            @proc_terminate($docServer);
            @proc_close($docServer);
        }
        $docServer = null;
    };
    register_shutdown_function($docStop);
    $docReady = false;
    for ($i = 0; $i < 20; $i++) {
        usleep(200000);
        $conn = @fsockopen('127.0.0.1', $docPort, $errno, $errstr, 0.2);
        if ($conn) { fclose($conn); $docReady = true; break; }
    }
    if (!$docReady) {
        fwrite(STDERR, "Server on port $docPort never became reachable\n");
        exit(1);
    }

    $docReq = function (string $method, string $url, ?array $body = null, ?string $cookie = null, ?string $csrf = null): array {
        $ch = curl_init($url);
        $headers = ['Content-Type: application/json'];
        if ($csrf !== null) $headers[] = 'X-CSRF-Token: ' . $csrf;
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers, CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => 10,
            CURLOPT_HEADER => true,
        ]);
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        if ($cookie) { curl_setopt($ch, CURLOPT_COOKIEJAR, $cookie); curl_setopt($ch, CURLOPT_COOKIEFILE, $cookie); }
        $raw = curl_exec($ch);
        if ($raw === false) { fwrite(STDERR, "Request $method $url failed: " . curl_error($ch) . "\n"); exit(1); }
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $head = substr((string) $raw, 0, $headerSize);
        $respBody = substr((string) $raw, $headerSize);
        $ctype = '';
        if (preg_match('/^Content-Type:\s*([^\r\n]+)/mi', $head, $m)) $ctype = trim($m[1]);
        curl_close($ch);
        return [$status, $ctype, $respBody, $head];
    };
    $docLogin = function (string $username, string $cookie) use ($docBase, $docReq): void {
        [$status, , $respBody] = $docReq('POST', "$docBase/server/api/auth/login.php", ['username' => $username, 'password' => 'Test1234!'], $cookie);
        docCheck("http: login as $username", $status === 200, 'status=' . $status . ' body=' . substr($respBody, 0, 200));
    };
    $docCsrf = function (string $cookie, string $label) use ($docBase, $docReq): string {
        [$status, , $respBody] = $docReq('GET', "$docBase/server/api/auth/csrf.php", null, $cookie);
        $decoded = json_decode($respBody, true);
        if ($status !== 200 || !isset($decoded['csrfToken'])) {
            fwrite(STDERR, "Failed to fetch CSRF token for $label\n");
            exit(1);
        }
        return $decoded['csrfToken'];
    };

    // Seed fixtures (fixed, namespaced ids + pre-cleanup like M3.3).
    $docPdo->exec("DELETE FROM absensi_pengajar WHERE cabang_id IN ('cbg-exp-A','cbg-exp-B')");
    $docPdo->exec("DELETE FROM trainer WHERE cabang_id IN ('cbg-exp-A','cbg-exp-B')");
    $docPdo->exec("DELETE FROM sekolah WHERE cabang_id IN ('cbg-exp-A','cbg-exp-B')");
    $docPdo->exec("DELETE FROM users WHERE username IN ('exp_super','exp_adm_a','exp_adm_b','exp_trn')");
    $docPdo->exec("DELETE FROM cabang WHERE id IN ('cbg-exp-A','cbg-exp-B')");
    $docPdo->prepare("INSERT INTO cabang (id, kode, nama, payload) VALUES ('cbg-exp-A','EXPA','Exp Branch A','{}')")->execute();
    $docPdo->prepare("INSERT INTO cabang (id, kode, nama, payload) VALUES ('cbg-exp-B','EXPB','Exp Branch B','{}')")->execute();
    $docSeedUser = function (string $id, string $username, string $role, ?string $cabang, ?string $trainerId = null) use ($docPdo): void {
        $docPdo->prepare(
            'INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, trainer_id, active, must_change_password)
             VALUES (:id, :u, :d, :p, :r, :c, :t, 1, 0)'
        )->execute([':id' => $id, ':u' => $username, ':d' => $username, ':p' => password_hash('Test1234!', PASSWORD_DEFAULT), ':r' => $role, ':c' => $cabang, ':t' => $trainerId]);
    };
    $docSeedUser('usr-exp-super', 'exp_super', 'superadmin', null);
    $docSeedUser('usr-exp-admA', 'exp_adm_a', 'admin_cabang', 'cbg-exp-A');
    $docSeedUser('usr-exp-admB', 'exp_adm_b', 'admin_cabang', 'cbg-exp-B');
    $docSeedUser('usr-exp-trn', 'exp_trn', 'trainer', 'cbg-exp-A', 'trn-exp-1');
    $docPdo->prepare("INSERT INTO sekolah (id, cabang_id, payload) VALUES ('skl-exp-A','cbg-exp-A',:p)")->execute([':p' => json_encode(
        ['id' => 'skl-exp-A', 'cabangId' => 'cbg-exp-A', 'nama' => 'SD Ekspor A'],
        JSON_UNESCAPED_UNICODE)]);
    $docPdo->prepare("INSERT INTO sekolah (id, cabang_id, payload) VALUES ('skl-exp-B','cbg-exp-B',:p)")->execute([':p' => json_encode(
        ['id' => 'skl-exp-B', 'cabangId' => 'cbg-exp-B', 'nama' => 'SD Ekspor B'],
        JSON_UNESCAPED_UNICODE)]);
    $docPdo->prepare("INSERT INTO trainer (id, cabang_id, payload) VALUES ('trn-exp-1','cbg-exp-A',:p)")->execute([':p' => json_encode(
        ['id' => 'trn-exp-1', 'cabangId' => 'cbg-exp-A', 'nama' => 'Widia', 'tipePengajar' => 'instruktur',
         'penugasanPengajar' => [['sekolahId' => 'skl-exp-A', 'trainerId' => 'trn-exp-1', 'aktif' => true, 'periodeMulai' => '2026-01-01', 'periodeSelesai' => null]]],
        JSON_UNESCAPED_UNICODE)]);
    $docPdo->prepare("INSERT INTO trainer (id, cabang_id, payload) VALUES ('trn-exp-2','cbg-exp-A',:p)")->execute([':p' => json_encode(
        ['id' => 'trn-exp-2', 'cabangId' => 'cbg-exp-A', 'nama' => 'Asyifa', 'tipePengajar' => 'asisten'],
        JSON_UNESCAPED_UNICODE)]);
    $docPdo->prepare("INSERT INTO trainer (id, cabang_id, payload) VALUES ('trn-exp-3','cbg-exp-B',:p)")->execute([':p' => json_encode(
        ['id' => 'trn-exp-3', 'cabangId' => 'cbg-exp-B', 'nama' => 'Budi', 'tipePengajar' => 'instruktur'],
        JSON_UNESCAPED_UNICODE)]);
    $docSeedRow = function (string $id, string $cabang, array $record) use ($docPdo): void {
        $docPdo->prepare('INSERT INTO absensi_pengajar (id, cabang_id, correction_of, payload) VALUES (:id, :c, NULL, :p)')
            ->execute([':id' => $id, ':c' => $cabang, ':p' => json_encode($record, JSON_UNESCAPED_UNICODE)]);
    };
    $docSeedRow('absp-exp-1', 'cbg-exp-A', ['id' => 'absp-exp-1', 'trainerId' => 'trn-exp-1', 'sekolahId' => 'skl-exp-A', 'tanggal' => '2026-08-04', 'periode' => '2026-08', 'status' => 'Hadir', 'keterangan' => null, 'catatan' => null, 'cabangId' => 'cbg-exp-A']);
    $docSeedRow('absp-exp-2', 'cbg-exp-A', ['id' => 'absp-exp-2', 'trainerId' => 'trn-exp-2', 'sekolahId' => 'skl-exp-A', 'tanggal' => '2026-08-04', 'periode' => '2026-08', 'status' => 'Hadir', 'keterangan' => 'EXPO', 'catatan' => '', 'cabangId' => 'cbg-exp-A']);
    $docSeedRow('absp-exp-3', 'cbg-exp-A', ['id' => 'absp-exp-3', 'trainerId' => 'trn-exp-1', 'sekolahId' => 'skl-exp-A', 'tanggal' => '2026-08-05', 'periode' => '2026-08', 'status' => 'Izin', 'keterangan' => 'Pengganti', 'catatan' => null, 'cabangId' => 'cbg-exp-A']);
    $docSeedRow('absp-exp-9', 'cbg-exp-B', ['id' => 'absp-exp-9', 'trainerId' => 'trn-exp-3', 'sekolahId' => 'skl-exp-B', 'tanggal' => '2026-08-04', 'periode' => '2026-08', 'status' => 'Hadir', 'keterangan' => null, 'catatan' => null, 'cabangId' => 'cbg-exp-B']);

    $docUrl = "$docBase/server/api/export-doc.php";
    $jarAnon = tempnam(sys_get_temp_dir(), 'doc_anon_');
    $jarA = tempnam(sys_get_temp_dir(), 'doc_a_');
    $jarB = tempnam(sys_get_temp_dir(), 'doc_b_');
    $jarS = tempnam(sys_get_temp_dir(), 'doc_s_');
    $jarT = tempnam(sys_get_temp_dir(), 'doc_t_');
    $docLogin('exp_adm_a', $jarA);
    $docLogin('exp_adm_b', $jarB);
    $docLogin('exp_super', $jarS);
    $docLogin('exp_trn', $jarT);
    $csrfA = $docCsrf($jarA, 'adm_a');
    $csrfB = $docCsrf($jarB, 'adm_b');
    $csrfS = $docCsrf($jarS, 'super');
    $csrfT = $docCsrf($jarT, 'trainer');
    $goodBody = ['type' => 'rekap-pengajar', 'periode' => '2026-08'];

    [$status] = $docReq('POST', $docUrl, $goodBody);
    docCheck('http: anonymous POST -> 401', $status === 401, "got $status");
    [$status] = $docReq('POST', $docUrl, $goodBody, $jarA);
    docCheck('http: authed POST without CSRF -> 403', $status === 403, "got $status");
    [$status] = $docReq('POST', $docUrl, ['periode' => '2026-08'], $jarA, $csrfA);
    docCheck('http: missing type -> 422', $status === 422, "got $status");
    [$status] = $docReq('POST', $docUrl, ['type' => 'bogus', 'periode' => '2026-08'], $jarA, $csrfA);
    docCheck('http: unknown type -> 422', $status === 422, "got $status");
    [$status] = $docReq('POST', $docUrl, ['type' => 'rekap-pengajar', 'periode' => 'Agustus'], $jarA, $csrfA);
    docCheck('http: malformed periode -> 422', $status === 422, "got $status");
    [$status] = $docReq('POST', $docUrl, ['type' => 'rekap-pengajar', 'periode' => '2026-08', 'sekolahId' => 'skl-exp-unknown'], $jarA, $csrfA);
    docCheck('http: unknown sekolahId -> 404', $status === 404, "got $status");
    [$status] = $docReq('POST', $docUrl, ['type' => 'rekap-pengajar', 'periode' => '2026-08', 'sekolahId' => 'skl-exp-A'], $jarB, $csrfB);
    docCheck('http: cross-branch admin sekolah scope -> 403', $status === 403, "got $status");
    [$status] = $docReq('POST', $docUrl, ['type' => 'rekap-pengajar', 'periode' => '2026-08', 'sekolahId' => 'skl-exp-B'], $jarA, $csrfA);
    docCheck('http: own-branch admin other-branch school -> 403', $status === 403, "got $status");
    [$status] = $docReq('POST', $docUrl, ['type' => 'rekap-pengajar', 'periode' => '2026-08', 'sekolahId' => 'skl-exp-B'], $jarT, $csrfT);
    docCheck('http: trainer unassigned school -> 403', $status === 403, "got $status");
    [$status] = $docReq('GET', $docUrl . '?type=rekap-pengajar', null, $jarA);
    docCheck('http: GET -> 405', $status === 405, "got $status");

    [$status, $ctype, $respBody, $head] = $docReq('POST', $docUrl, $goodBody, $jarA, $csrfA);
    docCheck('http: own-branch admin -> 200 text/html', $status === 200 && stripos($ctype, 'text/html') !== false, "got $status / $ctype");
    $missing = containsAll($respBody, [
        'SD Ekspor A', 'Widia (I)', 'Asyifa (A) — EXPO', 'Agustus 2026', 'NAMA SEKOLAH',
    ]);
    docCheck('http: own-branch body carries school + cells + periode', count($missing) === 0, implode(' | ', $missing));
    docCheck('http: own-branch body hides other branch', strpos($respBody, 'SD Ekspor B') === false);
    docCheck('http: filename carries periode', stripos($head, 'Rekap_Pengajar_2026-08.html') !== false, substr($head, 0, 400));

    [$statusS, , $bodyS] = $docReq('POST', $docUrl, $goodBody, $jarS, $csrfS);
    docCheck('http: superadmin -> 200 with both branches', $statusS === 200 && strpos($bodyS, 'SD Ekspor A') !== false && strpos($bodyS, 'SD Ekspor B') !== false, "got $statusS");

    [$statusT, , $bodyT] = $docReq('POST', $docUrl, $goodBody, $jarT, $csrfT);
    docCheck('http: trainer -> 200 self-reads only', $statusT === 200 && strpos($bodyT, 'Widia (I)') !== false && strpos($bodyT, 'Asyifa (A)') === false, "got $statusT");

    [$statusTA, , $bodyTA] = $docReq('POST', $docUrl, ['type' => 'rekap-pengajar', 'periode' => '2026-08', 'sekolahId' => 'skl-exp-A'], $jarT, $csrfT);
    docCheck('http: trainer assigned school -> 200 scoped to school', $statusTA === 200 && strpos($bodyTA, 'SD Ekspor A') !== false && strpos($bodyTA, 'Widia (I)') !== false, "got $statusTA");

    // Cleanup (same-branch rows only; users/cabang fixtures removed too).
    $docPdo->exec("DELETE FROM absensi_pengajar WHERE cabang_id IN ('cbg-exp-A','cbg-exp-B')");
    $docPdo->exec("DELETE FROM trainer WHERE cabang_id IN ('cbg-exp-A','cbg-exp-B')");
    $docPdo->exec("DELETE FROM sekolah WHERE cabang_id IN ('cbg-exp-A','cbg-exp-B')");
    $docPdo->exec("DELETE FROM users WHERE username IN ('exp_super','exp_adm_a','exp_adm_b','exp_trn')");
    $docPdo->exec("DELETE FROM cabang WHERE id IN ('cbg-exp-A','cbg-exp-B')");
    $docStop();
}

echo $failures === 0 ? "\nexport-doc.check: ALL $total PASSED\n" : "\nToolbox: export-doc.check: $failures/$total FAILED\n";
exit($failures === 0 ? 0 : 1);
