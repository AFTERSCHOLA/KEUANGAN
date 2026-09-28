# Double-Booking Cross-Host Plan — Same Person, Same School+Slot, Two Hosts

**Status:** DRAFT 2026-09-28 — Gates DB.A open (no Verified lines yet; see `docs/DOUBLE_BOOKING_MILESTONES.md`).
**Position:** Temporary scope-expansion chain per taste #40. It does **not** replace `IMPLEMENTATION_PLAN.md`, `SCOPE_EXPANSION_PLAN.md`, `SCOPE_EXPANSION_PRIVILEGES.md`, `TRAINER_ATTENDANCE_PLAN.md` / `TRAINER_ATTENDANCE_MILESTONES.md`, `PENUGASAN_PLAN.md` / `PENUGASAN_MILESTONES.md` (Gate PG.D closed 2026-09-28, same-host guard), `PENUGASAN_SLOT_PLAN.md`, `AUTO_PENUGASAN_PLAN.md`, or `COVER_SLOT_PLAN.md` / `COVER_SLOT_MILESTONES.md`. It extends PG.D across host payloads via re-plan, not a silent widening of `validateNoOverlappingAssignments`. When Gate DB.A closes, §11 records completion back on the source docs.
**Contract order:** `docs/UNIVERSAL.md` (primary contract, read first) → `docs/IMPLEMENTATION_PLAN.md` Part 2 → `docs/SCOPE_EXPANSION_PLAN.md` + `docs/SCOPE_EXPANSION_PRIVILEGES.md` (scope-expansion first-reads) → `docs/PENUGASAN_PLAN.md` §3 (F-PG5) + §4 (D-PG9) + §6 (R-PG8) → `docs/PENUGASAN_MILESTONES.md` Gate PG.D → `docs/COVER_SLOT_PLAN.md` §4 (D-CS2 cover path) → this file.

---

## 1. Context and inputs

- PG.D (F-PG5; D-PG9; R-PG8) shipped the same-host guard: `validateNoOverlappingAssignments()` pairwise over the saved full-array payload (`server/lib/assignments.php:219-250`), hooked in `server/api/trainer.php:149-157` (422), mirrored client-side by `findOverlappingPair()` (`src/lib/penugasan.js:126-150`) pre-checked in `PenugasanManager.save()` (`src/features/penugasan/PenugasanManager.jsx:234-240`). Recorded scope decision: **same-host payload only** (`trainer.php:151`, `PENUGASAN_PLAN.md` D-PG9, `PENUGASAN_PLAN.md` §10 deferred row).
- Team Bug 7 ("same day and time can still be entered") survives across hosts: instructor A holds an aktif row for `sekolah X + slot S + dates D`; instructor B's payload gains a row putting **the same person** (as `trainerId`, `asistenId`, or inside `asistenIds[]`) at `X + S + overlapping D`. Neither payload is internally duplicated, so both writes 422-clean today.
- Person identity is already a union everywhere else: `penugasanInvolvesTrainer()` (`penugasan.js:184-190`) and the assignment gate (`server/auth/authorize.php:82-89`) both read `trainerId ∪ asistenId ∪ asistenIds[]`. The guard is the only place that never consults it.
- Cross-payload scans have precedent and need no new infra: the assignment gate itself loads every trainer payload (`authorize.php:67`), as do `read.php:81` and `entities.php:117`.
- The slot predicate is shared byte-identically in three places (`hasOverlappingActiveAssignment`, `validateNoOverlappingAssignments`, `buildDailyTimetable`): exact triple equality, unscoped (`[null,null,null]`) fans out over the same school, YAGNI no interval matching. The cross-host gate reuses it, never invents a fourth predicate.
- Cover rows share their origin scope by design (D-CS2; `coverScopeOverlaps` in `entities.php:150`, origin lookup `findAssignmentById` in `entities.php:116`) and are excluded from PG.D pairwise checks on both layers. A cross-host scan that forgets this exclusion would 422 every legitimate cover (origin and cover live on different hosts by construction).

## 2. Goals and non-goals

**Goals**

1. A manual save that would put the same person on the same `sekolahId` + slot scope + overlapping dates via two different host payloads is rejected with the existing pinned copy, client pre-check + server 422, same predicate both layers.
2. The occupant model is the existing union (`trainerId ∪ asistenId ∪ asistenIds[]`, externals included — `entities.php:254` lets `asistenIds` reference externals).
3. Cover-linked pairs never block, in either direction, same-host or cross-host.
4. Branch authority unchanged: the scan is branch-scoped, session-driven, never client-driven.

**Non-goals (stay out of this chain)**

- Slot-capacity semantics (any two people, same slot → block). That forbids legitimate co-teaching and needs business sign-off; the occupant reading is the conservative extension of PG.D. Recorded as considered-and-rejected in D-DB1.
- Auto-create hardening (`ensureAssignment` / `missingAssignmentLinks`). Manual update path only; see §10.
- Per-assignment time overrides, weekday enforcement on attendance, audit-log viewer — owned elsewhere, unchanged.
- Copy changes: the pinned copy is reused verbatim, not reworded.

## 3. Findings registry (F-DB)

| ID | Finding | Evidence |
|---|---|---|
| F-DB1 | **Cross-host overlap passes clean.** Both guard layers loop pairs inside one payload only. | `assignments.php:219-250` (`$rows` = one payload); `trainer.php:149-157` (hook on `$data['penugasanPengajar']` only, `:151` "Same-host payload only"); `penugasan.js:126-150`; `PenugasanManager.jsx:237` (`next` = one host) |
| F-DB2 | **Guard never consults the person union.** Same person as instructor on host A + assistant on host B is invisible to it. | Union defined `penugasan.js:184-190` + `authorize.php:82-89`; zero refs to it from `validateNoOverlappingAssignments` / `findOverlappingPair` |
| F-DB3 | **Cross-payload scan pattern exists.** No new table, index, or endpoint needed. | `authorize.php:67` (`SELECT payload FROM trainer` full scan); `read.php:81`; `entities.php:117` |
| F-DB4 | **Slot predicate is shared 3× and must stay one.** A fourth interpretation (interval matching, partial scope overlap) would diverge silently. | `assignments.php:243-245` vs `penugasan.js:143-145` vs `penugasan.js:230-233` (exact triple, unscoped fans out) |
| F-DB5 | **Cover exclusion must ride along.** Origin and substitute live on different hosts; a naive scan 422s every legal cover. | `entities.php:116` (`findAssignmentById`), `:150` (`coverScopeOverlaps`); exclusions `assignments.php:231-235` + `penugasan.js:134-136` |
| F-DB6 | **Branch authority is session-only.** A scan that reads other branches leaks scope and breaks the privilege matrix. | `trainer.php:42-61` (cabangId never trusted from client); `PENUGASAN_PLAN.md` §9 matrix |

## 4. Decision set (D-DB)

| # | Decision | Status |
|---|---|---|
| D-DB1 | **Occupant-overlap (concrete pick).** Two rows conflict iff: same `sekolahId` + both `aktif` + intersecting `periodeMulai..periodeSelesai` (open end = `9999-12-31`) + same slot scope (exact triple; unscoped fans out) + **occupant sets intersect** (occupants = `{trainerId} ∪ {asistenId} ∪ asistenIds[]`, nulls dropped). Considered-and-rejected: slot-capacity (any two rows, same slot → block) — forbids co-teaching, bigger semantic change, needs business sign-off. | Locked |
| D-DB2 | **Predicate byte-identical to PG.D except the occupant leg.** Date intersection, slot triple, same-id skip, cover-linked skip all reused verbatim. The only new leg is D-DB1 occupant intersection. No interval matching (YAGNI, shared with D-CS2/D-PG9). | Locked |
| D-DB3 | **Server authoritative cross-host scan (concrete pick).** In `trainer.php` update path, after the PG.D same-host gate, before `masterWrite`: load `SELECT id, cabang_id, payload FROM trainer WHERE cabang_id = :cabang` where `:cabang` = the host record's branch (existing row's `cabang_id` for update; session `cabangId` for create), collect every other host's `penugasanPengajar[]`, test each saved row against each foreign row under D-DB1/D-DB2. First conflict → same 422 + pinned copy. Same-branch bound keeps it to hundreds of rows (existing scale assumption, IMPLEMENTATION_PLAN.md D9). | Locked |
| D-DB4 | **Client pre-check mirrors (concrete pick).** New pure `findCrossHostPair(nextRows, otherHostsRows)` in `src/lib/penugasan.js` (same predicate as D-DB3); `PenugasanManager.save()` runs it over the cached trainers list (`trainerById`, already loaded) after the PG.D `findOverlappingPair(next)` check, surfaces the same pinned copy before `writeRemote`. Server still authoritative (taste #61). | Locked |
| D-DB5 | **Cover + edit exclusions ride along (concrete pick).** Same-id pairs never block; pairs linked by `coverOf` in either direction never block (id→row map built over saved + foreign rows; dangling `coverOf` falls back to `findAssignmentById` semantics — fails closed, never blocks on unresolvable link). Inactive rows, disjoint ranges, different `sekolahId`, different slot scope never block. | Locked |
| D-DB6 | **Pinned copy reused verbatim.** `Penugasan ganda: sekolah dan waktu yang sama sudah terisi pada rentang tanggal ini.` — the `PENUGASAN_OVERLAP_ERROR` constant and the PHP `$err` string stay identical so existing tests/selectors keep matching. | Locked |
| D-DB7 | **Edit path stays unblocked (concrete pick).** Re-saving an unchanged payload (map-replace by id, `PenugasanManager.jsx:199`) never 422s: own rows match by id and skip. Deactivation (`aktif=false`) unblocks by definition. | Locked |

## 5. Data model (restatement, no change)

```text
penugasanPengajar[] on trainer.payload (host = instruktur record):
{ id, sekolahId, trainerId (= host id), asistenId: null | id,
  asistenIds: null | [id] (max 2, may reference externals),
  coverOf: null | assignmentId, cabangId,
  hari: null | day, jamMulai: null | HH:MM, jamSelesai: null | HH:MM,
  periodeMulai: "YYYY-MM-DD", periodeSelesai: null | "YYYY-MM-DD",
  aktif: true | false }

occupants(row) = {trainerId, asistenId} ∪ asistenIds[] minus nulls
conflict(a, b) = same sekolahId ∧ both aktif ∧ dateRangesIntersect
                 ∧ slotScopesEqualOrUnscoped ∧ occupantsIntersect
                 ∧ ids differ ∧ not cover-linked
```

No new fields, no renamed fields, no per-assignment time (IMPLEMENTATION R8 / R-PG4 analogue).

## 6. Rules (R-DB)

- **R-DB1** One concern per edit: server scan, client pre-check, specs are separate microtasks; never restyle while fixing logic; classNames move verbatim.
- **R-DB2** Mirror, don't invent (taste #11): compose `validateNoOverlappingAssignments` / `findOverlappingPair` / `penugasanInvolvesTrainer` / `coverScopeOverlaps` / `findAssignmentById` predicates; no fourth slot predicate.
- **R-DB3** Indonesian copy pinned (§7, D-DB6); tests select by the exact string.
- **R-DB4** Schema verbatim (IMPLEMENTATION R8): no new fields. If the occupant model is wrong, raise it — don't silently extend rows.
- **R-DB5** Concurrency respected: `version` / 409 path untouched; the scan reads pre-write state, `masterWrite` still wins races loudly, never silently.
- **R-DB6** Verification language `Verified: <command> -> <result>` / `Unverified:` (UNIVERSAL); every microtask has one OUTCOME + one falsifiable VERIFY (taste #2); narrowest check runs immediately after the first edit (taste #4/#6).
- **R-DB7** `deploy/` only via `npm run build:deploy` (taste #71, HARD parity #72). Hygiene gate: no `console.log` in `src/`, no build artifacts in `git status` (taste #20).

## 7. UI concept (pinned copy)

No new UI. The existing `PenugasanManager` error surface (`showError`) displays the reused copy on cross-host pre-check hits; the dialog stays open and nothing persists — identical behavior to the PG.D same-host rejection. No new buttons, labels, or styles.

## 8. Alignment table — verify-the-verification gate (taste #68)

| Finding | Confirmed by docs (file/section) | Not documented / implied | Disposition in this chain |
|---|---|---|---|
| F-DB1 cross-host passes | `trainer.php:151` ("Same-host payload only"); `PENUGASAN_PLAN.md` D-PG9 + §10 deferred row ("Cross-host asisten double-booking … Future plan amendment") | Cross-host server scan never specified | New build: DB.A (this chain owns it via re-plan) |
| F-DB2 union never consulted | `penugasan.js:184-190`; `authorize.php:82-89`; zero guard refs | Occupant model for the guard never picked | New pick: D-DB1 |
| F-DB3 scan precedent | `authorize.php:67`; `read.php:81`; `entities.php:117` | Branch-scoped guard scan never written | New build: D-DB3 |
| F-DB4 shared slot predicate | `assignments.php:243-245`; `penugasan.js:143-145,230-233` | Cross-host reuse never stated | Pinned: D-DB2 |
| F-DB5 cover exclusion | `entities.php:116,150`; `COVER_SLOT_PLAN.md` D-CS2 | Cross-host cover exclusion never stated | Pinned: D-DB5 |
| F-DB6 branch authority | `trainer.php:42-61`; `PENUGASAN_PLAN.md` §9 | Scan branch bound never stated | Pinned: D-DB3 (same-cabang bound) |

## 9. Access model (explicit, no broadening)

| Action | Superadmin | Admin Cabang | Trainer |
|---|---|---|---|
| Trigger cross-host check (normal save) | ✅ any branch (scan bound = host record's branch) | ✅ own branch only (session `cabangId` authority, `trainer.php:42-48`) | ❌ never (no assignment write, R-TA6) |
| Read other hosts' rows in scan | ✅ scan branch only (server-side, never returned to client) | ✅ own branch only | ❌ n/a |
| Server rule | bypass nothing; scan bound from stored `cabang_id` | `masterWrite` version/branch checks unchanged; nested `cabangId` match unchanged (`entities.php:176-194`) | `authorize.php:191-212` (write 403, no `correct` lane) |

The scan never widens readability: foreign rows are compared server-side and never echoed to the client beyond the existing 422 copy (taste #33).

## 10. Deferred with owners

| Item | Owner / venue | Why deferred |
|---|---|---|
| P1 — Link-add bypass (Bug 7 readings audit 2026-09-28). `ensureAssignment` hooks (`sekolah.php:228,269`, `users.php:264`) write via direct `UPDATE` and never call `validateNoOverlappingAssignments` (`trainer.php:153` is its only caller). Same-host dups are accidentally saved by the `hasOverlappingActiveAssignment` skip inside `missingAssignmentLinks`; cross-host / cross-school occupant dups minted here never see any guard | Future microtasks (DB.B in this pair, or appended to the docs owning the `ensure*` paths — `AUTO_PENUGASAN_*` / `COVER_SLOT_*` — per the owner's call; no new doc pair) | Smallest slice: manual update path is the reported bug and the only path PG.D ever gated. Widening `ensure*` to cross-host scans changes link-add semantics — explicit microtasks, not silent (R-DB4) |
| P2 — Cross-school same-person (Bug 7 readings audit 2026-09-28). Same occupant, same clock time, two `sekolahId`s. Both guard layers `continue` on `sekolahId` mismatch (`assignments.php:239`, `penugasan.js:138`), so a person in two schools at once is invisible to the entire guard | Future microtasks (DB.B predicate widening in this pair, or appended to `PENUGASAN_MILESTONES.md` — no new doc pair) | Needs one business confirmation first (is cross-school same-time ever legitimate, e.g. back-to-back sessions?) plus a clock-time compare the current triple-equality predicate has no leg for — a decision + predicate change, not a one-line fix |
| P5 — Clock-interval overlap with different time strings (Bug 7 readings audit 2026-09-28). 14:00–15:00 vs 14:30–15:30 passes: the shared predicate is exact-triple equality, never interval matching (YAGNI, shared with D-CS2/D-PG9) | Future plan amendment | Reachable only where a school defines clock-overlapping slots (picks are vocab-constrained via `validateSlotPick`); inventing interval semantics needs a vocab analysis first — explicit re-plan, not silent (R-DB4) |
| Slot-capacity semantics (one occupant per slot) | Business sign-off | Bigger semantic change; forbids co-teaching. Needs an explicit decision like TA.C.2b before any code |
| Per-assignment time overrides | Future plan amendment | Schema change; barred by R-DB4 |
| Stale-doc fix (`EVAL_FINANCE_PLAN.md` F-EF4 "generator still flat") | One-line doc edit | Taste #42; not this chain's scope — flagged, not built here (taste #13) |

## 11. Write-back contract (taste #32/#43, on DB.A close)

Record `Verified:` lines per microtask in `DOUBLE_BOOKING_MILESTONES.md`; mark Gate DB.A; append the closure row to `SCOPE_EXPANSION_MILESTONES.md` (append-only, no renumbering of the existing chain — this pair is the temporary gate doc per taste #40; folding into `PENUGASAN_*` is a separate explicit task). Correct the `PENUGASAN_PLAN.md` §10 deferred row to point at this chain once shipped (one-line pointer, not a rewrite).

## 12. Cross-references

- `docs/UNIVERSAL.md`, `docs/IMPLEMENTATION_PLAN.md` (Part 2 contract, Part 5 file map, R1–R8), `docs/SCOPE_EXPANSION_PLAN.md`, `docs/SCOPE_EXPANSION_PRIVILEGES.md`, `docs/PENUGASAN_PLAN.md`, `docs/PENUGASAN_MILESTONES.md` (Gate PG.D), `docs/COVER_SLOT_PLAN.md` (D-CS2), `docs/TRAINER_ATTENDANCE_PLAN.md`
- `server/lib/assignments.php`, `server/api/trainer.php`, `server/api/_master.php`, `server/validation/entities.php`, `server/auth/authorize.php`
- `src/lib/penugasan.js`, `src/features/penugasan/PenugasanManager.jsx`, `src/lib/__tests__/penugasan-slot.test.js`
