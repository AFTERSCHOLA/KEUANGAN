<?php
declare(strict_types=1);

/**
 * EX.1 — Shared shell for backend-owned export documents.
 *
 * Pure functions: no DB, no HTTP, no session. Each document type owns
 * one small renderer (cf. server/lib/exportMatrix.php) that pastes
 * queried rows into a table and passes it through renderExportShell().
 * server/lib/invoiceDoc.php stays byte-identical (its own inline shell);
 * new types build on this file instead.
 *
 * Shell contract: landscape A4, plain bordered tables, zero JS, inline
 * CSS only, repeated thead on page breaks, Indonesian copy.
 */

function exportShellEscape(mixed $value): string {
    return htmlspecialchars((string) ($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * Wrap a document table in the standalone landscape-A4 shell.
 *
 * $opts: title (html <title>), kicker (eyebrow line), heading (h1),
 *   meta (string[] subheading lines), bodyHtml (the document table),
 *   footer (string, small print under the table, optional).
 */
function renderExportShell(array $opts): string {
    $h = 'exportShellEscape';
    $title = (string) ($opts['title'] ?? 'Dokumen Ekspor');
    $kicker = (string) ($opts['kicker'] ?? '');
    $heading = (string) ($opts['heading'] ?? '');
    $meta = $opts['meta'] ?? [];
    if (!is_array($meta)) $meta = [$meta];
    $bodyHtml = (string) ($opts['bodyHtml'] ?? '');
    $footer = (string) ($opts['footer'] ?? '');

    $metaHtml = '';
    foreach ($meta as $line) {
        if (!is_string($line) || $line === '') continue;
        $metaHtml .= '<p style="margin:2px 0 0;font-size:11px;color:#64748b">' . $h($line) . '</p>';
    }
    $footerHtml = $footer !== ''
        ? '<p style="margin:12px 0 0;font-size:10px;color:#94a3b8">' . $h($footer) . '</p>'
        : '';

    return '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">'
        . '<title>' . $h($title) . '</title>'
        . '<style>'
        . '@page{size:A4 landscape;margin:10mm}'
        . 'html,body{margin:0;padding:0;background:#fff;color:#1e293b;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}'
        . '.sheet{max-width:277mm;margin:0 auto;padding:8px 4px}'
        . '.x-scroll{overflow-x:auto}'
        . 'table.x-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt;line-height:1.3}'
        . 'table.x-table th,table.x-table td{border:1px solid #94a3b8;padding:2px 3px;vertical-align:top;word-break:normal;overflow-wrap:break-word}'
        . 'table.x-table thead{display:table-header-group}'
        . 'table.x-table thead th{background:#f1f5f9;text-align:center;font-size:7pt;letter-spacing:.02em}'
        . 'table.x-table tbody tr{page-break-inside:avoid}'
        . 'table.x-table td.x-no{width:26px;text-align:center}'
        . 'table.x-table td.x-school{width:140px;font-weight:700}'
        . '@media print{.no-print{display:none!important}.sheet{max-width:none;padding:0}}'
        . '</style></head><body><div class="sheet">'
        . '<div class="no-print" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:12px;color:#64748b;margin-bottom:12px">Dokumen ekspor resmi — gunakan <strong>Cetak / Simpan sebagai PDF</strong> di browser untuk menyimpan.</div>'
        . ($kicker !== '' ? '<p style="margin:0;font-size:10px;font-weight:700;letter-spacing:.1em;color:#94a3b8">' . $h($kicker) . '</p>' : '')
        . ($heading !== '' ? '<h1 style="margin:2px 0 0;font-size:20px;font-weight:800;color:#1e3a8a">' . $h($heading) . '</h1>' : '')
        . $metaHtml
        . '<div class="x-scroll" style="margin-top:10px">' . $bodyHtml . '</div>'
        . $footerHtml
        . '</div></body></html>';
}
