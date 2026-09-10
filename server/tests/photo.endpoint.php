<?php
declare(strict_types=1);

// ============================================================
// RH.D.4 — Photo endpoint verification suite (F-RH5, M5.2 VERIFY)
// Proves the full M5.2 VERIFY matrix in one script:
//   anonymous 401, cross-branch 403, spoofed MIME 422,
//   oversized 422, traversal 422/404, valid upload+download
//   roundtrip byte-identical, audit row present.
//
// Idiom mirrors server/tests/endpoint.protection.php (fixtures,
// login-via-API + CSRF header, per-check reporting) and
// server/tests/login.lifecycle.php (findFreePort scratch port,
// PHP_BINARY self-boot). Docroot is the repo root so URLs keep
// the /server/api/... prefix used by the other HTTP suites.
//
// Reaping (Windows-safe): stopServer() is idempotent, runs in
// `finally` AND via register_shutdown_function, and on Windows
// also runs `taskkill /PID <pid> /T /F` so no orphan php.exe
// survives an interrupt. The VERIFY step checks the php.exe
// count returns to baseline after the run.
//
// "No public URL" is asserted at the filesystem level (stored
// path is a bare filename; uploads dir resolves outside
// server/) — php -S serves static files from the docroot, so
// probing /private/uploads/... over HTTP would indict the test
// harness, not the app (production serves deploy/ as docroot
// with private/ as an outside sibling per D-RH5).
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

// --- fixtures: 2 branches, admin per branch, trainer in A, superadmin --
$branchA = 'cbg-PHT-A';
$branchB = 'cbg-PHT-B';

function cleanupPhotoFixtures(PDO $pdo, string $branchA, string $branchB): void {
    // Fetch test-owned storage paths first so files can be unlinked.
    try {
        $paths = $pdo->query(
            "SELECT storage_path FROM photo_uploads WHERE cabang_id IN ('$branchA', '$branchB')"
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
    $pdo->exec("DELETE FROM photo_uploads WHERE cabang_id IN ('$branchA', '$branchB')");
    $pdo->exec("DELETE FROM audit_log WHERE cabang_id IN ('$branchA', '$branchB') OR actor_user_id IN ('usr-pht-admA', 'usr-pht-admB', 'usr-pht-trA', 'usr-pht-super')");
    $pdo->exec("DELETE FROM users WHERE username IN ('test_photo_a', 'test_photo_b', 'test_photo_tr', 'test_photo_super')");
    $pdo->exec("DELETE FROM cabang WHERE id IN ('$branchA', '$branchB')");
}

function photoUploadsCount(PDO $pdo, string $branchA, string $branchB): int {
    return (int) $pdo->query(
        "SELECT COUNT(*) FROM photo_uploads WHERE cabang_id IN ('$branchA', '$branchB')"
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

cleanupPhotoFixtures($pdo, $branchA, $branchB); // previous interrupted run

$pdo->prepare("INSERT INTO cabang (id, kode, nama, payload) VALUES (:id, :kode, :nama, '{}')")
    ->execute([':id' => $branchA, ':kode' => 'PHTA', ':nama' => 'Photo Test Branch A']);
$pdo->prepare("INSERT INTO cabang (id, kode, nama, payload) VALUES (:id, :kode, :nama, '{}')")
    ->execute([':id' => $branchB, ':kode' => 'PHTB', ':nama' => 'Photo Test Branch B']);

function seedPhotoUser(PDO $pdo, string $id, string $username, string $role, ?string $cabangId): void {
    $pdo->prepare(
        'INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, active, must_change_password)
         VALUES (:id, :u, :d, :p, :r, :c, 1, 0)'
    )->execute([
        ':id' => $id, ':u' => $username, ':d' => $username,
        ':p' => password_hash('Test1234!', PASSWORD_DEFAULT),
        ':r' => $role, ':c' => $cabangId,
    ]);
}

seedPhotoUser($pdo, 'usr-pht-admA', 'test_photo_a', 'admin_cabang', $branchA);
seedPhotoUser($pdo, 'usr-pht-admB', 'test_photo_b', 'admin_cabang', $branchB);
seedPhotoUser($pdo, 'usr-pht-trA', 'test_photo_tr', 'trainer', $branchA);
seedPhotoUser($pdo, 'usr-pht-super', 'test_photo_super', 'superadmin', null);

// --- self-booting dev server on a scratch port -------------------------
function findPhotoTestPort(): int {
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
$port = findPhotoTestPort();
$base = "http://127.0.0.1:$port";
$serverStdout = tempnam(sys_get_temp_dir(), 'pht_stdout_');
$serverStderr = tempnam(sys_get_temp_dir(), 'pht_stderr_');
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

function stopPhotoServer(): void {
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
register_shutdown_function('stopPhotoServer');

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
    stopPhotoServer();
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
        stopPhotoServer();
        exit(1);
    }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$status, json_decode((string) $raw, true)];
}

/**
 * Multipart upload to photo-upload.php (the endpoint's primary transport).
 * Returns [status, decodedJsonBody].
 */
function uploadPhoto(string $base, string $bytes, string $clientFilename, string $clientMime, ?string $cookie, ?string $csrfToken): array {
    $tmpFile = tempnam(sys_get_temp_dir(), 'pht_up_');
    file_put_contents($tmpFile, $bytes);
    $ch = curl_init("$base/server/api/photo-upload.php");
    $headers = [];
    if ($csrfToken !== null) $headers[] = 'X-CSRF-Token: ' . $csrfToken;
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => ['photo' => new CURLFile($tmpFile, $clientMime, $clientFilename)],
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 15,
    ]);
    if ($cookie) {
        curl_setopt($ch, CURLOPT_COOKIEJAR, $cookie);
        curl_setopt($ch, CURLOPT_COOKIEFILE, $cookie);
    }
    $raw = curl_exec($ch);
    if ($raw === false) {
        fwrite(STDERR, 'BLOCKER: photo upload request failed: ' . curl_error($ch) . "\n");
        curl_close($ch);
        @unlink($tmpFile);
        stopPhotoServer();
        exit(1);
    }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    @unlink($tmpFile);
    return [$status, json_decode((string) $raw, true)];
}

/**
 * Raw download from photo-download.php.
 * Returns [status, contentType, rawBytes].
 */
function downloadPhoto(string $base, string $id, ?string $cookie): array {
    $ch = curl_init($base . '/server/api/photo-download.php?id=' . urlencode($id));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 15,
    ]);
    if ($cookie) {
        curl_setopt($ch, CURLOPT_COOKIEJAR, $cookie);
        curl_setopt($ch, CURLOPT_COOKIEFILE, $cookie);
    }
    $response = curl_exec($ch);
    if ($response === false) {
        fwrite(STDERR, 'BLOCKER: photo download request failed: ' . curl_error($ch) . "\n");
        curl_close($ch);
        stopPhotoServer();
        exit(1);
    }
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $contentType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    return [$status, $contentType, substr((string) $response, $headerSize)];
}

function loginAsPhoto(string $base, string $username, string $cookieFile): void {
    [$status, $body] = reqJson('POST', "$base/server/api/auth/login.php", ['username' => $username, 'password' => 'Test1234!'], $cookieFile);
    if ($status !== 200) {
        fwrite(STDERR, "BLOCKER: login as $username failed (status=$status body=" . json_encode($body) . ")\n");
        stopPhotoServer();
        exit(1);
    }
}

function csrfForPhoto(string $base, string $cookieFile, string $label): string {
    [$status, $body] = reqJson('GET', "$base/server/api/auth/csrf.php", null, $cookieFile);
    if ($status !== 200 || !isset($body['csrfToken']) || !is_string($body['csrfToken'])) {
        fwrite(STDERR, "BLOCKER: CSRF fetch for $label failed (status=$status body=" . json_encode($body) . ")\n");
        stopPhotoServer();
        exit(1);
    }
    return $body['csrfToken'];
}

// Deterministic 1x1 transparent PNG (no GD dependency for the fixture).
$validPng = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
if (!is_string($validPng) || $validPng === '') {
    fwrite(STDERR, "BLOCKER: valid PNG fixture failed to decode\n");
    stopPhotoServer();
    exit(1);
}

$cookieAdminA = tempnam(sys_get_temp_dir(), 'pht_a_');
$cookieAdminB = tempnam(sys_get_temp_dir(), 'pht_b_');
$cookieTrainerA = tempnam(sys_get_temp_dir(), 'pht_t_');

try {
    loginAsPhoto($base, 'test_photo_a', $cookieAdminA);
    loginAsPhoto($base, 'test_photo_b', $cookieAdminB);
    loginAsPhoto($base, 'test_photo_tr', $cookieTrainerA);
    $csrfAdminA = csrfForPhoto($base, $cookieAdminA, 'admin_a');
    $csrfAdminB = csrfForPhoto($base, $cookieAdminB, 'admin_b');

    // --- anonymous 401 --------------------------------------------------
    echo "\n--- anonymous ---\n";
    [$status] = uploadPhoto($base, $validPng, 'anon.png', 'image/png', null, null);
    check('anonymous upload -> 401', $status === 401, "got $status");

    [$status] = downloadPhoto($base, 'pht-does-not-exist', null);
    check('anonymous download -> 401', $status === 401, "got $status");

    // --- CSRF gate (auth order: 401 auth -> 403 CSRF -> 422) ------------
    echo "\n--- csrf ---\n";
    [$status] = uploadPhoto($base, $validPng, 'nocsrf.png', 'image/png', $cookieAdminA, null);
    check('authenticated upload without CSRF token -> 403', $status === 403, "got $status");

    // --- valid upload + download roundtrip (admin_cabang, own branch) ---
    echo "\n--- valid roundtrip ---\n";
    [$status, $body] = uploadPhoto($base, $validPng, 'valid.png', 'image/png', $cookieAdminA, $csrfAdminA);
    check('admin A upload valid PNG -> 201', $status === 201, "got $status body=" . json_encode($body));
    $photoId = (is_array($body) && isset($body['id']) && is_string($body['id'])) ? $body['id'] : null;
    check('upload response carries photo id', $photoId !== null && $photoId !== '', json_encode($body));

    if ($photoId === null) {
        fwrite(STDERR, "BLOCKER: no photo id to continue roundtrip checks\n");
        exit(1);
    }

    $row = $pdo->prepare('SELECT cabang_id, owner_user_id, storage_path, mime_type, byte_size FROM photo_uploads WHERE id = :id');
    $row->execute([':id' => $photoId]);
    $photoRow = $row->fetch();
    check('photo_uploads row recorded', $photoRow !== false);
    check('row cabang_id is admin A branch (session-derived)', $photoRow !== false && $photoRow['cabang_id'] === $branchA, json_encode($photoRow));
    check('row mime_type is sniffed image/png', $photoRow !== false && $photoRow['mime_type'] === 'image/png', json_encode($photoRow));
    check('row byte_size matches upload', $photoRow !== false && (int) $photoRow['byte_size'] === strlen($validPng), json_encode($photoRow));
    check(
        'storage_path is a bare filename (no public-URL traversal)',
        $photoRow !== false && is_string($photoRow['storage_path']) && $photoRow['storage_path'] !== ''
            && strpos($photoRow['storage_path'], '/') === false
            && strpos($photoRow['storage_path'], '\\') === false
            && strpos($photoRow['storage_path'], '..') === false,
        json_encode($photoRow['storage_path'] ?? null)
    );

    [$status, $contentType, $dlBytes] = downloadPhoto($base, $photoId, $cookieAdminA);
    check('admin A download own-branch photo -> 200', $status === 200, "got $status");
    check('download Content-Type is stored mime image/png', stripos($contentType, 'image/png') !== false, $contentType);
    check('download bytes identical to upload (sha256)', hash('sha256', $dlBytes) === hash('sha256', $validPng), 'len=' . strlen($dlBytes) . ' vs ' . strlen($validPng));

    // Trainer in the same branch shares branch-scoped evidence (D-RH9).
    [$status, , $trBytes] = downloadPhoto($base, $photoId, $cookieTrainerA);
    check('trainer same-branch download -> 200', $status === 200, "got $status");
    check('trainer download bytes identical', hash('sha256', $trBytes) === hash('sha256', $validPng));

    // --- cross-branch 403 (zero bytes to the outsider) ------------------
    echo "\n--- cross-branch ---\n";
    [$status, , $crossBytes] = downloadPhoto($base, $photoId, $cookieAdminB);
    check('admin B (other branch) download -> 403', $status === 403, "got $status");
    check('cross-branch response carries no image bytes', strpos($crossBytes, "\x89PNG") === false, 'len=' . strlen($crossBytes));

    // --- unknown id 404 (does not leak existence) -----------------------
    echo "\n--- unknown id ---\n";
    [$status] = downloadPhoto($base, 'pht-does-not-exist', $cookieAdminA);
    check('download unknown id -> 404', $status === 404, "got $status");

    // --- traversal: must never resolve outside the uploads dir ----------
    echo "\n--- traversal ---\n";
    [$status] = downloadPhoto($base, '../../server/config.php', $cookieAdminA);
    check('download traversal id -> 422/404 (never 200)', $status === 422 || $status === 404, "got $status");
    [$status] = downloadPhoto($base, '..\\..\\server\\config.php', $cookieAdminA);
    check('download backslash traversal id -> 422/404 (never 200)', $status === 422 || $status === 404, "got $status");

    // --- rejects leave zero rows and zero files -------------------------
    echo "\n--- spoofed + oversized rejects ---\n";
    $rowsBefore = photoUploadsCount($pdo, $branchA, $branchB);
    $filesBefore = uploadsDirListing();

    $spoofBytes = "<?php echo 'pwn'; // not an image";
    [$status, $body] = uploadPhoto($base, $spoofBytes, 'spoof.png', 'image/png', $cookieAdminA, $csrfAdminA);
    check('spoofed MIME (text bytes as image/png) -> 422', $status === 422, "got $status body=" . json_encode($body));
    check(
        'spoofed error pins the content-sniff path',
        is_array($body) && isset($body['error']) && stripos((string) $body['error'], 'Format') !== false,
        json_encode($body)
    );

    $oversized = $validPng . str_repeat("\0", (2 * 1024 * 1024 + 1) - strlen($validPng));
    [$status, $body] = uploadPhoto($base, $oversized, 'big.png', 'image/png', $cookieAdminA, $csrfAdminA);
    check('oversized (>2 MB) upload -> 422', $status === 422, "got $status");
    check(
        'oversized error pins the 2 MB cap path',
        is_array($body) && isset($body['error']) && stripos((string) $body['error'], '2 MB') !== false,
        json_encode(is_array($body) ? array_keys($body) : $body)
    );

    check(
        'rejects wrote zero photo_uploads rows',
        photoUploadsCount($pdo, $branchA, $branchB) === $rowsBefore,
        'before=' . $rowsBefore . ' after=' . photoUploadsCount($pdo, $branchA, $branchB)
    );
    check('rejects wrote zero files to private/uploads', uploadsDirListing() === $filesBefore);

    // --- audit row ------------------------------------------------------
    echo "\n--- audit ---\n";
    $audit = $pdo->prepare("SELECT actor_user_id, actor_role, cabang_id, metadata FROM audit_log WHERE event_type = 'photo_uploaded' AND target_id = :tid ORDER BY id DESC LIMIT 1");
    $audit->execute([':tid' => $photoId]);
    $auditRow = $audit->fetch();
    check('photo_uploaded audit row present', $auditRow !== false);
    check('audit actor is the uploading admin', $auditRow !== false && $auditRow['actor_user_id'] === 'usr-pht-admA' && $auditRow['actor_role'] === 'admin_cabang', json_encode($auditRow));
    check('audit cabang_id matches photo branch', $auditRow !== false && $auditRow['cabang_id'] === $branchA, json_encode($auditRow));

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
    // Destructive cleanup LAST (taste #55): photo rows + files, audit
    // rows, users, branches — then reap the dev server and temp jars.
    try {
        cleanupPhotoFixtures($pdo, $branchA, $branchB);
    } catch (Throwable $error) {
        fwrite(STDERR, 'cleanup warning: ' . $error->getMessage() . "\n");
    }
    stopPhotoServer();
    foreach ([$cookieAdminA, $cookieAdminB, $cookieTrainerA] as $jar) {
        if (is_string($jar)) @unlink($jar);
    }
    if (is_string($serverStdout)) @unlink($serverStdout);
    if (is_string($serverStderr)) @unlink($serverStderr);
}

echo "\n$total checks, $failures failed\n";
exit($failures > 0 ? 1 : 0);
