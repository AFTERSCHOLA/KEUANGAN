# Penugasan Slot Milestones — Microtask Chain (PS.A → PS.B)

**Companion to `docs/PENUGASAN_SLOT_PLAN.md`.** Decomposes the per-assignment HARI/JAM scope into strictly ordered microtasks. Each microtask must VERIFY before the next begins; a failing check becomes a bounded follow-up, not a widened edit (taste #3/#4). Later work does not start until gates pass.

**Source of truth for findings/decisions:** `PENUGASAN_SLOT_PLAN.md` §3 (F-PS1–F-PS4) and §4 (D-PS1–D-PS7). The chain below does not restate plan prose; each `FINDS`/`RULES` line cites the registry. Violated invariant for the whole chain (taste bug rule, one hypothesis): *a scoped trainer fans out to every same-weekday slot because the assignment carries no weekday/time to filter on* — F-PS1/F-PS2; PS.A–PS.B is the single slice that tests it.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-PS references>
  RULES:   <R-PS codes + existing invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

**Gate exit criteria (the chain closes when all hold):**

1. Scoped assignment (`hari` + `jamMulai`/`jamSelesai`) persists and validates; unscoped (`null`) rows behave byte-identically to today (F-PS1 closed, D-PS2/D-PS5).
2. Manager offers only the picked school's `jadwalList` vocabulary; out-of-vocabulary times rejected with pinned copy (D-PS3).
3. Daily view for a picked `Tanggal` lists exactly `(assignments valid that date × slots matching weekday AND scope triple)`; a 2-slot school with a scoped assignment shows 1 row, unscoped shows 2 (D-PS4).
4. Old rows without the triple stay valid on client and server (backward compat, idempotent re-run).
5. No role can read/write outside its §9 boundary; trainer assignment-write stays 403 (D-PS7).
6. `npx playwright test tests/penugasan*.spec.js --workers=1` green with zero pageerror/console-error; full regression + `npm run build` green; unrelated failures labeled pre-existing with evidence (taste #9).
7. Every microtask carries `Verified: <command> -> <result>`; §11 write-back recorded; no `console.log` in `src/`, no build artifacts in `git status`.

---

## Gate PS.A — Schema + write UI (F-PS1–F-PS3; D-PS1–D-PS3, D-PS5–D-PS7)

### PS.A.1 Add slot-scope schema

```text
MICROTASK: Add slot-scope schema
  EDIT:    src/lib/penugasan.js (extend newPenugasanRow + validateRowDates with hari/jamMulai/jamSelesai triple),
           server/validation/entities.php (nullable triple gates + school-vocabulary check),
           server/tests/entity.validation.php (new triple cases),
           src/lib/__tests__/penugasan-slot.test.js (new, unit pins triple validation)
  FINDS:   F-PS2, F-PS3; D-PS1, D-PS2, D-PS3, D-PS5
  RULES:   R-PS1, R-PS4, R-PS6; missing keys read as null (unscoped); jamMulai/jamSelesai both null or both HH:MM with selesai > mulai; hari null forces times null; non-null triple must equal a jadwalList entry for that sekolahId; old rows without triple stay valid; no renames, no new entities
  DEPENDS: none
  OUTCOME: the validator accepts a scoped row, rejects out-of-vocabulary times, and still accepts legacy rows without the triple.
  VERIFY:  php server/tests/entity.validation.php + npx vitest run src/lib/__tests__/penugasan-slot.test.js -> scoped Rabu 14:15-15:15 accepted; 14:15-15:15 on a school with no such slot rejected with pinned copy; selesai<=mulai rejected; legacy row with no hari/jam keys accepted as unscoped
  DONE-IF: verify passes; only intended files changed
```

### PS.A.2 Scope assignments in manager

```text
MICROTASK: Scope assignments in manager
  EDIT:    src/features/penugasan/PenugasanManager.jsx (Hari + Jam Mulai/Selesai controls + Slot column),
           tests/penugasan-slot-manage.spec.js (new, persists per taste #16)
  FINDS:   F-PS1, F-PS2; D-PS2, D-PS3, D-PS5, D-PS6, D-PS7
  RULES:   R-PS1, R-PS2, R-PS3, R-PS5, R-PS7; mirror Tambah Penugasan modal idiom, classNames verbatim; Hari select defaults Semua hari; time inputs type=time disabled when Hari is Semua hari; Slot column shows Semua slot or Hari · HH:MM–HH:MM; Indonesian copy pinned (Hari / Jam Mulai / Jam Selesai / Semua hari / Semua jam / Semua slot / Simpan / Batal / Belum ada penugasan.); version carried, 409 surfaces re-read copy; deploy/ untouched
  DEPENDS: PS.A.1
  OUTCOME: an admin creates one Rabu 14:15-15:15 scoped assignment and it persists across refresh with the Slot cell showing the scope.
  VERIFY:  npx playwright test tests/penugasan-slot-manage.spec.js --workers=1 -> admin picks school with 2 Rabu slots, sets Hari=Rabu + 14:15-15:15, saves, refresh, Slot cell reads Rabu · 14:15–15:15 and readCached('trainer') row carries the exact triple; out-of-vocabulary time blocked with pinned copy; zero pageerror
  DONE-IF: verify passes; only intended files changed
```

---

## Gate PS.B — Derivation + hardening + write-back (F-PS1, F-PS4; D-PS4–D-PS7)

### PS.B.1 Filter timetable by scope

```text
MICROTASK: Filter timetable by scope
  EDIT:    src/lib/penugasan.js (extend buildDailyTimetable slot predicate per D-PS4),
           src/lib/__tests__/penugasan-timetable.test.js (extend, scoped cases),
           tests/penugasan-slot-timetable.spec.js (new, persists per taste #16)
  FINDS:   F-PS1; D-PS4, D-PS5
  RULES:   R-PS1, R-PS2, R-PS4, R-PS6; exact string equality only (!hari || slot.dayOfWeek === hari) && (!jamMulai || slot.time === jamMulai) && (!jamSelesai || slot.endTime === jamSelesai); zero matches yields zero rows for that assignment; deterministic order sekolahNama → waktu → trainerId unchanged; unscoped rows expand exactly as before (PG regression)
  DEPENDS: PS.A.2
  OUTCOME: picking the scoped weekday lists 1 row for the scoped assignment where the unscoped control lists 2.
  VERIFY:  npx vitest run src/lib/__tests__/penugasan-timetable.test.js + npx playwright test tests/penugasan-slot-timetable.spec.js --workers=1 -> seeded school with 2 Rabu slots (14:00, 14:15) + one assignment scoped Rabu 14:15-15:15 yields exactly 1 row with Waktu 14:15–15:15; unscoped twin yields 2 rows; other weekday yields zero; zero pageerror
  DONE-IF: verify passes; only intended files changed
```

### PS.B.2 Harden and write back

```text
MICROTASK: Harden slot chain and write back
  EDIT:    tests/penugasan-slot-*.spec.js (keep as regression per taste #16; remove any one-off debug specs),
           docs/PENUGASAN_SLOT_PLAN.md + docs/PENUGASAN_SLOT_MILESTONES.md (Verified lines + status),
           docs/SCOPE_EXPANSION_MILESTONES.md (append closure row only — no renumbering of the existing chain),
           docs/PENUGASAN_PLAN.md (note R-PG4 lift scope in §10 only — no PG history rewrite)
  FINDS:   F-PS1–F-PS4
  RULES:   R-PS6, R-PS7; full loop npm test + npx playwright test tests/penugasan*.spec.js --workers=1 + existing tests/trainer-attendance*.spec.js + php server/tests/entity.validation.php + php server/tests/endpoint.protection.php + npm run build; unrelated failures labeled pre-existing with git-stash evidence (taste #9); re-run original acceptance (PS.A.2 scoped-save leg + PS.B.1 1-vs-2 leg) before declaring done (taste #10); no console.log in src/ (grep gate), git status clean of artifacts; deploy/ only via npm run build:deploy (HARD parity gate)
  DEPENDS: PS.B.1
  OUTCOME: the chain is regression-pinned and the source docs reflect what actually shipped.
  VERIFY:  npm test -> green; npx playwright test tests/penugasan*.spec.js tests/trainer-attendance*.spec.js --workers=1 -> green zero pageerror; npm run build -> green; php server/tests/entity.validation.php + php server/tests/endpoint.protection.php -> green (legacy unscoped rows still valid); node -e ID check -> every F-PS/D-PS/R-PS cited below exists in PENUGASAN_SLOT_PLAN.md
  DONE-IF: verify passes; only intended files changed
```

---

## Ordering rationale

- **PS.A.1 before PS.A.2:** the triple must validate (including legacy acceptance) before the UI can offer it; the UI spec is the falsifiable check for the schema hypothesis, not a second feature.
- **PS.A before PS.B:** derivation filters on stored scope; building the filter first would be unverifiable against rows that cannot yet persist scope (taste: smallest slice that runs end-to-end, falsifiable).
- **PS.B.1 before PS.B.2:** row-equality (1-vs-2) is the strong claim; hardening serializes it. Strong first.
- **PS.B.2 last:** regression + build + write-back only after every behavior above is green.

## Deferred with owners

| Item | Owner / venue | Why deferred |
|---|---|---|
| Slot-scoped attendance gating | Business sign-off + `TrainerAttendanceForm.jsx` thread | Would change R-TA8; display-only in this chain |
| Slot-scoped honor weighting | Finance chain + explicit business rule | Would change D-TA14; needs tariff source |
| Interval-overlap matching | Future plan amendment | YAGNI; exact equality is falsifiable now |
| Cross-school slot picker | Future plan amendment | Breaks host-payload model (D-PS1) |

## Completion contract

```text
slot-scope schema -> scoped manager save -> scoped timetable filter
  -> regression + build + write-back
```

Every arrow has a `Verified: <command> -> <result>` line before the chain closes. Dead code/orphan probes are purged at PS.B.2 (taste quality gate), not left as follow-ups.
