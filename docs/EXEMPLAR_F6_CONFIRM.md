# Exemplar F6 Owner Confirm — School-Name Alias Checklist

**Status:** OPEN 2026-09-26 — awaiting field-data owner sign-off; G5 arithmetic fix (-850k) recorded in `docs/EXEMPLAR_MIGRATION.md` alongside this checklist.
**Trigger:** `docs/EVALUATION_LOG.md` F6 — school names matched on typo patterns, not explicit confirmation (e.g. `SD Al-Irham` = `SD Al-Irhaam` inferred).
**Position:** temporary single-doc checklist (taste #69 short task). It does **not** replace `docs/EXEMPLAR_MIGRATION.md` (D8/G2 canonical map stays authoritative). On sign-off, §4 writes the verdict back to `EXEMPLAR_MIGRATION.md` F6 and this file is folded or retired.

## 1. Risk (one sentence)

If any alias row below is actually a distinct school, student/billing/honor rows are already attached to the wrong canonical record in `afterschola_t3_test`.

## 2. Canonical map under review (D8/G2 — 20 records, BDG)

| Canonical (DB `nama`) | Aliases seen in exemplar sheets | Owner verdict |
|---|---|---|
| SMP Tridaya | SMP Tridaya Tunas Bangsa | ☐ same / ☐ distinct |
| SMPIT Al-Irsyad | — | ☐ confirmed |
| SD Sains Al-Biruni (single record, 2 slots) | SD & SMP Sains Al-Biruni; SMP Sains Al-Biruni / SMP Sains Al-BIruni | ☐ same / ☐ split SMP separately |
| SD Istiqamah | — | ☐ confirmed |
| SD Daarut Tauhid | SD Daarut Tauhiid | ☐ same / ☐ distinct |
| SD Tridaya | SD Tridaya Tunas Bangsa | ☐ same / ☐ distinct |
| SMP Istiqamah | — | ☐ confirmed |
| SMP Bintang Madani | — | ☐ confirmed |
| SDM 3 Bandung | — | ☐ confirmed (0 students, no sheet) |
| SD Al-Azhar Cairo Bandung | SD Al-Azhar Cairo | ☐ same / ☐ distinct |
| SMPIT Ann'imah | SMPIT Annimah | ☐ same / ☐ distinct |
| SDM 7 Bandung | — | ☐ confirmed |
| SDIT Anni'mah | SDIT Annimah | ☐ same / ☐ distinct |
| SDN 037 Sabang | — | ☐ confirmed |
| SMPN 18 Bandung | SMPN 18 Kota Bandung | ☐ same / ☐ distinct |
| SMP Salman Al-Farisi | — | ☐ confirmed |
| SMA Al-Irsyad | SMAIT Al-Irsyad | ☐ same / ☐ distinct |
| SD Darul Hikam 2 | — | ☐ confirmed |
| MA Al-Mashduqi Garut | — | ☐ confirmed (tariff only, no attendance) |
| SD Al-Irhaam Global Islamic School | SD Al-Irhaam; SD Al-Irham | ☐ same / ☐ distinct — **highest risk** |

## 3. How to verify (falsifiable, read-only)

```text
Verified: mysql COUNT BDG sekolah -> 20; siswa 397; trainer 18
Verified: SELECT nama FROM sekolah WHERE cabang_id='cbg-BDG-bandung' ORDER BY nama -> list matches column 1 above
Unverified: field-owner confirmation per row above (name the person + date when signed)
```

Do **not** merge/split records until every ☐ above is resolved. A `distinct` verdict needs a new canonical record + data move plan (separate microtask, idempotent per taste #35) — not a silent rename.

## 4. Write-back contract (taste #43)

On sign-off: update `EXEMPLAR_MIGRATION.md` F6 line with `Confirmed <date> by <owner>: <same|distinct per school>` + keep this file's table as evidence; if any `distinct`, open a data-move microtask instead of editing in place. Do not expand the long-term plan.
