<?php
declare(strict_types=1);

// ============================================================
// LP.B.1 — Logo upload endpoint verification suite
// (F-LP1, F-LP2; D-LP1, D-LP2, D-LP3; R-LP1, R-LP2)
//
// Proves the LP.B.1 VERIFY matrix in one script:
//   anonymous 401, missing-CSRF 403, valid PNG/JPEG/WebP 201
//   (row with cabang_id NULL + file on disk byte-identical),
//   spoofed MIME 422, oversized 422, non-superadmin 403,
//   cabangId-sent 422 — every reject leaves zero new rows/files,
//   plus the logo_uploaded audit row.
//
// Idiom mirrors server/tests/photo.endpoint.php (fixtures,
// login-via-API + CSRF header, per-check reporting) and
// server/tests/login.lifecycle.php (findFreePort scratch port,
// PHP_BINARY self-boot). Docroot is the repo root so URLs keep
// the /server/api/... prefix used by the other HTTP suites.
//
// Reaping (Windows-safe): stopServer() is idempotent, runs in
// `finally` AND via register_shutdown_function, and on Windows
// also runs `taskkill /PID <pid> /T /F` so no orphan php.exe
// survives an interrupt.
//
// "No public URL" is asserted at the filesystem level (stored
// path is a bare filename; uploads dir resolves outside
// server/) — same rationale as photo.endpoint.php.
// ============================================================

$failures = 0;
$total = 0;
function check(string $label, bool $condition, string $detail = ''): void {
    global $failures, $total;
    $total++;
    if ($condition) {
        echo "  OK   $label\n";
    } else {
        $failures++;
        echo "  FAIL $label" . ($detail !== '' ? " — $detail" : '') . "\n";
    }
}

if (!extension_loaded('curl')) {
    fwrite(STDERR, "php-curl extension is required to run this test\n");
    exit(1);
}

$config = require __DIR__ . '/../config.php';
if (!is_array($config)) {
    fwrite(STDERR, "config.php tidak me-return array\n");
    exit(1);
}
try {
    $pdo = new PDO($config['dsn'], $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (Throwable $error) {
    // taste #56: blocker stated, nothing fabricated.
    fwrite(STDERR, 'BLOCKER: cannot reach test database: ' . $error->getMessage() . "\n");
    exit(1);
}

// --- fixtures: 1 branch (for the non-superadmin sessions), superadmin --
$branchT = 'cbg-LOGO-T';
$logoUserIds = ['usr-logo-super', 'usr-logo-adm', 'usr-logo-tr'];

function cleanupLogoFixtures(PDO $pdo, string $branchT, array $logoUserIds): void {
    // Fetch test-owned storage paths first so files can be unlinked.
    $in = "'" . implode("','", $logoUserIds) . "'";
    try {
        $paths = $pdo->query(
            "SELECT storage_path FROM photo_uploads WHERE owner_user_id IN ($in)"
        )->fetchAll(PDO::FETCH_COLUMN);
    } catch (Throwable $ignore) {
        $paths = [];
    }
    $uploadsDir = realpath(__DIR__ . '/../../private/uploads');
    foreach ((array) $paths as $name) {
        if (!is_string($name) || $name === '') continue;
        $candidate = ($uploadsDir ?: (__DIR__ . '/../../private/uploads')) . DIRECTORY_SEPARATOR . basename($name);
        if (is_file($candidate)) @unlink($candidate);
    }
    $pdo->exec("DELETE FROM photo_uploads WHERE owner_user_id IN ($in)");
    $pdo->exec("DELETE FROM audit_log WHERE actor_user_id IN ($in)");
    $pdo->exec("DELETE FROM users WHERE username IN ('test_logo_super', 'test_logo_adm', 'test_logo_tr')");
    $pdo->exec("DELETE FROM cabang WHERE id IN ('$branchT')");
}

function logoRowsCount(PDO $pdo, array $logoUserIds): int {
    $in = "'" . implode("','", $logoUserIds) . "'";
    return (int) $pdo->query(
        "SELECT COUNT(*) FROM photo_uploads WHERE owner_user_id IN ($in)"
    )->fetchColumn();
}

/** @return list<string> sorted bare filenames currently in private/uploads */
function uploadsDirListing(): array {
    $dir = __DIR__ . '/../../private/uploads';
    $files = glob($dir . '/*');
    $names = [];
    foreach ((array) $files as $path) {
        if (is_file($path)) $names[] = basename($path);
    }
    sort($names);
    return $names;
}

cleanupLogoFixtures($pdo, $branchT, $logoUserIds); // previous interrupted run

$pdo->prepare("INSERT INTO cabang (id, kode, nama, payload) VALUES (:id, :kode, :nama, '{}')")
    ->execute([':id' => $branchT, ':kode' => 'LGOT', ':nama' => 'Logo Test Branch']);

function seedLogoUser(PDO $pdo, string $id, string $username, string $role, ?string $cabangId): void {
    $pdo->prepare(
        'INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, active, must_change_password)
         VALUES (:id, :u, :d, :p, :r, :c, 1, 0)'
    )->execute([
        ':id' => $id, ':u' => $username, ':d' => $username,
        ':p' => password_hash('Test1234!', PASSWORD_DEFAULT),
        ':r' => $role, ':c' => $cabangId,
    ]);
}

seedLogoUser($pdo, 'usr-logo-super', 'test_logo_super', 'superadmin', null);
seedLogoUser($pdo, 'usr-logo-adm', 'test_logo_adm', 'admin_cabang', $branchT);
seedLogoUser($pdo, 'usr-logo-tr', 'test_logo_tr', 'trainer', $branchT);

// --- self-booting dev server on a scratch port -------------------------
function findLogoTestPort(): int {
    $socket = @stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
    if ($socket === false) {
        fwrite(STDERR, "BLOCKER: cannot allocate a free port: $errstr\n");
        exit(1);
    }
    $name = stream_socket_get_name($socket, false);
    fclose($socket);
    $parts = explode(':', (string) $name);
    return (int) end($parts);
}

$docroot = realpath(__DIR__ . '/../..');
if ($docroot === false) {
    fwrite(STDERR, "BLOCKER: cannot resolve repo-root docroot\n");
    exit(1);
}
$port = findLogoTestPort();
$base = "http://127.0.0.1:$port";
$serverStdout = tempnam(sys_get_temp_dir(), 'lgo_stdout_');
$serverStderr = tempnam(sys_get_temp_dir(), 'lgo_stderr_');
$server = proc_open(
    sprintf('%s -S 127.0.0.1:%d -t %s', escapeshellarg(PHP_BINARY), $port, escapeshellarg($docroot)),
    [1 => ['file', $serverStdout, 'w'], 2 => ['file', $serverStderr, 'w']],
    $pipes
);
if (!is_resource($server)) {
    fwrite(STDERR, "BLOCKER: proc_open for php -S failed\n");
    exit(1);
}
$serverPid = proc_get_status($server)['pid'] ?? 0;

function stopLogoServer(): void {
    global $server, $serverPid;
    if (isset($server) && is_resource($server)) {
        // Windows-safe reaping: kill the whole process tree so no
        // orphan php.exe survives an interrupt (proc_terminate alone
        // can leave the child behind on Win32).
        if (PHP_OS_FAMILY === 'Windows' && (int) $serverPid > 0) {
            @exec('taskkill /PID ' . (int) $serverPid . ' /T /F 2>NUL');
        }
        @proc_terminate($server);
        @proc_close($server);
    }
    $server = null;
}
register_shutdown_function('stopLogoServer');

$serverReady = false;
for ($i = 0; $i < 25; $i++) {
    usleep(200000);
    $conn = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.2);
    if ($conn) {
        fclose($conn);
        $serverReady = true;
        break;
    }
}
if (!$serverReady) {
    fwrite(STDERR, "BLOCKER: dev server on port $port never became reachable after 5s.\n");
    fwrite(STDERR, "--- dev server stderr (tail) ---\n" . implode('', array_slice(file($serverStderr) ?: [], -20)) . "\n");
    stopLogoServer();
    exit(1);
}

// --- HTTP helpers -------------------------------------------------------
function reqJson(string $method, string $url, ?array $body = null, ?string $cookie = null, ?string $csrfToken = null): array {
    $ch = curl_init($url);
    $headers = ['Content-Type: application/json'];
    if ($csrfToken !== null) $headers[] = 'X-CSRF-Token: ' . $csrfToken;
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 15,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    if ($cookie) {
        curl_setopt($ch, CURLOPT_COOKIEJAR, $cookie);
        curl_setopt($ch, CURLOPT_COOKIEFILE, $cookie);
    }
    $raw = curl_exec($ch);
    if ($raw === false) {
        fwrite(STDERR, "BLOCKER: request $method $url failed: " . curl_error($ch) . "\n");
        curl_close($ch);
        stopLogoServer();
        exit(1);
    }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$status, json_decode((string) $raw, true)];
}

/**
 * Multipart upload to logo-upload.php (the endpoint's primary transport).
 * $extraFields adds sibling POST fields (e.g. ['cabangId' => ...] for the
 * 422 leg); $query appends a raw query string (e.g. '?cabangId=...').
 * Returns [status, decodedJsonBody].
 */
function uploadLogo(string $base, string $bytes, string $clientFilename, string $clientMime, ?string $cookie, ?string $csrfToken, array $extraFields = [], string $query = ''): array {
    $tmpFile = tempnam(sys_get_temp_dir(), 'lgo_up_');
    file_put_contents($tmpFile, $bytes);
    $ch = curl_init("$base/server/api/logo-upload.php$query");
    $headers = [];
    if ($csrfToken !== null) $headers[] = 'X-CSRF-Token: ' . $csrfToken;
    $fields = array_merge(['logo' => new CURLFile($tmpFile, $clientMime, $clientFilename)], $extraFields);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => $fields,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 15,
    ]);
    if ($cookie) {
        curl_setopt($ch, CURLOPT_COOKIEJAR, $cookie);
        curl_setopt($ch, CURLOPT_COOKIEFILE, $cookie);
    }
    $raw = curl_exec($ch);
    if ($raw === false) {
        fwrite(STDERR, 'BLOCKER: logo upload request failed: ' . curl_error($ch) . "\n");
        curl_close($ch);
        @unlink($tmpFile);
        stopLogoServer();
        exit(1);
    }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    @unlink($tmpFile);
    return [$status, json_decode((string) $raw, true)];
}

function loginAsLogo(string $base, string $username, string $cookieFile): void {
    [$status, $body] = reqJson('POST', "$base/server/api/auth/login.php", ['username' => $username, 'password' => 'Test1234!'], $cookieFile);
    if ($status !== 200) {
        fwrite(STDERR, "BLOCKER: login as $username failed (status=$status body=" . json_encode($body) . ")\n");
        stopLogoServer();
        exit(1);
    }
}

function csrfForLogo(string $base, string $cookieFile, string $label): string {
    [$status, $body] = reqJson('GET', "$base/server/api/auth/csrf.php", null, $cookieFile);
    if ($status !== 200 || !isset($body['csrfToken']) || !is_string($body['csrfToken'])) {
        fwrite(STDERR, "BLOCKER: CSRF fetch for $label failed (status=$status body=" . json_encode($body) . ")\n");
        stopLogoServer();
        exit(1);
    }
    return $body['csrfToken'];
}

// Deterministic 1x1 fixtures (no GD dependency):
// PNG + WebP are strict-base64-valid; JPEG needs loose decoding
// (its canonical string is mod4=3) exactly like photo.endpoint.php's
// non-strict base64_decode usage.
$validPng = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
$validJpg = base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QATRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QATREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN2d3h8oDHhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooA//2Q==');
$validWebp = base64_decode('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA');
if (!is_string($validPng) || $validPng === '' || !is_string($validJpg) || $validJpg === '' || !is_string($validWebp) || $validWebp === '') {
    fwrite(STDERR, "BLOCKER: logo fixtures failed to decode\n");
    stopLogoServer();
    exit(1);
}

$cookieSuper = tempnam(sys_get_temp_dir(), 'lgo_s_');
$cookieAdmin = tempnam(sys_get_temp_dir(), 'lgo_a_');
$cookieTrainer = tempnam(sys_get_temp_dir(), 'lgo_t_');

try {
    loginAsLogo($base, 'test_logo_super', $cookieSuper);
    loginAsLogo($base, 'test_logo_adm', $cookieAdmin);
    loginAsLogo($base, 'test_logo_tr', $cookieTrainer);
    $csrfSuper = csrfForLogo($base, $cookieSuper, 'super');
    $csrfAdmin = csrfForLogo($base, $cookieAdmin, 'admin');
    $csrfTrainer = csrfForLogo($base, $cookieTrainer, 'trainer');

    // --- anonymous 401 --------------------------------------------------
    echo "\n--- anonymous ---\n";
    [$status] = uploadLogo($base, $validPng, 'anon.png', 'image/png', null, null);
    check('anonymous upload -> 401', $status === 401, "got $status");

    // --- CSRF gate (auth order: 401 auth -> 403 CSRF -> 403 role -> 422) --
    echo "\n--- csrf ---\n";
    [$status] = uploadLogo($base, $validPng, 'nocsrf.png', 'image/png', $cookieSuper, null);
    check('authenticated upload without CSRF token -> 403', $status === 403, "got $status");

    // --- valid uploads: PNG + JPEG + WebP (superadmin, 201 each) ---------
    echo "\n--- valid uploads ---\n";
    $logoIds = [];
    $validCases = [
        ['png', $validPng, 'logo.png', 'image/png', 'image/png'],
        ['jpg', $validJpg, 'logo.jpg', 'image/jpeg', 'image/jpeg'],
        ['webp', $validWebp, 'logo.webp', 'image/webp', 'image/webp'],
    ];
    foreach ($validCases as [$kind, $bytes, $filename, $clientMime, $expectMime]) {
        [$status, $body] = uploadLogo($base, $bytes, $filename, $clientMime, $cookieSuper, $csrfSuper);
        check("superadmin upload valid " . strtoupper($kind) . " -> 201", $status === 201, "got $status body=" . json_encode($body));
        $logoId = (is_array($body) && isset($body['id']) && is_string($body['id'])) ? $body['id'] : null;
        check("upload $kind response carries logo id", $logoId !== null && $logoId !== '', json_encode($body));
        if ($logoId === null) {
            fwrite(STDERR, "BLOCKER: no logo id for $kind to continue checks\n");
            exit(1);
        }
        $logoIds[$kind] = $logoId;

        $row = $pdo->prepare('SELECT cabang_id, owner_user_id, storage_path, mime_type, byte_size FROM photo_uploads WHERE id = :id');
        $row->execute([':id' => $logoId]);
        $logoRow = $row->fetch();
        check("photo_uploads row recorded for $kind", $logoRow !== false);
        check("row cabang_id is NULL (global logo) for $kind", $logoRow !== false && $logoRow['cabang_id'] === null, json_encode($logoRow));
        check("row owner is the superadmin for $kind", $logoRow !== false && $logoRow['owner_user_id'] === 'usr-logo-super', json_encode($logoRow));
        check("row mime_type is sniffed $expectMime for $kind", $logoRow !== false && $logoRow['mime_type'] === $expectMime, json_encode($logoRow));
        check("row byte_size matches upload for $kind", $logoRow !== false && (int) $logoRow['byte_size'] === strlen($bytes), json_encode($logoRow));
        check(
            "storage_path is a bare filename (no public-URL traversal) for $kind",
            $logoRow !== false && is_string($logoRow['storage_path']) && $logoRow['storage_path'] !== ''
                && strpos($logoRow['storage_path'], '/') === false
                && strpos($logoRow['storage_path'], '\\') === false
                && strpos($logoRow['storage_path'], '..') === false,
            json_encode($logoRow['storage_path'] ?? null)
        );
        if ($logoRow !== false && is_string($logoRow['storage_path'])) {
            $diskPath = (realpath(__DIR__ . '/../../private/uploads') ?: (__DIR__ . '/../../private/uploads')) . DIRECTORY_SEPARATOR . basename($logoRow['storage_path']);
            check("private/uploads file exists for $kind", is_file($diskPath), $diskPath);
            if (is_file($diskPath)) {
                $diskBytes = file_get_contents($diskPath);
                check("disk bytes identical to upload (sha256) for $kind", $diskBytes !== false && hash('sha256', $diskBytes) === hash('sha256', $bytes));
            }
        }
    }

    // --- rejects leave zero new rows and zero new files ------------------
    // Baseline is captured AFTER the valid uploads above, so every check
    // below proves its own reject wrote nothing.
    echo "\n--- rejects ---\n";
    $rowsBefore = logoRowsCount($pdo, $logoUserIds);
    $filesBefore = uploadsDirListing();

    $spoofBytes = "<?php echo 'pwn'; // not an image";
    [$status, $body] = uploadLogo($base, $spoofBytes, 'spoof.png', 'image/png', $cookieSuper, $csrfSuper);
    check('spoofed MIME (text bytes as image/png) -> 422', $status === 422, "got $status body=" . json_encode($body));
    check(
        'spoofed error pins the content-sniff path',
        is_array($body) && isset($body['error']) && stripos((string) $body['error'], 'Format') !== false,
        json_encode($body)
    );

    $oversized = $validPng . str_repeat("\0", (2 * 1024 * 1024 + 1) - strlen($validPng));
    [$status, $body] = uploadLogo($base, $oversized, 'big.png', 'image/png', $cookieSuper, $csrfSuper);
    check('oversized (>2 MB) upload -> 422', $status === 422, "got $status");
    check(
        'oversized error pins the 2 MB cap path',
        is_array($body) && isset($body['error']) && stripos((string) $body['error'], '2 MB') !== false,
        json_encode(is_array($body) ? array_keys($body) : $body)
    );

    [$status, $body] = uploadLogo($base, $validPng, 'admin.png', 'image/png', $cookieAdmin, $csrfAdmin);
    check('admin_cabang upload -> 403 (superadmin-only)', $status === 403, "got $status body=" . json_encode($body));

    [$status, $body] = uploadLogo($base, $validPng, 'trainer.png', 'image/png', $cookieTrainer, $csrfTrainer);
    check('trainer upload -> 403 (superadmin-only)', $status === 403, "got $status body=" . json_encode($body));

    // Role runs before validation: a non-superadmin that also sends a
    // cabangId still sees 403, never 422.
    [$status] = uploadLogo($base, $validPng, 'admin-cabang.png', 'image/png', $cookieAdmin, $csrfAdmin, ['cabangId' => $branchT]);
    check('admin_cabang + cabangId -> 403 (role wins over 422)', $status === 403, "got $status");

    [$status, $body] = uploadLogo($base, $validPng, 'cabang.png', 'image/png', $cookieSuper, $csrfSuper, ['cabangId' => $branchT]);
    check('superadmin + cabangId in POST -> 422', $status === 422, "got $status body=" . json_encode($body));
    check(
        'cabangId error pins the no-branch rule',
        is_array($body) && isset($body['error']) && stripos((string) $body['error'], 'cabangId') !== false,
        json_encode($body)
    );

    [$status] = uploadLogo($base, $validPng, 'cabang-q.png', 'image/png', $cookieSuper, $csrfSuper, [], '?cabangId=' . urlencode($branchT));
    check('superadmin + cabangId in query -> 422', $status === 422, "got $status");

    check(
        'rejects wrote zero photo_uploads rows',
        logoRowsCount($pdo, $logoUserIds) === $rowsBefore,
        'before=' . $rowsBefore . ' after=' . logoRowsCount($pdo, $logoUserIds)
    );
    check('rejects wrote zero files to private/uploads', uploadsDirListing() === $filesBefore);

    // --- audit row ------------------------------------------------------
    echo "\n--- audit ---\n";
    $firstLogoId = $logoIds['png'];
    $audit = $pdo->prepare("SELECT actor_user_id, actor_role, target_type, metadata FROM audit_log WHERE event_type = 'logo_uploaded' AND target_id = :tid ORDER BY id DESC LIMIT 1");
    $audit->execute([':tid' => $firstLogoId]);
    $auditRow = $audit->fetch();
    check('logo_uploaded audit row present', $auditRow !== false);
    check('audit actor is the uploading superadmin', $auditRow !== false && $auditRow['actor_user_id'] === 'usr-logo-super' && $auditRow['actor_role'] === 'superadmin', json_encode($auditRow));
    check('audit target_type is photo_uploads', $auditRow !== false && $auditRow['target_type'] === 'photo_uploads', json_encode($auditRow));

    // --- uploads dir lives outside server/ (never a public URL) ---------
    echo "\n--- storage placement ---\n";
    $uploadsReal = realpath(__DIR__ . '/../../private/uploads');
    $serverReal = realpath(__DIR__ . '/..');
    check(
        'photoStorageDir resolves outside server/',
        is_string($uploadsReal) && is_string($serverReal) && !str_starts_with($uploadsReal, $serverReal . DIRECTORY_SEPARATOR),
        "uploads=$uploadsReal server=$serverReal"
    );
} finally {
    // Destructive cleanup LAST (taste #55): logo rows + files, audit
    // rows, users, branch — then reap the dev server and temp jars.
    try {
        cleanupLogoFixtures($pdo, $branchT, $logoUserIds);
    } catch (Throwable $error) {
        fwrite(STDERR, 'cleanup warning: ' . $error->getMessage() . "\n");
    }
    stopLogoServer();
    foreach ([$cookieSuper, $cookieAdmin, $cookieTrainer] as $jar) {
        if (is_string($jar)) @unlink($jar);
    }
    if (is_string($serverStdout)) @unlink($serverStdout);
    if (is_string($serverStderr)) @unlink($serverStderr);
}

echo "\n$total checks, $failures failed\n";
exit($failures > 0 ? 1 : 0);
