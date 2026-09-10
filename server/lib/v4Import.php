<?php
declare(strict_types=1);

/**
 * RH.F.1 — v4 import pure functions (F-RH7, R-RH5, D-RH2/D-RH3/D-RH10).
 *
 * Pure by contract: no database, no session, no HTTP, no audit — only
 * arrays in, arrays out — so the HTTP suite (server/tests/v4.import.php)
 * and any future CLI can share the exact same validation. The endpoint
 * (server/api/v4-import.php) owns auth/CSRF/transaction/audit; this file
 * owns shape + references + derivation + report.
 *
 * Concrete picks (taste #17 — one pinned implementation):
 *   - Shape precedence: `data` (client exportBackup() {version:2,
 *     exportedAt, data:{…}}) wins when present; else `entities` (server
 *     snapshot {entities:{…}}); else a bare top-level map carrying known
 *     entity keys is accepted as a flat shape. Missing entities normalize
 *     to [] (tolerant), never to an abort — aborts come from reference
 *     errors, not from absent entity keys.
 *   - Settings: the v4 client stores settings as a single id-less object
 *     while the server snapshot stores an array of id'd rows. An object
 *     WITH an id wraps to one row; an id-less object synthesizes exactly
 *     one row with id 'settings-global' (deterministic, so a re-import
 *     409s on conflict instead of duplicating). Arrays pass through.
 *   - Order is fixed: shapeNormalize → deriveMissingCabangIds →
 *     validateReferences → buildReport. Derivation runs before validation
 *     so a derived cabangId satisfies the ownership check by construction.
 *   - Hard edges (abort the import): sekolah.cabangId ∈ cabang set;
 *     trainer.sekolahIds[] ⊆ sekolah set AND sekolah.trainerIds[] ⊆
 *     trainer set (both assignment directions, mirroring
 *     constants.js assertReferences); siswa.sekolahId ∈ sekolah set;
 *     absensi.sekolahId ∈ sekolah set; absensi.trainerId ∈ trainer set;
 *     absensi.siswaList[].siswaId ∈ siswa set for present values only
 *     (null/'' tolerated); honorPayments.trainerId ∈ trainer set;
 *     sppPayments.siswaId ∈ siswa set; invoices.sekolahId ∈ sekolah set.
 *     Optional absensi fields (asistenId, dokumentasi, …) are never
 *     inspected. Ledger/table edges beyond §11's prose list are hard by
 *     the same reference-preserving rule (R-RH5) — they are hard in
 *     validation/entities.php and assertReferences too.
 *   - cabangId derivation (recorded in the report): siswa/absensi/
 *     invoices ← referenced sekolah's cabangId; sppPayments ←
 *     siswa → sekolah chain; honorPayments ← trainer's cabangId else the
 *     trainer's first resolvable sekolah's cabangId; trainer ← first
 *     resolvable sekolahIds entry's cabangId. sekolah.cabangId cannot be
 *     derived (it IS the branch link) and cabang rows carry no cabangId.
 *   - Duplicate ids WITHIN one fixture entity are conflicts (409-class),
 *     not reference errors (422-class); duplicates AGAINST the live DB are
 *     the endpoint's job (it has the PDO handle) and share the same shape.
 */

function v4ImportEntityKeys(): array {
    return ['cabang', 'sekolah', 'trainer', 'siswa', 'absensi', 'honorPayments', 'sppPayments', 'invoices', 'settings'];
}

function v4ImportTableFor(string $entity): string {
    return match ($entity) {
        'cabang' => 'cabang',
        'sekolah' => 'sekolah',
        'trainer' => 'trainer',
        'siswa' => 'siswa',
        'absensi' => 'absensi',
        'sppPayments' => 'spp_payments',
        'honorPayments' => 'honor_payments',
        'invoices' => 'invoices',
        'settings' => 'settings',
        default => throw new InvalidArgumentException("v4Import: unknown entity '{$entity}'"),
    };
}

function v4ImportIsList(array $value): bool {
    if ($value === []) return true;
    return array_keys($value) === range(0, count($value) - 1);
}

/**
 * Normalize any accepted import document to ['entities', 'shape', 'warnings'].
 *
 * Entities is a full 9-key map of record lists. Never throws on shape
 * drift — unknown/missing parts become empty lists with a warning, so the
 * endpoint can still return a per-entity report (422) instead of a crash.
 */
function shapeNormalize(array $raw): array {
    $keys = v4ImportEntityKeys();
    $warnings = [];
    $shape = 'flat';
    $source = null;

    if (isset($raw['data']) && is_array($raw['data'])) {
        $source = $raw['data'];
        $shape = 'v4';
    } elseif (isset($raw['entities']) && is_array($raw['entities'])) {
        $source = $raw['entities'];
        $shape = 'snapshot';
    } else {
        $hasKnownKey = false;
        foreach ($keys as $key) {
            if (array_key_exists($key, $raw)) { $hasKnownKey = true; break; }
        }
        if ($hasKnownKey) {
            $source = $raw;
            $shape = 'flat';
        } else {
            $source = [];
            $shape = 'unknown';
            $warnings[] = 'Format impor tidak dikenali: butuh {version:2,data:{…}} atau {entities:{…}}';
        }
    }

    $entities = [];
    foreach ($keys as $key) {
        $value = $source[$key] ?? null;
        if ($value === null) {
            $entities[$key] = [];
            continue;
        }
        if ($key === 'settings') {
            $entities[$key] = v4NormalizeSettings($value, $warnings);
            continue;
        }
        if (!is_array($value) || !v4ImportIsList($value)) {
            $warnings[] = "data.{$key} harus berupa array — diabaikan";
            $entities[$key] = [];
            continue;
        }
        $entities[$key] = array_values($value);
    }

    return ['entities' => $entities, 'shape' => $shape, 'warnings' => $warnings];
}

/** @param array<string> $warnings appended by reference */
function v4NormalizeSettings(mixed $value, array &$warnings): array {
    if (is_array($value) && v4ImportIsList($value)) {
        return array_values($value);
    }
    if (!is_array($value)) {
        $warnings[] = 'data.settings harus berupa objek atau array — diabaikan';
        return [];
    }
    // Single settings object (the v4 browser shape).
    if (isset($value['id']) && is_string($value['id']) && trim($value['id']) !== '') {
        return [$value];
    }
    $warnings[] = "data.settings tanpa id disintesis menjadi satu baris 'settings-global'";
    return [array_merge(['id' => 'settings-global'], $value)];
}

function v4MissingCabangId(mixed $value): bool {
    return !is_string($value) || trim($value) === '';
}

/**
 * Fill missing record-level cabangId from the referenced sekolah chain.
 *
 * @return array{0: array<string,list>, 1: list<array{entity:string,id:string,cabangId:string,from:string}>}
 */
function deriveMissingCabangIds(array $entities): array {
    $derived = [];

    $cabangOfSekolah = [];
    foreach ($entities['sekolah'] as $sekolah) {
        if (!is_array($sekolah) || !isset($sekolah['id']) || !is_string($sekolah['id'])) continue;
        $cabang = $sekolah['cabangId'] ?? null;
        $cabangOfSekolah[$sekolah['id']] = is_string($cabang) && trim($cabang) !== '' ? trim($cabang) : null;
    }

    $trainerRows = [];
    foreach ($entities['trainer'] as $trainer) {
        if (is_array($trainer) && isset($trainer['id']) && is_string($trainer['id'])) {
            $trainerRows[$trainer['id']] = $trainer;
        }
    }

    $siswaRows = [];
    foreach ($entities['siswa'] as $siswa) {
        if (is_array($siswa) && isset($siswa['id']) && is_string($siswa['id'])) {
            $siswaRows[$siswa['id']] = $siswa;
        }
    }

    $fill = static function (array &$record, string $entity, ?string $cabangId, string $from) use (&$derived): void {
        if ($cabangId === null) return;
        if (!v4MissingCabangId($record['cabangId'] ?? null)) return;
        $record['cabangId'] = $cabangId;
        $derived[] = [
            'entity' => $entity,
            'id' => (string) ($record['id'] ?? ''),
            'cabangId' => $cabangId,
            'from' => $from,
        ];
    };

    // Trainer first: later honorPayments derivation may read trainer cabang.
    foreach ($entities['trainer'] as &$trainer) {
        if (!is_array($trainer)) continue;
        $firstCabang = null;
        $firstSekolah = null;
        foreach ((array) ($trainer['sekolahIds'] ?? []) as $sekolahId) {
            if (!is_string($sekolahId) || !array_key_exists($sekolahId, $cabangOfSekolah)) continue;
            $firstSekolah = $sekolahId;
            if ($cabangOfSekolah[$sekolahId] !== null) { $firstCabang = $cabangOfSekolah[$sekolahId]; break; }
        }
        if ($firstCabang !== null) {
            $fill($trainer, 'trainer', $firstCabang, "sekolah:{$firstSekolah}");
            $trainerRows[$trainer['id']] = $trainer;
        }
    }
    unset($trainer);

    foreach ($entities['siswa'] as &$siswa) {
        if (!is_array($siswa)) continue;
        $sekolahId = $siswa['sekolahId'] ?? null;
        if (is_string($sekolahId) && array_key_exists($sekolahId, $cabangOfSekolah) && $cabangOfSekolah[$sekolahId] !== null) {
            $fill($siswa, 'siswa', $cabangOfSekolah[$sekolahId], "sekolah:{$sekolahId}");
            if (isset($siswa['id']) && is_string($siswa['id'])) $siswaRows[$siswa['id']] = $siswa;
        }
    }
    unset($siswa);

    foreach ($entities['absensi'] as &$absensi) {
        if (!is_array($absensi)) continue;
        $sekolahId = $absensi['sekolahId'] ?? null;
        if (is_string($sekolahId) && array_key_exists($sekolahId, $cabangOfSekolah) && $cabangOfSekolah[$sekolahId] !== null) {
            $fill($absensi, 'absensi', $cabangOfSekolah[$sekolahId], "sekolah:{$sekolahId}");
        }
    }
    unset($absensi);

    foreach ($entities['invoices'] as &$invoice) {
        if (!is_array($invoice)) continue;
        $sekolahId = $invoice['sekolahId'] ?? null;
        if (is_string($sekolahId) && array_key_exists($sekolahId, $cabangOfSekolah) && $cabangOfSekolah[$sekolahId] !== null) {
            $fill($invoice, 'invoices', $cabangOfSekolah[$sekolahId], "sekolah:{$sekolahId}");
        }
    }
    unset($invoice);

    foreach ($entities['sppPayments'] as &$payment) {
        if (!is_array($payment)) continue;
        $siswaId = $payment['siswaId'] ?? null;
        if (!is_string($siswaId) || !isset($siswaRows[$siswaId]) || !is_array($siswaRows[$siswaId])) continue;
        $sekolahId = $siswaRows[$siswaId]['sekolahId'] ?? null;
        if (is_string($sekolahId) && array_key_exists($sekolahId, $cabangOfSekolah) && $cabangOfSekolah[$sekolahId] !== null) {
            $fill($payment, 'sppPayments', $cabangOfSekolah[$sekolahId], "siswa:{$siswaId}→sekolah:{$sekolahId}");
        }
    }
    unset($payment);

    foreach ($entities['honorPayments'] as &$payment) {
        if (!is_array($payment)) continue;
        $trainerId = $payment['trainerId'] ?? null;
        if (!is_string($trainerId) || !isset($trainerRows[$trainerId]) || !is_array($trainerRows[$trainerId])) continue;
        $trainer = $trainerRows[$trainerId];
        $trainerCabang = $trainer['cabangId'] ?? null;
        if (is_string($trainerCabang) && trim($trainerCabang) !== '') {
            $fill($payment, 'honorPayments', trim($trainerCabang), "trainer:{$trainerId}");
            continue;
        }
        foreach ((array) ($trainer['sekolahIds'] ?? []) as $sekolahId) {
            if (!is_string($sekolahId) || !array_key_exists($sekolahId, $cabangOfSekolah)) continue;
            if ($cabangOfSekolah[$sekolahId] === null) continue;
            $fill($payment, 'honorPayments', $cabangOfSekolah[$sekolahId], "trainer:{$trainerId}→sekolah:{$sekolahId}");
            break;
        }
    }
    unset($payment);

    return [$entities, $derived];
}

/**
 * Validate hard reference edges against the import set (pure — no DB).
 *
 * @return array{errors: list<array{entity:string,id:string,field:string,message:string,kind:string}>, conflicts: list<array{entity:string,id:string,message:string}>}
 */
function validateReferences(array $entities): array {
    $errors = [];
    $conflicts = [];

    $fail = static function (string $entity, mixed $id, string $field, string $message) use (&$errors): void {
        $errors[] = [
            'entity' => $entity,
            'id' => is_string($id) ? $id : '',
            'field' => $field,
            'message' => $message,
            'kind' => 'reference',
        ];
    };
    $need = static function (string $entity, mixed $id, string $field, string $message) use (&$errors): void {
        $errors[] = [
            'entity' => $entity,
            'id' => is_string($id) ? $id : '',
            'field' => $field,
            'message' => $message,
            'kind' => 'required',
        ];
    };

    // Within-fixture duplicate ids (409-class). Non-array rows are skipped
    // here — they surface as required-id errors below instead.
    foreach (v4ImportEntityKeys() as $entity) {
        $seen = [];
        foreach (($entities[$entity] ?? []) as $record) {
            if (!is_array($record) || !isset($record['id']) || !is_string($record['id']) || trim($record['id']) === '') continue;
            $id = $record['id'];
            if (isset($seen[$id])) {
                $conflicts[] = ['entity' => $entity, 'id' => $id, 'message' => "{$entity}: id duplikat dalam file impor '{$id}'"];
            } else {
                $seen[$id] = true;
            }
        }
    }

    $cabangIds = [];
    foreach ($entities['cabang'] as $cabang) {
        if (!is_array($cabang)) continue;
        $id = $cabang['id'] ?? null;
        if (is_string($id) && trim($id) !== '') $cabangIds[$id] = true;
        if (!is_string($id) || trim($id) === '') $need('cabang', $id, 'id', 'cabang: id wajib diisi');
        if (!is_string($cabang['kode'] ?? null) || trim((string) ($cabang['kode'] ?? '')) === '') $need('cabang', $id, 'kode', 'cabang: kode wajib diisi');
        if (!is_string($cabang['nama'] ?? null) || trim((string) ($cabang['nama'] ?? '')) === '') $need('cabang', $id, 'nama', 'cabang: nama wajib diisi');
    }

    $sekolahIds = [];
    $sekolahCabang = [];
    foreach ($entities['sekolah'] as $sekolah) {
        if (!is_array($sekolah)) continue;
        $id = $sekolah['id'] ?? null;
        if (!is_string($id) || trim($id) === '') { $need('sekolah', $id, 'id', 'sekolah: id wajib diisi'); continue; }
        $sekolahIds[$id] = true;
        $cabangId = $sekolah['cabangId'] ?? null;
        if (v4MissingCabangId($cabangId)) {
            $need('sekolah', $id, 'cabangId', 'sekolah: cabangId wajib diisi');
        } elseif (!isset($cabangIds[trim((string) $cabangId)])) {
            $fail('sekolah', $id, 'cabangId', "sekolah: cabangId '" . trim((string) $cabangId) . "' tidak merujuk ke cabang dalam file impor");
        } else {
            $sekolahCabang[$id] = trim((string) $cabangId);
        }
    }

    $trainerIds = [];
    foreach ($entities['trainer'] as $trainer) {
        if (!is_array($trainer)) continue;
        $id = $trainer['id'] ?? null;
        if (!is_string($id) || trim($id) === '') { $need('trainer', $id, 'id', 'trainer: id wajib diisi'); continue; }
        $trainerIds[$id] = true;
        foreach ((array) ($trainer['sekolahIds'] ?? []) as $sekolahId) {
            if (!is_string($sekolahId) || trim($sekolahId) === '') { $fail('trainer', $id, 'sekolahIds', 'trainer: sekolahIds memuat id kosong'); continue; }
            if (!isset($sekolahIds[$sekolahId])) {
                $fail('trainer', $id, 'sekolahIds', "trainer: sekolahIds merujuk ke sekolah yang tidak ada '{$sekolahId}'");
            }
        }
    }

    // Reverse assignment direction (hard, symmetric with the check above).
    foreach ($entities['sekolah'] as $sekolah) {
        if (!is_array($sekolah) || !isset($sekolah['id']) || !is_string($sekolah['id']) || trim($sekolah['id']) === '') continue;
        foreach ((array) ($sekolah['trainerIds'] ?? []) as $trainerId) {
            if (!is_string($trainerId) || trim($trainerId) === '') { $fail('sekolah', $sekolah['id'], 'trainerIds', 'sekolah: trainerIds memuat id kosong'); continue; }
            if (!isset($trainerIds[$trainerId])) {
                $fail('sekolah', $sekolah['id'], 'trainerIds', "sekolah: trainerIds merujuk ke trainer yang tidak ada '{$trainerId}'");
            }
        }
    }

    $siswaIds = [];
    $siswaSekolah = [];
    foreach ($entities['siswa'] as $siswa) {
        if (!is_array($siswa)) continue;
        $id = $siswa['id'] ?? null;
        if (!is_string($id) || trim($id) === '') { $need('siswa', $id, 'id', 'siswa: id wajib diisi'); continue; }
        $siswaIds[$id] = true;
        $sekolahId = $siswa['sekolahId'] ?? null;
        $sekolahOk = false;
        if (!is_string($sekolahId) || trim($sekolahId) === '') {
            $need('siswa', $id, 'sekolahId', 'siswa: sekolahId wajib diisi');
        } elseif (!isset($sekolahIds[$sekolahId])) {
            $fail('siswa', $id, 'sekolahId', "siswa: sekolahId '{$sekolahId}' tidak merujuk ke sekolah dalam file impor");
        } else {
            $sekolahOk = true;
            $siswaSekolah[$id] = $sekolahId;
        }
        // Ownership must agree with the referenced sekolah's branch. When
        // the sekolah reference itself is broken the cabang gap is a
        // consequence, not a second error — report only the reference.
        $cabangId = $siswa['cabangId'] ?? null;
        if (v4MissingCabangId($cabangId)) {
            if ($sekolahOk) $need('siswa', $id, 'cabangId', 'siswa: cabangId wajib diisi (tidak bisa diturunkan dari sekolah)');
        } elseif ($sekolahOk && isset($sekolahCabang[$sekolahId]) && trim((string) $cabangId) !== $sekolahCabang[$sekolahId]) {
            $fail('siswa', $id, 'cabangId', 'siswa: cabangId tidak cocok dengan cabang sekolah yang dirujuk');
        }
    }

    foreach ($entities['absensi'] as $absensi) {
        if (!is_array($absensi)) continue;
        $id = $absensi['id'] ?? null;
        if (!is_string($id) || trim($id) === '') { $need('absensi', $id, 'id', 'absensi: id wajib diisi'); continue; }
        $sekolahId = $absensi['sekolahId'] ?? null;
        if (!is_string($sekolahId) || trim($sekolahId) === '') {
            $need('absensi', $id, 'sekolahId', 'absensi: sekolahId wajib diisi');
        } elseif (!isset($sekolahIds[$sekolahId])) {
            $fail('absensi', $id, 'sekolahId', "absensi: sekolahId '{$sekolahId}' tidak merujuk ke sekolah dalam file impor");
        }
        $trainerId = $absensi['trainerId'] ?? null;
        if ($trainerId === null || (is_string($trainerId) && trim($trainerId) === '')) {
            // Tolerated when absent — hard-for-present-values per §11.
        } elseif (!is_string($trainerId)) {
            $fail('absensi', $id, 'trainerId', 'absensi: trainerId harus berupa string id');
        } elseif (!isset($trainerIds[$trainerId])) {
            $fail('absensi', $id, 'trainerId', "absensi: trainerId '{$trainerId}' tidak merujuk ke trainer dalam file impor");
        }
        foreach ((array) ($absensi['siswaList'] ?? []) as $entry) {
            if (!is_array($entry)) continue;
            $siswaId = $entry['siswaId'] ?? null;
            if ($siswaId === null || (is_string($siswaId) && trim($siswaId) === '')) continue; // tolerated when absent
            if (!is_string($siswaId) || !isset($siswaIds[$siswaId])) {
                $fail('absensi', $id, 'siswaList.siswaId', "absensi: siswaList merujuk ke siswa yang tidak ada '" . (is_string($siswaId) ? $siswaId : '?') . "'");
            }
        }
    }

    foreach ($entities['honorPayments'] as $payment) {
        if (!is_array($payment)) continue;
        $id = $payment['id'] ?? null;
        if (!is_string($id) || trim($id) === '') { $need('honorPayments', $id, 'id', 'honorPayments: id wajib diisi'); continue; }
        $trainerId = $payment['trainerId'] ?? null;
        if (!is_string($trainerId) || trim($trainerId) === '') {
            $need('honorPayments', $id, 'trainerId', 'honorPayments: trainerId wajib diisi');
        } elseif (!isset($trainerIds[$trainerId])) {
            $fail('honorPayments', $id, 'trainerId', "honorPayments: trainerId '{$trainerId}' tidak merujuk ke trainer dalam file impor");
        }
    }

    foreach ($entities['sppPayments'] as $payment) {
        if (!is_array($payment)) continue;
        $id = $payment['id'] ?? null;
        if (!is_string($id) || trim($id) === '') { $need('sppPayments', $id, 'id', 'sppPayments: id wajib diisi'); continue; }
        $siswaId = $payment['siswaId'] ?? null;
        if (!is_string($siswaId) || trim($siswaId) === '') {
            $need('sppPayments', $id, 'siswaId', 'sppPayments: siswaId wajib diisi');
        } elseif (!isset($siswaIds[$siswaId])) {
            $fail('sppPayments', $id, 'siswaId', "sppPayments: siswaId '{$siswaId}' tidak merujuk ke siswa dalam file impor");
        }
    }

    foreach ($entities['invoices'] as $invoice) {
        if (!is_array($invoice)) continue;
        $id = $invoice['id'] ?? null;
        if (!is_string($id) || trim($id) === '') { $need('invoices', $id, 'id', 'invoices: id wajib diisi'); continue; }
        $sekolahId = $invoice['sekolahId'] ?? null;
        $sekolahOk = false;
        if (!is_string($sekolahId) || trim($sekolahId) === '') {
            $need('invoices', $id, 'sekolahId', 'invoices: sekolahId wajib diisi');
        } elseif (!isset($sekolahIds[$sekolahId])) {
            $fail('invoices', $id, 'sekolahId', "invoices: sekolahId '{$sekolahId}' tidak merujuk ke sekolah dalam file impor");
        } else {
            $sekolahOk = true;
        }
        $cabangId = $invoice['cabangId'] ?? null;
        if (v4MissingCabangId($cabangId)) {
            if ($sekolahOk) $need('invoices', $id, 'cabangId', 'invoices: cabangId wajib diisi (tidak bisa diturunkan dari sekolah)');
        } elseif ($sekolahOk && isset($sekolahCabang[$sekolahId]) && trim((string) $cabangId) !== $sekolahCabang[$sekolahId]) {
            $fail('invoices', $id, 'cabangId', 'invoices: cabangId tidak cocok dengan cabang sekolah yang dirujuk');
        }
    }

    foreach ($entities['settings'] as $setting) {
        if (!is_array($setting)) continue;
        $id = $setting['id'] ?? null;
        if (!is_string($id) || trim($id) === '') { $need('settings', $id, 'id', 'settings: id wajib diisi'); continue; }
        $cabangId = $setting['cabangId'] ?? null;
        if ($cabangId !== null && !v4MissingCabangId($cabangId) && !isset($cabangIds[trim((string) $cabangId)])) {
            $fail('settings', $id, 'cabangId', "settings: cabangId '" . trim((string) $cabangId) . "' tidak merujuk ke cabang dalam file impor");
        }
    }

    return ['errors' => $errors, 'conflicts' => $conflicts];
}

/**
 * Build the preview/commit report: per-entity counts, unresolved
 * references, derived cabangIds, conflicts, and the ok flag.
 */
function buildReport(array $entities, array $errors, array $derived, array $conflicts, string $shape = 'v4'): array {
    $counts = [];
    $total = 0;
    foreach (v4ImportEntityKeys() as $entity) {
        $n = is_array($entities[$entity] ?? null) ? count($entities[$entity]) : 0;
        $counts[$entity] = $n;
        $total += $n;
    }
    $unresolved = array_values(array_filter(
        $errors,
        static fn (array $e): bool => ($e['kind'] ?? '') === 'reference'
    ));
    return [
        'ok' => $errors === [] && $conflicts === [],
        'shape' => $shape,
        'counts' => $counts,
        'total' => $total,
        'errors' => $errors,
        'unresolvedReferences' => $unresolved,
        'derivedCabangIds' => $derived,
        'conflicts' => $conflicts,
    ];
}
