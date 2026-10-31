<?php
declare(strict_types=1);

require_once __DIR__ . '/exportShell.php';

/**
 * EX.1 — Trainer attendance matrix renderer (rekap-pengajar document).
 *
 * Pure functions: no DB, no HTTP, no session. The endpoint
 * (server/api/export-doc.php) gathers MySQL rows under the caller's
 * scope and calls buildExportMatrix() + renderExportMatrix(). The
 * contract script (server/tests/export-doc.check.php) pins the
 * slots + gate mapping.
 *
 * Cell + builder rules are ported rule-for-rule from
 * src/lib/trainerAttendance.js (formatMatrixCell/buildTrainerMatrix):
 * every calendar day is a column; correction chains collapse via
 * correctionOf latest-wins; peran→I/A with live tipePengajar as
 * display-only fallback; rows sorted by name (id locale). LIBUR/BERES
 * are stored keterangan values, never computed. The two-row header
 * (Indonesian weekday + date number, Monday-first) follows the
 * Penugasan grid idiom; the NO + NAMA SEKOLAH columns mirror the
 * docs/exemplar/ABSENSI TRAINER-new.xlsx layout reference.
 */

const EXPORT_MATRIX_BULAN = [
    '01' => 'Januari', '02' => 'Februari', '03' => 'Maret',
    '04' => 'April', '05' => 'Mei', '06' => 'Juni',
    '07' => 'Juli', '08' => 'Agustus', '09' => 'September',
    '10' => 'Oktober', '11' => 'November', '12' => 'Desember',
];

// Monday-first, Penugasan grid idiom (PenugasanTimetable.jsx:50).
const EXPORT_MATRIX_HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

function exportMatrixEscape(mixed $value): string {
    return htmlspecialchars((string) ($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function exportMatrixNameCompare(string $a, string $b): int {
    static $collator = null;
    if ($collator === null) {
        $collator = class_exists('Collator') ? new Collator('id') : false;
    }
    if ($collator instanceof Collator) {
        $r = $collator->compare($a, $b);
        if (is_int($r) && $r !== 0) return $r < 0 ? -1 : 1;
        if (is_int($r)) return 0;
    }
    $r = strcasecmp($a, $b);
    if ($r !== 0) return $r < 0 ? -1 : 1;
    return strcmp($a, $b);
}

/**
 * PHP port of resolveCurrentAbsensiPengajar(): a record is superseded
 * when its id appears as another record's correctionOf — any chain
 * depth, not just one level.
 */
function exportMatrixCurrent(array $records): array {
    $supersededIds = [];
    foreach ($records as $r) {
        if (!is_array($r)) continue;
        $c = $r['correctionOf'] ?? null;
        if (is_string($c) && $c !== '') $supersededIds[$c] = true;
    }
    return array_values(array_filter(
        $records,
        static fn($r) => is_array($r) && !isset($supersededIds[(string) ($r['id'] ?? '')])
    ));
}

/** PHP port of formatMatrixCell(): byte-identical text (U+2014 dash). */
function exportMatrixCellText(array $entry): string {
    $text = ((string) ($entry['nama'] ?? '')) . ' (' . ((string) ($entry['label'] ?? '')) . ')';
    $details = [];
    if (!empty($entry['status']) && $entry['status'] !== 'Hadir') $details[] = (string) $entry['status'];
    if (!empty($entry['keterangan'])) $details[] = (string) $entry['keterangan'];
    if (!empty($entry['catatan'])) $details[] = (string) $entry['catatan'];
    if (count($details) > 0) $text .= ' — ' . implode(', ', $details);
    return $text;
}

/** "2026-08" -> "Agustus 2026". */
function exportMatrixPeriodeLabel(string $periode): string {
    if (!preg_match('/^(\d{4})-(0[1-9]|1[0-2])$/', $periode, $m)) return $periode;
    return (EXPORT_MATRIX_BULAN[$m[2]] ?? $m[2]) . ' ' . $m[1];
}

/**
 * PHP port of buildTrainerMatrix(): pure rows builder over raw stored
 * payloads. Returns {periode, dates, rows} shaped exactly like the JS
 * builder so renderExportMatrix() and the client share one shape.
 */
function buildExportMatrix(array $absensiPengajar, array $sekolah, array $trainer, string $periode): array {
    $trainersById = [];
    foreach ($trainer as $t) {
        if (!is_array($t) || !isset($t['id'])) continue;
        $trainersById[(string) $t['id']] = $t;
    }
    $schoolsById = [];
    foreach ($sekolah as $s) {
        if (!is_array($s) || !isset($s['id'])) continue;
        $schoolsById[(string) $s['id']] = $s;
    }

    $scoped = array_values(array_filter(
        $absensiPengajar,
        static fn($r) => is_array($r) && ($r['periode'] ?? null) === $periode
    ));
    $current = exportMatrixCurrent($scoped);

    // Server/client display-line parity (mirror of the
    // buildTrainerMatrix seenDisplayLines guard): data stays untouched,
    // only byte-identical display lines collapse per cell (first wins).
    // The key is scoped by trainerId (NOT record id): true
    // double-recordings (same person) still collapse, same-name distinct
    // persons do not.
    $cellsBySchoolDay = [];
    $seenDisplayLines = [];
    foreach ($current as $r) {
        $t = $trainersById[(string) ($r['trainerId'] ?? '')] ?? null;
        $peran = $r['peran'] ?? null;
        if ($peran === 'A') {
            $label = 'A';
        } elseif ($peran === 'I') {
            $label = 'I';
        } else {
            $label = ((is_array($t) ? ($t['tipePengajar'] ?? null) : null) === 'asisten') ? 'A' : 'I';
        }
        $keterangan = $r['keterangan'] ?? null;
        if ($keterangan === '') $keterangan = null;
        $catatan = $r['catatan'] ?? null;
        if ($catatan === '') $catatan = null;
        $entry = [
            'nama' => (is_array($t) && isset($t['nama']) && $t['nama'] !== '') ? (string) $t['nama'] : 'Trainer tidak ditemukan',
            'label' => $label,
            'status' => $r['status'] ?? null,
            'keterangan' => $keterangan,
            'catatan' => $catatan,
            // Person identity rides along (never rendered): two distinct
            // trainers sharing a display name must not collapse.
            'trainerId' => (string) ($r['trainerId'] ?? ''),
        ];
        $lineKey = ((string) ($r['sekolahId'] ?? '')) . '|'
            . ((string) ($r['trainerId'] ?? '')) . '|'
            . ((string) ($r['tanggal'] ?? '')) . '|'
            . exportMatrixCellText($entry);
        if (isset($seenDisplayLines[$lineKey])) continue;
        $seenDisplayLines[$lineKey] = true;
        $key = ((string) ($r['sekolahId'] ?? '')) . '|' . ((string) ($r['tanggal'] ?? ''));
        $cellsBySchoolDay[$key][] = $entry;
    }
    foreach ($cellsBySchoolDay as &$entries) {
        usort($entries, static fn($a, $b) => exportMatrixNameCompare((string) $a['nama'], (string) $b['nama']));
    }
    unset($entries);

    $parts = explode('-', $periode);
    $daysInMonth = cal_days_in_month(CAL_GREGORIAN, (int) ($parts[1] ?? 1), (int) ($parts[0] ?? 1970));
    $dates = [];
    for ($d = 1; $d <= $daysInMonth; $d++) $dates[] = sprintf('%s-%02d', $periode, $d);

    $schoolIds = [];
    foreach ($current as $r) {
        $sid = (string) ($r['sekolahId'] ?? '');
        if ($sid !== '' && !in_array($sid, $schoolIds, true)) $schoolIds[] = $sid;
    }
    $rows = [];
    foreach ($schoolIds as $sid) {
        $cells = [];
        foreach ($dates as $d) $cells[$d] = $cellsBySchoolDay[$sid . '|' . $d] ?? [];
        $rows[] = [
            'sekolahId' => $sid,
            'nama' => (isset($schoolsById[$sid]['nama']) && $schoolsById[$sid]['nama'] !== '') ? (string) $schoolsById[$sid]['nama'] : 'Sekolah tidak ditemukan',
            'cells' => $cells,
        ];
    }
    usort($rows, static fn($a, $b) => exportMatrixNameCompare((string) $a['nama'], (string) $b['nama']));

    return ['periode' => $periode, 'dates' => $dates, 'rows' => $rows];
}

/**
 * Split a month's dates into printable blocks: at 8pt a date column
 * needs ~50px to wrap at word boundaries, so 31 columns can never fit
 * one A4-landscape width readably. Blocks of ≤16 days stack vertically
 * (each a complete table with repeated NO + NAMA SEKOLAH) instead of
 * one clipped-or-spilling giant — the builder's one-month shape is
 * untouched, only the render paginates (design: landscape pagination
 * rule, builder's call).
 */
function exportMatrixChunks(array $dates, int $maxCols = 16): array {
    if ($maxCols < 1) $maxCols = 16;
    if (count($dates) <= $maxCols) return [$dates];
    return array_chunk(array_values($dates), $maxCols);
}

/**
 * Render one date block (complete table: NO + NAMA SEKOLAH + two-row
 * weekday/date header + one row per school).
 */
function renderExportMatrixBlock(array $rows, array $dates): string {
    $h = 'exportMatrixEscape';
    $dayCells = '';
    $numCells = '';
    foreach ($dates as $d) {
        $ts = strtotime(((string) $d) . 'T00:00:00');
        $hari = ($ts === false) ? '' : (EXPORT_MATRIX_HARI[((int) date('N', $ts)) - 1] ?? '');
        $num = ltrim(substr((string) $d, 8, 2), '0');
        $dayCells .= '<th title="' . $h($d) . '">' . $h($hari) . '</th>';
        $numCells .= '<th title="' . $h($d) . '">' . $h($num === '' ? '0' : $num) . '</th>';
    }

    $bodyRows = '';
    $no = 1;
    foreach ($rows as $r) {
        if (!is_array($r)) continue;
        $cells = '';
        foreach ($dates as $d) {
            $entries = (is_array($r['cells'] ?? null) ? ($r['cells'][(string) $d] ?? []) : []);
            $divs = '';
            if (is_array($entries)) {
                foreach ($entries as $e) {
                    if (!is_array($e)) continue;
                    $divs .= '<div>' . $h(exportMatrixCellText($e)) . '</div>';
                }
            }
            $cells .= '<td>' . $divs . '</td>';
        }
        $bodyRows .= '<tr>'
            . '<td class="x-no">' . $h($no++) . '</td>'
            . '<td class="x-school">' . $h($r['nama'] ?? '') . '</td>'
            . $cells . '</tr>';
    }

    return '<table class="x-table">'
        . '<thead><tr><th rowspan="2" style="width:22px">NO</th><th rowspan="2" style="width:120px">NAMA SEKOLAH</th>'
        . $dayCells . '</tr><tr>' . $numCells . '</tr></thead>'
        . '<tbody>' . $bodyRows . '</tbody></table>';
}

/**
 * Render the standalone attendance-matrix document (shell + tables).
 *
 * $matrix: buildExportMatrix() output {periode, dates, rows}.
 * $opts: heading (school line, default 'Semua Sekolah'), footer note.
 */
function renderExportMatrix(array $matrix, array $opts = []): string {
    $periode = (string) ($matrix['periode'] ?? '');
    $dates = (is_array($matrix['dates'] ?? null)) ? array_values($matrix['dates']) : [];
    $rows = (is_array($matrix['rows'] ?? null)) ? $matrix['rows'] : [];
    $periodeLabel = exportMatrixPeriodeLabel($periode);
    $heading = (string) ($opts['heading'] ?? 'Semua Sekolah');

    if (count($rows) === 0) {
        $tableHtml = '<table class="x-table">'
            . '<thead><tr><th style="width:22px">NO</th><th style="width:120px">NAMA SEKOLAH</th></tr></thead>'
            . '<tbody><tr><td colspan="2" style="text-align:center;padding:24px 8px;color:#94a3b8">'
            . 'Belum ada absensi tenaga pengajar untuk periode ini.</td></tr></tbody></table>';
    } else {
        $blocks = [];
        foreach (exportMatrixChunks($dates) as $chunk) {
            $blocks[] = renderExportMatrixBlock($rows, $chunk);
        }
        $tableHtml = implode('<div style="height:10px"></div>', $blocks);
    }

    return renderExportShell([
        'title' => 'Rekap Absensi Pengajar — ' . $periodeLabel,
        'kicker' => 'REKAP ABSENSI PENGAJAR',
        'heading' => $heading,
        'meta' => ['Periode ' . $periodeLabel . ' (' . $periode . ') — ' . count($rows) . ' sekolah'],
        'bodyHtml' => $tableHtml,
        'footer' => (string) ($opts['footer'] ?? ''),
    ]);
}
