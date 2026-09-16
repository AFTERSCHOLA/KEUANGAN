<?php
declare(strict_types=1);

/**
 * Generate invoices for one periode ("YYYY-MM"), one invoice per sekolah
 * that has at least 1 active siswa, grouping students by their effective
 * SPP tariff (siswa.sppOverride if set, else sekolah.spp) into separate
 * uraian lines within the same invoice.
 *
 * $actor shape: ['id' => string|null, 'role' => string, 'cabangId' => string|null].
 * For HTTP calls this is $user from requireAuthenticatedUser(). For the
 * cron entry point there is no session, so the caller passes a synthetic
 * actor with role 'system' — auditEvent() must accept that (verify against
 * your actual auditEvent() implementation; if it strictly requires a real
 * users.id foreign key, actor_user_id will need to stay NULL for role
 * 'system' rather than a fabricated id).
 *
 * KNOWN LIMITATION: siswa.sekolahId lives only inside the JSON payload
 * (no dedicated column, per newSiswa() in constants.js), so the active-
 * student lookup below filters via JSON_UNQUOTE(JSON_EXTRACT(...)). Fine
 * at current data volume; if siswa count per branch grows large, consider
 * a generated column + index on payload->>'$.sekolahId', same class of
 * gap as the trainerStatus enum / payload-size items already tracked in
 * PRODUCTION_PLAN.md.
 *
 * KNOWN LIMITATION: the per-(cabang, periode) sequence number is derived
 * from COUNT(*) inside a transaction with a row lock on existing matching
 * invoices, not a dedicated counter table. This is safe against the
 * manual-trigger and cron paths racing each other for the SAME branch
 * (transaction serializes them), but if you ever run generation
 * concurrently for the same branch+periode from two different processes
 * hitting different DB connections at the exact same instant under high
 * concurrency, prefer a dedicated `invoice_sequences` counter table later.
 * Not expected to matter for manual-click + single-cron-run usage.
 */
function generateInvoicesForPeriod(PDO $pdo, string $periode, string $uraian, array $actor, ?string $cabangIdFilter = null): array
{
    if (!preg_match('/^\d{4}-\d{2}$/', $periode)) {
        throw new InvalidArgumentException('Periode harus format YYYY-MM');
    }
    if (trim($uraian) === '') {
        throw new InvalidArgumentException('Uraian tidak boleh kosong');
    }

    $result = ['generated' => [], 'skipped' => []];

    if ($cabangIdFilter !== null) {
        $stmt = $pdo->prepare('SELECT id, cabang_id, payload FROM sekolah WHERE cabang_id = :c');
        $stmt->execute([':c' => $cabangIdFilter]);
    } else {
        $stmt = $pdo->query('SELECT id, cabang_id, payload FROM sekolah');
    }
    $allSekolah = $stmt->fetchAll();

    foreach ($allSekolah as $sekolahRow) {
        $sekolahId = $sekolahRow['id'];
        $cabangId = $sekolahRow['cabang_id'];
        $sekolahPayload = json_decode($sekolahRow['payload'], true);
        if (!is_array($sekolahPayload)) {
            $result['skipped'][] = ['sekolahId' => $sekolahId, 'reason' => 'sekolah_payload_invalid'];
            continue;
        }
        $defaultTarif = (float) ($sekolahPayload['spp'] ?? 0);
        $sekolahNama = (string) ($sekolahPayload['nama'] ?? '');
        $pjNama = (string) ($sekolahPayload['pjNama'] ?? '');

        // Already invoiced for this periode? Skip, don't double-bill.
        $existingStmt = $pdo->prepare(
            "SELECT 1 FROM invoices
             WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, '$.sekolahId')) = :sid
               AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.periode')) = :p
             LIMIT 1"
        );
        $existingStmt->execute([':sid' => $sekolahId, ':p' => $periode]);
        if ($existingStmt->fetchColumn() !== false) {
            $result['skipped'][] = ['sekolahId' => $sekolahId, 'reason' => 'already_generated'];
            continue;
        }

        // Active siswa for this sekolah, this branch.
        $siswaStmt = $pdo->prepare(
            "SELECT payload FROM siswa
             WHERE cabang_id = :c
               AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.sekolahId')) = :sid
               AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.status')) = 'Aktif'"
        );
        $siswaStmt->execute([':c' => $cabangId, ':sid' => $sekolahId]);
        $siswaRows = $siswaStmt->fetchAll();

        if (count($siswaRows) === 0) {
            $result['skipped'][] = ['sekolahId' => $sekolahId, 'reason' => 'no_active_siswa'];
            continue;
        }

        // Group by effective tariff: siswa.sppOverride if present and
        // numeric, else sekolah.spp default.
        $groups = []; // tarif (string key to avoid float precision dupes) => count
        foreach ($siswaRows as $siswaRow) {
            $siswaPayload = json_decode($siswaRow['payload'], true);
            if (!is_array($siswaPayload)) continue;
            $override = $siswaPayload['sppOverride'] ?? null;
            $tarif = (is_numeric($override)) ? (float) $override : $defaultTarif;
            $key = number_format($tarif, 2, '.', '');
            $groups[$key] = ($groups[$key] ?? 0) + 1;
        }

        $items = [];
        $grandTotal = 0.0;
        foreach ($groups as $tarifKey => $jumlahSiswa) {
            $hargaSatuan = (float) $tarifKey;
            $total = $hargaSatuan * $jumlahSiswa;
            $items[] = [
                'deskripsi' => $uraian,
                'jumlahSiswa' => $jumlahSiswa,
                'hargaSatuan' => $hargaSatuan,
                'total' => $total,
            ];
            $grandTotal += $total;
        }

        // Sequence number + insert, transactional to avoid two concurrent
        // generation runs handing out the same nomor for this branch+periode.
        $pdo->beginTransaction();
        try {
            $seqStmt = $pdo->prepare(
                "SELECT COUNT(*) FROM invoices
                 WHERE cabang_id = :c
                   AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.periode')) = :p
                 FOR UPDATE"
            );
            $seqStmt->execute([':c' => $cabangId, ':p' => $periode]);
            $seq = ((int) $seqStmt->fetchColumn()) + 1;
            $nomorInvoice = 'AFS-' . str_replace('-', '', $periode) . '-' . str_pad((string) $seq, 4, '0', STR_PAD_LEFT);

            $id = 'inv-' . strtoupper(cabangKodeFor($pdo, $cabangId)) . '-' . (string) round(microtime(true) * 1000) . '-' . substr(bin2hex(random_bytes(4)), 0, 7);

            $record = [
    'id' => $id,
    'cabangId' => $cabangId,
    'sekolahId' => $sekolahId,
    'sekolahNama' => $sekolahNama,
    'pjNama' => $pjNama,
    'periode' => $periode,
    'nomorInvoice' => $nomorInvoice,
    'nomor' => $nomorInvoice,
    'tanggal' => date('Y-m-d'),
    'tanggalTerbit' => date('Y-m-d'),
    'status' => 'Terbit',
    'items' => $items,
    'grandTotal' => $grandTotal,
];

            $pdo->prepare('INSERT INTO invoices (id, cabang_id, payload) VALUES (:id, :c, :p)')
                ->execute([
                    ':id' => $id,
                    ':c' => $cabangId,
                    ':p' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ]);

            $pdo->commit();
        } catch (Throwable $error) {
            $pdo->rollBack();
            $result['skipped'][] = ['sekolahId' => $sekolahId, 'reason' => 'insert_failed: ' . $error->getMessage()];
            continue;
        }

        auditEvent('invoices_created', $actor, 'invoices', $id, [
            'cabangId' => $cabangId,
            'via' => 'generate',
            'periode' => $periode,
        ]);

        $result['generated'][] = $record;
    }

    return $result;
}

/** Small helper: look up a branch's kode for ID prefixing. */
function cabangKodeFor(PDO $pdo, string $cabangId): string
{
    $stmt = $pdo->prepare('SELECT kode FROM cabang WHERE id = :id');
    $stmt->execute([':id' => $cabangId]);
    $kode = $stmt->fetchColumn();
    return is_string($kode) ? $kode : 'XXX';
}