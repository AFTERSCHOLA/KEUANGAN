<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/invoiceDoc.php';

/**
 * IP.1 VERIFY (renderer leg) + IP.2 VERIFY (HTTP protection leg).
 *
 * Renderer leg runs with zero prerequisites (pure functions, no DB).
 * HTTP leg needs MySQL + a spawned PHP server; it is skipped with a
 * clear message when `--no-http` is passed or the DB is unreachable —
 * never fabricated (taste #56).
 *
 * Usage:
 *   php server/tests/invoice-doc.check.php            (both legs)
 *   php server/tests/invoice-doc.check.php --no-http  (renderer only)
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
$canonical = [
    'id' => 'inv-doc-test-1',
    'sekolahId' => 'skl-doc-test-1',
    'periode' => '2026-08',
    'nomorInvoice' => 'AFS-202608-0001',
    'nomor' => 'AFS-202608-0001',
    'tanggal' => '2026-08-05',
    'tanggalTerbit' => '2026-08-05',
    'status' => 'Terbit',
    'pjNama' => 'Mr. HADI',
    'items' => [
        ['deskripsi' => 'Pembayaran kegiatan Ekstrakurikuler Coding Semester Ganjil 2026/2027 (12x Pertemuan)', 'jumlahSiswa' => 11, 'hargaSatuan' => 850000, 'total' => 9350000],
    ],
    'grandTotal' => 9350000,
    'carryOverLines' => [],
];
$sekolah = ['id' => 'skl-doc-test-1', 'nama' => 'SMP TRIDAYA TUNAS BANGSA'];
$settings = [
    'alamatUsaha' => 'Jl. Cisaranten Wetan no 167A, Bandung',
    'rekeningBank' => 'BSI', 'rekeningNomor' => '7230664565',
    'rekeningAtasNama' => 'PT Air Consulting Group',
    'penandatangan' => 'Irvan Arief Rachman',
];
$settlement = ['total' => 9350000, 'dibayar' => 0, 'sisa' => 9350000, 'credit' => 0, 'status' => 'Belum Lunas'];

// --- renderer leg -------------------------------------------------------
echo "--- renderer leg ---\n";

$html = renderInvoiceDoc($canonical, $sekolah, $settings, $settlement, []);
$missing = containsAll($html, [
    'AFS-202608-0001', 'SMP TRIDAYA TUNAS BANGSA', 'Mr. HADI', 'Agustus 2026',
    'INVOICE', 'KEPADA YTH', 'BULAN TAGIHAN', 'Uraian', 'Harga', 'GRAND TOTAL',
    'Rp 9.350.000', 'Sembilan Juta Tiga Ratus Lima Puluh Ribu Rupiah',
    'Catatan Pembayaran', 'Bank BSI No. Rekening: 7230664565',
    'Hormat Kami', 'Irvan Arief Rachman',
    'STATUS PEMBAYARAN (LAMPIRAN)', 'Belum Lunas',
    '@page', 'size:A4',
]);
docCheck('canonical shape renders every D-IP4 slot + appendix + A4', count($missing) === 0, implode(' | ', $missing));

docCheck('terbilang(9350000) matches template line', invoiceDocTerbilang(9350000) === 'Sembilan Juta Tiga Ratus Lima Puluh Ribu Rupiah', invoiceDocTerbilang(9350000));
docCheck('terbilang(0) is Nol Rupiah', invoiceDocTerbilang(0) === 'Nol Rupiah');
docCheck('periode label single month', invoiceDocPeriodeLabel(['2026-08']) === 'Agustus 2026', invoiceDocPeriodeLabel(['2026-08']));
docCheck('periode label semester range', invoiceDocPeriodeLabel(['2026-07', '2026-12']) === 'Juli 2026 - Desember 2026');
docCheck('rupiah grouping', invoiceDocRupiah(9350000) === 'Rp 9.350.000', invoiceDocRupiah(9350000));

$legacy = [
    'id' => 'inv-doc-test-legacy', 'sekolahId' => 'skl-doc-test-1',
    'mode' => 'bulanan', 'periodeList' => ['2026-09'],
    'jumlahSiswa' => 2, 'hargaSatuan' => 500000, 'total' => 1000000,
    'uraian' => 'Pembayaran SPP bulan September 2026', 'pjSekolah' => 'Ibu Sari',
    'tanggalTerbit' => '2026-09-01', 'status' => 'Terbit',
];
$htmlLegacy = renderInvoiceDoc($legacy, $sekolah, $settings, null, []);
$missingLegacy = containsAll($htmlLegacy, ['September 2026', 'Pembayaran SPP bulan September 2026', 'Ibu Sari', 'Rp 1.000.000']);
docCheck('legacy shape renders single row unchanged', count($missingLegacy) === 0, implode(' | ', $missingLegacy));
docCheck('null settlement hides appendix', strpos($htmlLegacy, 'STATUS PEMBAYARAN') === false);

$settle = invoiceDocSettlement(
    ['id' => 'inv-x', 'grandTotal' => 1000000, 'periode' => '2026-09', 'sekolahId' => 'skl-1'],
    [
        ['invoiceId' => 'inv-x', 'nominal' => 300000],
        ['siswaId' => 'sw-1', 'periode' => '2026-09', 'nominal' => 200000], // historical, same school
        ['siswaId' => 'sw-9', 'periode' => '2026-09', 'nominal' => 999],   // other school student -> ignored
        ['siswaId' => 'sw-1', 'periode' => '2026-10', 'nominal' => 999],   // outside periods -> ignored
    ],
    ['sw-1']
);
docCheck('settlement mirrors invoiceSettlement (500rb/500rb/Belum Lunas)',
    $settle['dibayar'] === 500000.0 && $settle['sisa'] === 500000.0 && $settle['status'] === 'Belum Lunas',
    json_encode($settle, JSON_UNESCAPED_UNICODE));

$draft = $canonical;
$draft['status'] = 'Draft';
$draft['nomor'] = null;
unset($draft['nomorInvoice']);
$htmlDraft = renderInvoiceDoc($draft, $sekolah, $settings, $settlement, []);
docCheck('draft hides nomor + appendix, shows DRAFT chip',
    strpos($htmlDraft, '(Draft)') !== false && strpos($htmlDraft, 'STATUS PEMBAYARAN') === false && strpos($htmlDraft, 'DRAFT') !== false);

$evil = $canonical;
$evil['pjNama'] = '<script>alert(1)</script>';
docCheck('interpolated strings are escaped', strpos(renderInvoiceDoc($evil, $sekolah, $settings, null, []), '<script>alert(1)</script>') === false);

// --- HTTP protection leg (IP.2; skipped with --no-http) -------------------
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
        return [$status, $ctype, $respBody];
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

    // Seed fixtures (randomized ids would collide with cleanup LIKEs —
    // use fixed, namespaced ids + pre-cleanup like M3.3).
    $docPdo->exec("DELETE FROM spp_payments WHERE cabang_id IN ('cbg-doc-A','cbg-doc-B')");
    $docPdo->exec("DELETE FROM invoices WHERE cabang_id IN ('cbg-doc-A','cbg-doc-B')");
    $docPdo->exec("DELETE FROM siswa WHERE cabang_id IN ('cbg-doc-A','cbg-doc-B')");
    $docPdo->exec("DELETE FROM sekolah WHERE cabang_id IN ('cbg-doc-A','cbg-doc-B')");
    $docPdo->exec("DELETE FROM users WHERE username IN ('doc_super','doc_adm_a','doc_adm_b','doc_trn')");
    $docPdo->exec("DELETE FROM cabang WHERE id IN ('cbg-doc-A','cbg-doc-B')");
    $docPdo->prepare("INSERT INTO cabang (id, kode, nama, payload) VALUES ('cbg-doc-A','DOCA','Doc Branch A','{}')")->execute();
    $docPdo->prepare("INSERT INTO cabang (id, kode, nama, payload) VALUES ('cbg-doc-B','DOCB','Doc Branch B','{}')")->execute();
    $docSeedUser = function (string $id, string $username, string $role, ?string $cabang) use ($docPdo): void {
        $docPdo->prepare(
            'INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, active, must_change_password)
             VALUES (:id, :u, :d, :p, :r, :c, 1, 0)'
        )->execute([':id' => $id, ':u' => $username, ':d' => $username, ':p' => password_hash('Test1234!', PASSWORD_DEFAULT), ':r' => $role, ':c' => $cabang]);
    };
    $docSeedUser('usr-doc-super', 'doc_super', 'superadmin', null);
    $docSeedUser('usr-doc-admA', 'doc_adm_a', 'admin_cabang', 'cbg-doc-A');
    $docSeedUser('usr-doc-admB', 'doc_adm_b', 'admin_cabang', 'cbg-doc-B');
    $docSeedUser('usr-doc-trn', 'doc_trn', 'trainer', 'cbg-doc-A');
    $docPdo->prepare("INSERT INTO sekolah (id, cabang_id, payload) VALUES ('skl-doc-A','cbg-doc-A',:p)")->execute([':p' => json_encode(
        ['id' => 'skl-doc-A', 'cabangId' => 'cbg-doc-A', 'nama' => 'SMP Doc A', 'pjNama' => 'PJ Doc'],
        JSON_UNESCAPED_UNICODE)]);
    $docPdo->prepare("INSERT INTO siswa (id, cabang_id, payload) VALUES ('sw-doc-1','cbg-doc-A',:p)")->execute([':p' => json_encode(
        ['id' => 'sw-doc-1', 'cabangId' => 'cbg-doc-A', 'sekolahId' => 'skl-doc-A', 'status' => 'Aktif'],
        JSON_UNESCAPED_UNICODE)]);
    $docInvoice = [
        'id' => 'inv-doc-A1', 'cabangId' => 'cbg-doc-A', 'sekolahId' => 'skl-doc-A',
        'sekolahNama' => 'SMP Doc A', 'pjNama' => 'PJ Doc', 'periode' => '2026-08',
        'nomorInvoice' => 'AFS-202608-9001', 'nomor' => 'AFS-202608-9001',
        'tanggal' => '2026-08-05', 'tanggalTerbit' => '2026-08-05', 'status' => 'Terbit',
        'items' => [['deskripsi' => 'Uraian Doc', 'jumlahSiswa' => 2, 'hargaSatuan' => 500000, 'total' => 1000000]],
        'grandTotal' => 1000000, 'carryOverLines' => [],
    ];
    $docPdo->prepare("INSERT INTO invoices (id, cabang_id, payload) VALUES ('inv-doc-A1','cbg-doc-A',:p)")->execute([':p' => json_encode($docInvoice, JSON_UNESCAPED_UNICODE)]);
    $docPdo->prepare("INSERT INTO spp_payments (id, cabang_id, payload) VALUES ('pay-doc-1','cbg-doc-A',:p)")->execute([':p' => json_encode(
        ['id' => 'pay-doc-1', 'cabangId' => 'cbg-doc-A', 'invoiceId' => 'inv-doc-A1', 'nominal' => 300000, 'periode' => '2026-08'],
        JSON_UNESCAPED_UNICODE)]);

    $docUrl = "$docBase/server/api/invoices-doc.php";
    $jarAnon = tempnam(sys_get_temp_dir(), 'doc_anon_');
    $jarA = tempnam(sys_get_temp_dir(), 'doc_a_');
    $jarB = tempnam(sys_get_temp_dir(), 'doc_b_');
    $jarS = tempnam(sys_get_temp_dir(), 'doc_s_');
    $jarT = tempnam(sys_get_temp_dir(), 'doc_t_');
    $docLogin('doc_adm_a', $jarA);
    $docLogin('doc_adm_b', $jarB);
    $docLogin('doc_super', $jarS);
    $docLogin('doc_trn', $jarT);
    $csrfA = $docCsrf($jarA, 'adm_a');
    $csrfB = $docCsrf($jarB, 'adm_b');
    $csrfS = $docCsrf($jarS, 'super');
    $csrfT = $docCsrf($jarT, 'trainer');

    [$status] = $docReq('POST', $docUrl, ['id' => 'inv-doc-A1']);
    docCheck('http: anonymous POST -> 401', $status === 401, "got $status");
    [$status] = $docReq('POST', $docUrl, ['id' => 'inv-doc-A1'], $jarA);
    docCheck('http: authed POST without CSRF -> 403', $status === 403, "got $status");
    [$status] = $docReq('POST', $docUrl, [], $jarA, $csrfA);
    docCheck('http: missing id -> 422', $status === 422, "got $status");
    [$status] = $docReq('POST', $docUrl, ['id' => 'inv-doc-unknown'], $jarA, $csrfA);
    docCheck('http: unknown id -> 404', $status === 404, "got $status");
    [$status] = $docReq('POST', $docUrl, ['id' => 'inv-doc-A1'], $jarB, $csrfB);
    docCheck('http: cross-branch admin -> 403', $status === 403, "got $status");
    [$status] = $docReq('POST', $docUrl, ['id' => 'inv-doc-A1'], $jarT, $csrfT);
    docCheck('http: trainer -> 403 (invoices not trainer-readable)', $status === 403, "got $status");
    [$status] = $docReq('GET', $docUrl . '?id=inv-doc-A1', null, $jarA);
    docCheck('http: GET -> 405', $status === 405, "got $status");

    [$status, $ctype, $respBody] = $docReq('POST', $docUrl, ['id' => 'inv-doc-A1'], $jarA, $csrfA);
    docCheck('http: own-branch admin -> 200 text/html', $status === 200 && stripos($ctype, 'text/html') !== false, "got $status / $ctype");
    $missing = containsAll($respBody, [
        'AFS-202608-9001', 'SMP Doc A', 'PJ Doc', 'Agustus 2026', 'Uraian Doc',
        'Rp 1.000.000', 'Rp 300.000', 'Rp 700.000', 'Belum Lunas', 'Terbilang',
    ]);
    docCheck('http: own-branch body carries nomor + settlement appendix', count($missing) === 0, implode(' | ', $missing));

    [$statusS, , $bodyS] = $docReq('POST', $docUrl, ['id' => 'inv-doc-A1'], $jarS, $csrfS);
    docCheck('http: superadmin -> 200 with nomor', $statusS === 200 && strpos($bodyS, 'AFS-202608-9001') !== false, "got $statusS");

    // Cleanup (same-branch rows only; users/cabang fixtures removed too).
    $docPdo->exec("DELETE FROM spp_payments WHERE cabang_id IN ('cbg-doc-A','cbg-doc-B')");
    $docPdo->exec("DELETE FROM invoices WHERE cabang_id IN ('cbg-doc-A','cbg-doc-B')");
    $docPdo->exec("DELETE FROM siswa WHERE cabang_id IN ('cbg-doc-A','cbg-doc-B')");
    $docPdo->exec("DELETE FROM sekolah WHERE cabang_id IN ('cbg-doc-A','cbg-doc-B')");
    $docPdo->exec("DELETE FROM users WHERE username IN ('doc_super','doc_adm_a','doc_adm_b','doc_trn')");
    $docPdo->exec("DELETE FROM cabang WHERE id IN ('cbg-doc-A','cbg-doc-B')");
    $docStop();
}

echo $failures === 0 ? "\ninvoice-doc.check: ALL $total PASSED\n" : "\n Toolbox: invoice-doc.check: $failures/$total FAILED\n";
exit($failures === 0 ? 0 : 1);
