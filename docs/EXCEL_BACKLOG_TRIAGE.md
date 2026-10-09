# Backlog Triage — genuinely-missing Excel rows

**Goal:** sequence every Excel row that is still honestly `Belum`/`On Progress` after Gates EG + G-E2-FU, with owner artifact + effort, so each becomes exactly one executable slice.
**Falsifiable check:** every row below names either a docs artifact in `docs/` or an explicit Decision not to build; rows closed by Gates EG are not repeated here.

## Sequence (value × effort, cheapest first)

| Order | Excel row | Missing | Proposed artifact (owner) | Effort | Type |
|-------|-----------|---------|---------------------------|--------|------|
| 1 | #10 ERD | Diagram (schema.sql exists, diagram doesn't) | `docs/DATABASE_ERD.md` (mermaid, generated from schema.sql) — DONE Gate B1 | S | docs |
| 2 | #43 maintenance | Schedule | OPERATIONS §5 `Jadwal maintenance` table (backup-verify monthly, dep audit quarterly, log rotate) | S | docs | ✅ DONE 2026-10-07 → `OPERATIONS.md` §7 (row 43 `Selesai`) |
| 3 | #37 go-live + #38 support | Templates | `docs/GO_LIVE_CHECKLIST.md` (announcement template + penerima + standby rota + incident pointer) | S | docs | ✅ DONE 2026-10-07 → row 37 `Selesai (template)`, row 38 `On Progress (rota needs names/dates)` |
| 4 | #12 wireframe | Decision needed | DECISION: no new Figma; ground-truth screenshots per tab + pinned idioms (already in IMPLEMENTATION_PLAN M4). Record decision, close row. | S | decision |
| 5 | #30 UAT | Sign-off sheet | `docs/UAT_SIGNOFF.md` (per-role script from CLIENT_ROUND + tanda tangan + tanggal) | S | docs |
| 6 | #11 flowcharts | 4 diagrams | Mermaid in `docs/FLOWS.md`: SPP→pelunasan, absensi→verifikasi, raport→verifikasi, penugasan→cover | M | docs |
| 7 | #6/#7 SRS + approval | Formal SRS | Promote `SRS_INDEX.md` → `SRS.md` (tambah §tujuan/ruang lingkup + tabel sign-off stakeholder) | M | docs |
| 8 | #28 browser matrix | Compat table | `docs/COMPAT_MATRIX.md` (Chrome/Edge desktop+Android, viewport, print) + one Playwright smoke across viewports | M | docs+test |
| 9 | Medium finding: version-less `sekolah.php` update | Lost-update parity | Route `sekolah.php` update through version check (`_master.php:122-152` pattern) + stale-409 leg | M | code+test |
| 10 | #26 security testing | Harness | `server/tests/` authz battery already exists; ADD rate-limit/CSRF-matrix doc + OWASP checklist runbook | M | docs |
| 11 | #14 design review | Log | One review session against #10/#11/#12 outputs + log approval di `docs/` | M | process |
| 12 | #27 performance | Load plan | k6/JMeter script OR documented manual scenario (1000 transaksi) + thresholds | L | test |
| 13 | #25 integration matrix | Matrix doc | Formal table of module pairs + owning suites (mostly exists via contract battery; write the matrix) | S | docs |

## Explicitly NOT built (decisions, taste #65 YAGNI)

- Native mobile app (#19/#28-mobile/#34b): web+PWA only, decided in Revisi.
- Bank/payroll/accounting integration (#5/#21-bank): tetap tanpa, decided in Revisi.
- New Figma system (#12): screenshots + idioms suffice.

## Next slice after B1

Orders 2+3 (OPERATIONS §5 + GO_LIVE_CHECKLIST) — both S, both unblock Post-Event rows #37/#38/#43 in one pass.
