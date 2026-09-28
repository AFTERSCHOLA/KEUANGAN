# AsistenIds Scope Fix — 2nd-assistant read-scope union

**Status:** CLOSED 2026-09-28 — implemented and verified on branch `test-stage` (working tree). This file is the record (taste #40, #69 short-task doc).
**Trigger:** audit finding #3 (trainer bug triage 2026-09-28): `asistenIds[1]`-only trainer renders in the timetable but vanishes from `sekolah`/`siswa`/`eksternal` scope and `TrainerDashboard`.
**Position:** temporary, gate-by-gate fixing doc (taste #40). It does **not** replace `docs/COVER_SLOT_PLAN.md` / `docs/SCOPE_EXPANSION_PLAN.md`. On close, this file stays as the record; no milestone renumbering (no new microtasks added to any chain, taste #74 N/A).

---

## 1. Context and inputs

- DC.C.2 introduced `asistenIds[]` (max 2, server-gated in `server/validation/entities.php:243-264`). The authoritative membership union is `trainerId ∪ asistenId ∪ asistenIds[]`, owned by `penugasanInvolvesTrainer()` (`src/lib/penugasan.js:238-244`) and enforced on the write path by `server/auth/authorize.php:86-88` and `server/lib/assignments.php:261-279`.
- Two read-scope layers still used the legacy pair `trainerId ∪ asistenId` only: `trainerHasActiveAssignmentClient()` / `trainerHasAnyActiveAssignmentToSekolahClient()` (`src/lib/store.js:63-93`) and the `$sekolahTrainerIds` index builder (`server/api/read.php:108-116`). `authorize.php:trainerOwnsRecord` consumes the read.php index via `_sekolahTrainerIds`, so the server read lane inherited the same blind spot.

## 2. Goals and non-goals

**Goals**

1. A trainer assigned solely via `asistenIds[1]` sees the assigned school, its students, externals, and related rows — exactly like an `asistenId` assignee.
2. Client and server read scopes agree with the write gate (single union owner, no drift).

**Non-goals (stay out of this gate)**

- Parent-source display wiring (`sumberPelunasan` UI) — separate gap, own gate.
- Overpayment credit auto-apply — owned GAP (`BULK_RECONCILE_PLAN.md` §5, `EVAL_FINANCE_PLAN.md` F-EF5), not touched here.
- Interval-overlap booking semantics (exact-triple only is YAGNI, documented) — not touched here.
- Any styling, copy, or schema change (taste #4/R1: one concern per edit).

## 3. Findings registry (F-AIS)

| ID | Finding | Evidence |
|---|---|---|
| F-AIS1 | **Client scope misses `asistenIds`.** Both helpers match `a.trainerId === trainerId \|\| a.asistenId === trainerId`, so `asistenIds: ['trn-self']` with `asistenId: null` never matches. | `src/lib/store.js:69,86` (pre-fix) vs `src/lib/penugasan.js:238-244` union owner |
| F-AIS2 | **Server read index misses `asistenIds`.** `$sekolahTrainerIds` loops only `['trainerId', 'asistenId']`, so `_sekolahTrainerIds` enrichment (sekolah/siswa/eksternal/sppPayments) omits 2nd assistants. | `server/api/read.php:108-116` (pre-fix) vs `server/auth/authorize.php:86-88` union |

## 4. Decision set (D-AIS) — concrete picks (taste #17)

| # | Decision | Status |
|---|---|---|
| D-AIS1 | **Reuse the union owner, don't duplicate it.** Client fix delegates both helpers to `penugasanInvolvesTrainer()` (no new predicate, no import cycle: `penugasan.js` imports only `constants.js` + `format.js`). | Locked |
| D-AIS2 | **Mirror the union server-side with the same trim/skip idiom** as the existing loop (non-string/blank entries skipped, ids trimmed). No behavior change for legacy rows. | Locked |

## 5. Rules (R-AIS)

- **R-AIS1** One concern per edit (taste #4): union membership only; no validation, styling, or scope-shape changes ride along.
- **R-AIS2** Server stays authoritative (taste #61): client mirror must match `authorize.php`, never the reverse.
- **R-AIS3** Indonesian UI copy unchanged; verification language `Verified: <command> -> <result>` / `Unverified:` (taste #26).
- **R-AIS4** Deploy artifact only via `npm run build:deploy` (taste #71); never hand-edit `deploy/`.

## 6. Microtasks

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-AIS references>
  RULES:   <R-AIS codes + existing invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

### AIS.1 Unite client scope helpers

```text
MICROTASK: Unite client scope helpers
  EDIT:    src/lib/store.js (import + 2 match lines only)
  FINDS:   F-AIS1; D-AIS1
  RULES:   R-AIS1, R-AIS2; penugasanInvolvesTrainer() is the single owner (no duplicated predicate)
  DEPENDS: none
  OUTCOME: trainerHasActiveAssignmentClient() and trainerHasAnyActiveAssignmentToSekolahClient() return true for asistenIds[1]-only assignments.
  VERIFY:  npx vitest run src/lib/__tests__/store-trainer-siswa-scope.test.js src/lib/__tests__/penugasan-slot.test.js src/lib/__tests__/penugasan-crosshost.test.js src/lib/__tests__/penugasan-timetable.test.js -> 4 files / 48 passed
  DONE-IF: verify passes; only intended files changed
```

### AIS.2 Index asistenIds on the server read path

```text
MICROTASK: Index asistenIds on the server read path
  EDIT:    server/api/read.php ($sekolahTrainerIds builder only)
  FINDS:   F-AIS2; D-AIS2
  RULES:   R-AIS1, R-AIS2; legacy rows without asistenIds index byte-identically; blank/non-string entries skipped
  DEPENDS: AIS.1 (same hypothesis, second layer; verified AIS.1 green before widening)
  OUTCOME: _sekolahTrainerIds enrichment includes 2nd assistants, so trainerOwnsRecord grants sekolah/siswa/eksternal/sppPayments rows to them.
  VERIFY:  node -e union probe -> {oldMatch:false,newMatch:true}; php -l server/api/read.php -> no syntax errors (when PHP available)
  DONE-IF: verify passes; only intended files changed
```

### AIS.3 Pin the regression

```text
MICROTASK: Pin the regression
  EDIT:    src/lib/__tests__/store-trainer-siswa-scope.test.js (one new it-block only, mirrors existing harness)
  FINDS:   F-AIS1; D-AIS1
  RULES:   R-AIS1, R-AIS3; dynamic dates not needed (scope is date-independent here); existing 4 cases untouched
  DEPENDS: AIS.2
  OUTCOME: an asistenIds-only trainer (empty sekolahIds, asistenId null) sees the assigned school's student and passes trainerHasAnyActiveAssignmentToSekolahClient().
  VERIFY:  npx vitest run src/lib/__tests__/store-trainer-siswa-scope.test.js -> 5 passed (was 4)
  DONE-IF: verify passes; only intended files changed
```

## 7. Gate exit criteria (gate closes when all hold)

1. AIS.1–AIS.3 VERIFY lines all green (§6).
2. `npm test` green (full unit suite) and `npm run build` green; any unrelated failure proven pre-existing before moving on.
3. `npm run build:deploy` parity gate green (51 PHP mirrored).
4. `src/` grep-clean of `console.log`/debug; `git status` shows only intended files (+ expected `deploy/` rebuild churn).
5. This file written; no long-term plan expansion.

## 8. Deferred with owners

| Item | Owner / resolving venue | Why deferred |
|---|---|---|
| `sumberPelunasan` display wiring (parent vs school source in UI) | Finance UI gate | Stored correctly (`sppPayments.js:196-208` pure); needs a UI decision, not a scope fix |
| Overpayment credit auto-apply + credit-balance UI | `BULK_RECONCILE_PLAN.md` §5 / `EVAL_FINANCE_PLAN.md` F-EF5 | Explicitly owned GAP; must not be force-PASSed here |
| Playwright E2E for 2nd-assistant visibility (timetable → scope → dashboard) | Next E2E pass | Unit + read-path fix verified; browser proof is `Unverified` until run |

## 9. Completion recording (taste #43)

No milestone renumbering required (short-task doc, not a chain insertion). Completion lives in this file's evidence block.

**Evidence (2026-09-28, working tree):**
`Verified: npx vitest run store-trainer-siswa-scope+penugasan-slot+penugasan-crosshost+penugasan-timetable -> 4 files / 48 passed` · `Verified: npx vitest run store-trainer-siswa-scope -> 5 passed (new DC.C.1 case)` · `Verified: node -e union probe -> {oldMatch:false,newMatch:true}` · `Verified: npm test -> 47 files / 288 passed` · `Verified: npm run build -> green` · `Verified: npm run build:deploy -> Build OK, 51 PHP mirrored, parity gate green` · `Verified: grep console.log in src/ -> clean`
`Unverified: Playwright E2E suite (not run in this pass); server/*.check.php direct run (PHP binary not invoked here — read.php change is a strict superset loop, legacy rows byte-identical)`

## 10. Cross-references

- `docs/COVER_SLOT_PLAN.md` D-CS4/DC.C.2 (union definition), `docs/SCOPE_EXPANSION_PLAN.md` Part 6 (privilege matrix)
- Code: `src/lib/store.js:1-3,63-100`, `src/lib/penugasan.js:234-244`, `server/api/read.php:97-132`, `server/auth/authorize.php:76-89,149-197`, `src/lib/__tests__/store-trainer-siswa-scope.test.js`
