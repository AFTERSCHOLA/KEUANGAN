<?php
declare(strict_types=1);

/**
 * IP.1 — Standalone invoice document renderer (D-IP1, D-IP4, D-IP6).
 *
 * Pure functions: no DB, no HTTP, no session. The endpoint
 * (`server/api/invoices-doc.php`) gathers MySQL rows + POST-body settings
 * and calls renderInvoiceDoc(). The contract script
 * (`server/tests/invoice-doc.check.php`) pins the slot mapping.
 *
 * Slot map mirrors docs/CLIENT_ROUND_PLAN.md §6 and the client preview
 * order in src/features/reports/InvoiceTemplate.jsx; both invoice shapes
 * render (server canonical items[]/grandTotal AND legacy client
 * periodeList/uraian/total — cf. SBF.1 in invoice-print-shape.test.js).
 * Settlement + carry-over render as a display-only appendix (user pick):
 * they never feed any total.
 */

const INVOICE_DOC_BULAN = [
    '01' => 'Januari', '02' => 'Februari', '03' => 'Maret',
    '04' => 'April', '05' => 'Mei', '06' => 'Juni',
    '07' => 'Juli', '08' => 'Agustus', '09' => 'September',
    '10' => 'Oktober', '11' => 'November', '12' => 'Desember',
];

function invoiceDocEscape(mixed $value): string {
    return htmlspecialchars((string) ($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Port of src/lib/format.js formatRupiah(): "Rp 9.350.000". */
function invoiceDocRupiah(mixed $amount): string {
    return 'Rp ' . number_format((float) ($amount ?? 0), 0, ',', '.');
}

/** Port of src/lib/terbilang.js terbilang(). */
function invoiceDocTerbilangRek(int $n): string {
    $satuan = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
    if ($n < 12) return $satuan[$n];
    if ($n < 20) return invoiceDocTerbilangRek($n - 10) . ' belas';
    if ($n < 100) return invoiceDocTerbilangRek(intdiv($n, 10)) . ' puluh' . ($n % 10 !== 0 ? ' ' . invoiceDocTerbilangRek($n % 10) : '');
    if ($n < 200) return 'seratus' . ($n - 100 !== 0 ? ' ' . invoiceDocTerbilangRek($n - 100) : '');
    if ($n < 1000) return invoiceDocTerbilangRek(intdiv($n, 100)) . ' ratus' . ($n % 100 !== 0 ? ' ' . invoiceDocTerbilangRek($n % 100) : '');
    if ($n < 2000) return 'seribu' . ($n - 1000 !== 0 ? ' ' . invoiceDocTerbilangRek($n - 1000) : '');
    if ($n < 1000000) return invoiceDocTerbilangRek(intdiv($n, 1000)) . ' ribu' . ($n % 1000 !== 0 ? ' ' . invoiceDocTerbilangRek($n % 1000) : '');
    if ($n < 1000000000) return invoiceDocTerbilangRek(intdiv($n, 1000000)) . ' juta' . ($n % 1000000 !== 0 ? ' ' . invoiceDocTerbilangRek($n % 1000000) : '');
    if ($n < 1000000000000) return invoiceDocTerbilangRek(intdiv($n, 1000000000)) . ' miliar' . ($n % 1000000000 !== 0 ? ' ' . invoiceDocTerbilangRek($n % 1000000000) : '');
    return (string) $n;
}

function invoiceDocTerbilang(mixed $amount): string {
    $n = (int) round((float) ($amount ?? 0));
    if ($n === 0) return 'Nol Rupiah';
    $raw = trim(preg_replace('/\s+/', ' ', invoiceDocTerbilangRek($n)));
    return ucwords($raw) . ' Rupiah';
}

/** PHP mirror of src/lib/invoices.js invoicePeriods(). */
function invoiceDocPeriods(array $invoice): array {
    if (isset($invoice['periodeList']) && is_array($invoice['periodeList']) && count($invoice['periodeList']) > 0) {
        return array_values($invoice['periodeList']);
    }
    if (isset($invoice['periode']) && is_string($invoice['periode']) && $invoice['periode'] !== '') {
        return [$invoice['periode']];
    }
    return [];
}

/** "2026-08" -> "Agustus 2026"; range -> "Juli 2026 - Desember 2026". */
function invoiceDocPeriodeLabel(array $periods): string {
    $labels = [];
    foreach ($periods as $p) {
        if (!is_string($p) || !preg_match('/^(\d{4})-(\d{2})$/', $p, $m)) continue;
        $labels[] = (INVOICE_DOC_BULAN[$m[2]] ?? $m[2]) . ' ' . $m[1];
    }
    if (count($labels) === 0) return '-';
    if (count($labels) === 1) return $labels[0];
    return $labels[0] . ' - ' . $labels[count($labels) - 1];
}

/** PHP mirror of src/lib/invoices.js invoiceTotal(). */
function invoiceDocTotal(array $invoice): float {
    if (isset($invoice['grandTotal']) && is_numeric($invoice['grandTotal'])) return (float) $invoice['grandTotal'];
    if (isset($invoice['total']) && is_numeric($invoice['total'])) return (float) $invoice['total'];
    return 0.0;
}

/** Normalize table rows across both shapes (display-only). */
function invoiceDocRows(array $invoice, array $sekolah = []): array {
    if (isset($invoice['items']) && is_array($invoice['items']) && count($invoice['items']) > 0) {
        $rows = [];
        $no = 1;
        foreach ($invoice['items'] as $it) {
            if (!is_array($it)) continue;
            $isTrainer = ($it['basis'] ?? '') === 'trainer' || (!empty($it['tarifPerPertemuan']) && empty($it['hargaSatuan']) && empty($it['jumlahSiswa']));
            $qty = $isTrainer ? ($it['pertemuanAktual'] ?? $it['jumlahSiswa'] ?? 1) : ($it['jumlahSiswa'] ?? null);
            $harga = $isTrainer
                ? ($it['tarifPerPertemuan'] ?? $it['hargaSatuan'] ?? $sekolah['spp'] ?? $invoice['hargaSatuan'] ?? 0)
                : ($it['hargaSatuan'] ?? $sekolah['spp'] ?? $it['tarifPerPertemuan'] ?? $invoice['hargaSatuan'] ?? 0);
            $rows[] = [
                'no' => $no++,
                'uraian' => (string) ($it['deskripsi'] ?? $invoice['uraian'] ?? ''),
                'qty' => $qty,
                'harga' => $harga,
                'total' => isset($it['total']) && is_numeric($it['total']) ? (float) $it['total'] : 0.0,
                'isTrainer' => $isTrainer,
            ];
        }
        if (count($rows) > 0) return $rows;
    }
    $isTrainerFallback = ($invoice['basis'] ?? '') === 'trainer' || (!empty($invoice['tarifPerPertemuan']) && empty($invoice['hargaSatuan']) && empty($invoice['jumlahSiswa']));
    $qtyFallback = $isTrainerFallback ? ($invoice['pertemuanAktual'] ?? $invoice['jumlahSiswa'] ?? 1) : ($invoice['jumlahSiswa'] ?? null);
    $hargaFallback = $isTrainerFallback
        ? ($invoice['tarifPerPertemuan'] ?? $invoice['hargaSatuan'] ?? $sekolah['spp'] ?? 0)
        : ($invoice['hargaSatuan'] ?? $sekolah['spp'] ?? $invoice['tarifPerPertemuan'] ?? 0);
    return [[
        'no' => 1,
        'uraian' => (string) ($invoice['uraian'] ?? ''),
        'qty' => $qtyFallback,
        'harga' => $hargaFallback,
        'total' => invoiceDocTotal($invoice),
        'isTrainer' => $isTrainerFallback,
    ]];
}

function invoiceDocTableRows(array $invoice, array $sekolah = []): array {
    return invoiceDocRows($invoice, $sekolah);
}

/**
 * PHP mirror of matchedPaymentsForInvoice()+invoiceSettlement()
 * (src/lib/invoices.js:180-213). Read-only projection over caller-supplied
 * rows: $payments are spp_payments payloads, $siswaIds the invoice school's
 * student ids. Same-school only (R-SB6 inherent — caller scopes both lists).
 */
function invoiceDocSettlement(array $invoice, array $payments, array $siswaIds): array {
    $periods = invoiceDocPeriods($invoice);
    $siswaSet = [];
    foreach ($siswaIds as $sid) $siswaSet[(string) $sid] = true;
    $dibayar = 0.0;
    foreach ($payments as $p) {
        if (!is_array($p)) continue;
        $invoiceId = $p['invoiceId'] ?? null;
        if (is_string($invoiceId) && $invoiceId !== '') {
            if ($invoiceId !== ($invoice['id'] ?? null)) continue;
            $dibayar += (float) ($p['nominal'] ?? 0);
            continue;
        }
        if (!empty($p['sekolahId']) && $p['sekolahId'] === ($invoice['sekolahId'] ?? null) && in_array($p['periode'] ?? null, $periods, true)) {
            $dibayar += (float) ($p['nominal'] ?? 0);
            continue;
        }
        // Historical per-siswa rows: sekolahId + periode intersection.
        $sid = isset($p['siswaId']) ? (string) $p['siswaId'] : '';
        if ($sid === '' || !isset($siswaSet[$sid])) continue;
        $per = $p['periode'] ?? null;
        if (!in_array($per, $periods, true)) continue;
        $dibayar += (float) ($p['nominal'] ?? 0);
    }
    $total = invoiceDocTotal($invoice);
    $sisa = max(0.0, $total - $dibayar);
    $credit = max(0.0, $dibayar - $total);

    $matched = [];
    foreach ($payments as $p) {
        if (!is_array($p)) continue;
        $invoiceId = $p['invoiceId'] ?? null;
        if (is_string($invoiceId) && $invoiceId !== '') {
            if ($invoiceId === ($invoice['id'] ?? null)) {
                $matched[] = $p;
            }
            continue;
        }
        if (!empty($p['sekolahId']) && $p['sekolahId'] === ($invoice['sekolahId'] ?? null) && in_array($p['periode'] ?? null, $periods, true)) {
            $matched[] = $p;
            continue;
        }
        $sid = isset($p['siswaId']) ? (string) $p['siswaId'] : '';
        if ($sid !== '' && isset($siswaSet[$sid]) && in_array($p['periode'] ?? null, $periods, true)) {
            $matched[] = $p;
        }
    }

    usort($matched, function ($a, $b) {
        $dateA = (string) ($a['tanggalBayar'] ?? $a['tanggal'] ?? $a['createdAt'] ?? '');
        $dateB = (string) ($b['tanggalBayar'] ?? $b['tanggal'] ?? $b['createdAt'] ?? '');
        return strcmp($dateA, $dateB);
    });

    $count = count($matched);
    $paidPrev = 0.0;
    $paidCurrent = 0.0;
    if ($count >= 2) {
        $paidCurrent = (float) ($matched[$count - 1]['nominal'] ?? 0);
        for ($i = 0; $i < $count - 1; $i++) {
            $paidPrev += (float) ($matched[$i]['nominal'] ?? 0);
        }
    } elseif ($count === 1) {
        $paidCurrent = (float) ($matched[0]['nominal'] ?? 0);
        $paidPrev = 0.0;
    }

    return [
        'total' => $total,
        'dibayar' => $dibayar,
        'sisa' => $sisa,
        'credit' => $credit,
        'status' => ($sisa <= 0 && $total > 0 && $dibayar > 0) ? 'Lunas' : 'Belum Lunas',
        'hasMultiInstallment' => ($count >= 2),
        'sudahDibayarSebelumnya' => $paidPrev,
        'pembayaranSaatIni' => $paidCurrent,
        'payments' => $matched,
    ];
}

/**
 * Render the standalone invoice document.
 *
 * $invoice: stored payload (either shape). $sekolah: stored payload.
 * $settings: display-only snapshot from the POST body (alamatUsaha,
 *   rekeningBank, rekeningNomor, rekeningAtasNama, penandatangan).
 * $settlement: invoiceDocSettlement() output (null hides the appendix).
 * $assets: ['logoDataUrl' => ?string, 'signatureDataUrl' => ?string].
 */
function renderInvoiceDoc(array $invoice, array $sekolah, array $settings, ?array $settlement, array $assets = []): string {
    $h = 'invoiceDocEscape';
    $isDraft = ($invoice['status'] ?? '') === 'Draft';
    $nomor = $invoice['nomor'] ?? $invoice['nomorInvoice'] ?? null;
    $tanggalSrc = $invoice['tanggalTerbit'] ?? $invoice['tanggal'] ?? (isset($invoice['createdAt']) ? substr((string) $invoice['createdAt'], 0, 10) : '');
    $tanggalLabel = '-';
    if (is_string($tanggalSrc) && preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $tanggalSrc, $m)) {
        $tanggalLabel = $m[3] . '-' . $m[2] . '-' . $m[1];
    }
    $periods = invoiceDocPeriods($invoice);
    $periodeLabel = invoiceDocPeriodeLabel($periods);
    $rows = invoiceDocRows($invoice, $sekolah);
    $grandTotal = invoiceDocTotal($invoice);
    $pj = $invoice['pjNama'] ?? $invoice['pjSekolah'] ?? '';
    $carryLines = (isset($invoice['carryOverLines']) && is_array($invoice['carryOverLines'])) ? $invoice['carryOverLines'] : [];

    $subtotalCurrent = $grandTotal;
    $totalActiveCarryOver = 0.0;
    $totalCredit = 0.0;
    foreach ($carryLines as $line) {
        if (!is_array($line)) continue;
        $kind = $line['kind'] ?? '';
        $isSettled = !empty($line['isSettled']) || (isset($line['activeAmount']) && (float) $line['activeAmount'] === 0.0);
        $amount = isset($line['activeAmount']) ? (float) $line['activeAmount'] : (float) ($line['amount'] ?? 0);
        if ($kind === 'credit') {
            $totalCredit += $amount;
        } elseif (!$isSettled && ($kind === 'outstanding' || $kind === '')) {
            $totalActiveCarryOver += $amount;
        }
    }
    $totalYangHarusDibayar = max(0.0, ($settlement !== null && !$isDraft)
        ? ((float) ($settlement['sisa'] ?? 0) + $totalActiveCarryOver + $totalCredit)
        : ($grandTotal + $totalActiveCarryOver + $totalCredit)
    );
    $terbilang = invoiceDocTerbilang($totalYangHarusDibayar);

    $isTrainerTable = false;
    foreach ($rows as $r) {
        if (!empty($r['isTrainer'])) {
            $isTrainerTable = true;
            break;
        }
    }
    $qtyHeader = $isTrainerTable ? 'Sesi' : 'Siswa';
    $rateHeader = $isTrainerTable ? 'Tarif per Sesi' : 'Harga<br>Satuan';

    $logoImg = '';
    if (!empty($assets['logoDataUrl'])) {
        $logoImg = '<img src="' . $h($assets['logoDataUrl']) . '" alt="Logo" style="height:56px;object-fit:contain" />';
    }
    $sigImg = '';
    if (!empty($assets['signatureDataUrl'])) {
        $sigImg = '<img src="' . $h($assets['signatureDataUrl']) . '" alt="Tanda tangan" style="height:48px;object-fit:contain" />';
    }

    $tableRows = '';
    foreach ($rows as $row) {
        $qty = $row['qty'] === null || $row['qty'] === '' ? '-' : $h($row['qty']);
        $harga = $row['harga'] === null || $row['harga'] === '' ? '-' : invoiceDocRupiah($row['harga']);
        $tableRows .= '<tr>'
            . '<td style="padding:14px 8px 14px 0;vertical-align:top">' . $h($row['no']) . '</td>'
            . '<td style="padding:14px 24px 14px 0;vertical-align:top">' . nl2br($h($row['uraian'])) . '</td>'
            . '<td style="padding:14px 8px;text-align:center;vertical-align:top">' . $qty . '</td>'
            . '<td style="padding:14px 8px;text-align:right;white-space:nowrap;vertical-align:top">' . $harga . '</td>'
            . '<td style="padding:14px 0 14px 8px;text-align:right;white-space:nowrap;font-weight:700;vertical-align:top">' . invoiceDocRupiah($row['total']) . '</td>'
            . '</tr>';
    }

    $topBreakdownHtml = '<div style="border-top:1px solid #e2e8f0;padding:12px 0 8px;font-size:13px">'
        . '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
        . '<span style="font-weight:600;color:#334155">Subtotal Periode Ini</span>'
        . '<span style="font-weight:700;color:#1e293b">' . invoiceDocRupiah($subtotalCurrent) . '</span>'
        . '</div>';

    if ($settlement !== null && !$isDraft && (float) ($settlement['dibayar'] ?? 0) > 0) {
        $topBreakdownHtml .= '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;color:#059669">'
            . '<span>Sudah Dibayar (Periode Ini)</span>'
            . '<span style="font-weight:700">' . invoiceDocRupiah($settlement['dibayar']) . '</span>'
            . '</div>'
            . '<div style="display:flex;justify-content:space-between;align-items:center;color:#334155">'
            . '<span style="font-weight:600">Sisa Periode Ini</span>'
            . '<span style="font-weight:700">' . invoiceDocRupiah($settlement['sisa']) . '</span>'
            . '</div>';

        if (!empty($settlement['hasMultiInstallment'])) {
            $topBreakdownHtml .= '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin:8px 0;font-size:11px;color:#475569">'
                . '<p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:.06em;color:#334155;text-transform:uppercase">Rincian Pembayaran Bertahap</p>'
                . '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span>Total tagihan awal:</span><span style="font-weight:600;color:#1e293b">' . invoiceDocRupiah($settlement['total']) . '</span></div>'
                . '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span>Sudah dibayar sebelumnya:</span><span style="font-weight:600;color:#059669">' . invoiceDocRupiah($settlement['sudahDibayarSebelumnya'] ?? 0) . '</span></div>'
                . '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span>Pembayaran saat ini:</span><span style="font-weight:600;color:#059669">' . invoiceDocRupiah($settlement['pembayaranSaatIni'] ?? 0) . '</span></div>'
                . '<div style="display:flex;justify-content:space-between;border-top:1px solid #e2e8f0;padding-top:2px;font-weight:700;color:#1d4ed8"><span>Sisa tagihan:</span><span>' . invoiceDocRupiah($settlement['sisa']) . '</span></div>'
                . '<div style="margin-top:4px;font-size:10px;color:#64748b;font-style:italic"><strong style="font-style:normal;color:#475569">Keterangan:</strong> Total pembayaran diterima ' . invoiceDocRupiah($settlement['dibayar']) . ' dari total tagihan ' . invoiceDocRupiah($settlement['total']) . '.</div>'
                . '</div>';
        }
    }
    $topBreakdownHtml .= '</div>';

    $middleBreakdownHtml = '';
    if (count($carryLines) > 0) {
        $linesHtml = '';
        foreach ($carryLines as $line) {
            if (!is_array($line)) continue;
            $isSettled = !empty($line['isSettled']) || (isset($line['activeAmount']) && (float) $line['activeAmount'] === 0.0);
            $amount = isset($line['activeAmount']) ? (float) $line['activeAmount'] : (float) ($line['amount'] ?? 0);
            $origAmount = isset($line['amount']) ? (float) $line['amount'] : null;
            $hasAudit = !$isSettled && (isset($line['prevTotal']) || isset($line['prevPaidPrev']) || isset($line['prevPaidCurrent']) || isset($line['prevPaid']) || !empty($line['prevNomor']));
            if ($isSettled) {
                $linesHtml .= '<div style="display:flex;justify-content:space-between;align-items:center;margin:3px 0;font-size:12px;color:#059669;text-decoration:line-through;opacity:0.7">'
                    . '<span>' . $h($line['description'] ?? '') . ': Lunas (' . invoiceDocRupiah(0) . ')</span>'
                    . '<span>Lunas (' . invoiceDocRupiah(0) . ')</span>'
                    . '</div>';
            } else {
                $isCredit = ($line['kind'] ?? '') === 'credit' || $amount < 0;
                $cls = $isCredit ? 'color:#059669' : 'color:#d97706;font-weight:600';
                $suffix = $isCredit ? ' (credit)' : '';
                $origNote = ($origAmount !== null && isset($line['activeAmount']) && (float) $line['activeAmount'] !== $origAmount && !$hasAudit)
                    ? ' <span style="color:#94a3b8;font-weight:normal">(Awal: ' . invoiceDocRupiah($origAmount) . ')</span>'
                    : '';
                $linesHtml .= '<div style="display:flex;justify-content:space-between;align-items:center;margin:3px 0;font-size:12px;' . $cls . '">'
                    . '<span>' . $h($line['description'] ?? '') . $origNote . '</span>'
                    . '<span>' . invoiceDocRupiah(abs($amount)) . $suffix . '</span>'
                    . '</div>';

                if ($hasAudit) {
                    $prevTotal = (float) ($line['prevTotal'] ?? $origAmount ?? 0);
                    $prevPaidPrev = (float) ($line['prevPaidPrev'] ?? 0);
                    $prevPaidCurrent = (float) ($line['prevPaidCurrent'] ?? 0);
                    $prevPaidTotal = (float) ($line['prevPaid'] ?? ($prevPaidPrev + $prevPaidCurrent));
                    $prevSisa = (float) ($line['prevSisa'] ?? $amount);
                    $prevNomor = (string) ($line['prevNomor'] ?? $line['invoiceId'] ?? '');

                    $linesHtml .= '<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;margin:6px 0;font-size:11px;color:#475569">'
                        . '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span>Total tagihan awal:</span><span style="font-weight:600;color:#1e293b">' . invoiceDocRupiah($prevTotal) . '</span></div>'
                        . '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span>Sudah dibayar sebelumnya:</span><span style="font-weight:600;color:#059669">' . invoiceDocRupiah($prevPaidPrev) . '</span></div>'
                        . '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span>Pembayaran saat ini:</span><span style="font-weight:600;color:#059669">' . invoiceDocRupiah($prevPaidCurrent) . '</span></div>'
                        . '<div style="display:flex;justify-content:space-between;border-top:1px solid #f1f5f9;padding-top:2px;font-weight:700;color:#b45309"><span>Sisa tagihan:</span><span>' . invoiceDocRupiah($prevSisa) . '</span></div>'
                        . '<div style="margin-top:4px;font-size:10px;color:#64748b;font-style:italic"><strong style="font-style:normal;color:#475569">Keterangan:</strong> Sisa tagihan dari invoice ' . $h($prevNomor) . ' (total pembayaran diterima ' . invoiceDocRupiah($prevPaidTotal) . ' dari total tagihan ' . invoiceDocRupiah($prevTotal) . ').</div>'
                        . '</div>';
                }
            }
        }
        if ($linesHtml !== '') {
            $middleBreakdownHtml = '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin:12px 0">'
                . '<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.06em;color:#475569;text-transform:uppercase">Rincian Tagihan Sebelumnya (Carry-Over)</p>'
                . $linesHtml
                . '</div>';
        }
    }

    $bottomSummaryHtml = '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;margin:16px 0 24px">'
        . '<div style="display:flex;justify-content:space-between;align-items:center">'
        . '<span style="font-size:15px;font-weight:800;letter-spacing:.04em;color:#1e293b">TOTAL YANG HARUS DIBAYAR</span>'
        . '<span style="font-size:22px;font-weight:800;color:#1d4ed8">' . invoiceDocRupiah($totalYangHarusDibayar) . '</span>'
        . '</div>'
        . '<div style="margin-top:8px;font-size:12px;color:#475569">'
        . '<span style="font-weight:600;color:#334155">Terbilang: </span><em>&ldquo;' . $h($terbilang) . '&rdquo;</em>'
        . '</div>'
        . '</div>';

    $bankBlock = '';
    if (!empty($settings['rekeningBank'])) {
        $bankBlock = '<p style="margin:0 0 4px">Pembayaran dapat ditransfer ke rekening berikut:</p>'
            . '<p style="margin:0 0 4px">Bank ' . $h($settings['rekeningBank'])
            . ' No. Rekening: ' . $h($settings['rekeningNomor'] ?? '') . ' a.n. ' . $h($settings['rekeningAtasNama'] ?? '') . '</p>'
            . '<p style="margin:0">Mohon mencantumkan nomor invoice pada berita transfer. Terima kasih atas kepercayaan Bapak/Ibu.</p>';
    } else {
        $bankBlock = '<p style="margin:0;color:#94a3b8">Belum diatur — isi info rekening di Pengaturan.</p>';
    }

    $statusChip = '';
    if ($isDraft) {
        $statusChip = ' <span style="font-size:10px;font-weight:700;background:#f1f5f9;color:#64748b;border-radius:999px;padding:2px 8px;vertical-align:middle">DRAFT</span>';
    } elseif ($settlement !== null) {
        $isLunas = ($settlement['status'] ?? '') === 'Lunas';
        $statusBg = $isLunas ? '#dcfce7' : '#dbeafe';
        $statusColor = $isLunas ? '#15803d' : '#1d4ed8';
        $statusChip = ' <span style="font-size:10px;font-weight:700;background:' . $statusBg . ';color:' . $statusColor . ';border-radius:999px;padding:2px 8px;vertical-align:middle">' . $h($settlement['status'] ?? '') . '</span>';
    }

    return '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">'
        . '<title>Invoice ' . $h($nomor ?? 'Draft') . ' — ' . $h($sekolah['nama'] ?? '') . '</title>'
        . '<style>'
        . '@page{size:A4;margin:15mm}'
        . 'html,body{margin:0;padding:0;background:#fff;color:#1e293b;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}'
        . '.sheet{max-width:210mm;margin:0 auto;padding:24px 28px}'
        . '@media print{.no-print{display:none!important}.sheet{max-width:none;padding:0}}'
        . '</style></head><body><div class="sheet">'
        . '<div class="no-print" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:12px;color:#64748b;margin-bottom:16px">Dokumen invoice resmi — gunakan <strong>Cetak / Simpan sebagai PDF</strong> di browser untuk menyimpan.</div>'
        . '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:1px solid #e2e8f0">'
        . '<div>' . $logoImg . '<p style="margin:4px 0 0;font-size:14px;font-weight:800;color:#1e293b">AfterSchola</p><p style="font-size:12px;color:#94a3b8;margin:8px 0 0">' . $h($settings['alamatUsaha'] ?? '') . '</p></div>'
        . '<div style="text-align:right"><h1 style="margin:0;font-size:32px;font-weight:800;letter-spacing:.04em;color:#1e3a8a">INVOICE' . $statusChip . '</h1>'
        . '<p style="margin:4px 0 0;font-size:14px;font-weight:700;color:#1d4ed8">' . $h($nomor ?? '(Draft)') . '</p>'
        . '<p style="margin:4px 0 0;font-size:12px;color:#94a3b8">Tanggal: ' . $h($tanggalLabel) . '</p></div>'
        . '</div>'
        . '<div style="display:flex;justify-content:space-between;background:#f8fafc;border-radius:12px;padding:16px 20px;margin-top:24px">'
        . '<div><p style="margin:0;font-size:10px;font-weight:700;letter-spacing:.08em;color:#94a3b8">KEPADA YTH:</p>'
        . '<p style="margin:4px 0 0;font-weight:700">' . $h($sekolah['nama'] ?? '') . '</p>'
        . ($pj !== '' ? '<p style="margin:2px 0 0;font-size:12px;color:#64748b">PJ: ' . $h($pj) . '</p>' : '')
        . '</div>'
        . '<div style="text-align:right"><p style="margin:0;font-size:10px;font-weight:700;letter-spacing:.08em;color:#94a3b8">BULAN TAGIHAN:</p>'
        . '<p style="margin:4px 0 0;font-weight:700;color:#1d4ed8">' . $h($periodeLabel) . '</p></div>'
        . '</div>'
        . '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:28px 0 8px">'
        . '<thead><tr style="border-bottom:2px solid #1e293b;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#334155">'
        . '<th style="text-align:left;padding:8px 8px 8px 0;width:32px">No</th>'
        . '<th style="text-align:left;padding:8px 8px 8px 0">Uraian</th>'
        . '<th style="text-align:center;padding:8px">' . $qtyHeader . '</th>'
        . '<th style="text-align:right;padding:8px">' . $rateHeader . '</th>'
        . '<th style="text-align:right;padding:8px 0 8px 8px">Total</th>'
        . '</tr></thead><tbody>' . $tableRows . '</tbody></table>'
        . $topBreakdownHtml
        . $middleBreakdownHtml
        . $bottomSummaryHtml
        . '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:32px">'
        . '<div style="flex:1"><div style="background:#f8fafc;border:1px solid #f1f5f9;border-radius:12px;padding:20px;font-size:12px;line-height:1.7;color:#475569">'
        . '<p style="margin:0 0 6px;font-weight:700;color:#1e293b">Catatan Pembayaran:</p>' . $bankBlock . '</div></div>'
        . '<div style="text-align:center;font-size:12px;min-width:180px"><p style="margin:0 0 4px;color:#64748b">Hormat Kami,</p>'
        . $sigImg
        . '<p style="display:inline-block;border-top:1px solid #94a3b8;margin:8px 0 0;padding:4px 8px 0;font-weight:700;color:#1e293b">' . $h($settings['penandatangan'] ?? '-') . '</p></div>'
        . '</div>'
        . '</div></body></html>';
}
