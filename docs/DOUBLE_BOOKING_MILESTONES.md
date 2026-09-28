# Double-Booking Cross-Host Milestones — Microtask Chain (DB.A)

**Companion to `docs/DOUBLE_BOOKING_PLAN.md`.** Decomposes the cross-host guard into strictly ordered microtasks. Each microtask must VERIFY before the next begins; a failing check becomes a bounded follow-up, not a widened edit (taste #3/#4). Later work does not start until gates pass.

**Source of truth for findings/decisions:** `DOUBLE_BOOKING_PLAN.md` §3 (F-DB1–F-DB6) and §4 (D-DB1–D-DB7). The chain below does not restate plan prose; each `FINDS`/`RULES` line cites the registry. Violated invariant for the whole chain (taste bug rule, one hypothesis): *the same person can hold two overlapping aktif rows for one school+slot because the guard only compares rows inside one host payload* — F-DB1/F-DB2; DB.A.1 is the single edit that tests it.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-DB references>
  RULES:   <R-DB codes + existing invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

**Gate exit criteria (the chain closes when all hold):**

1. Saving a row that puts the same person (union per D-DB1) on the same school + slot scope + overlapping dates across two hosts is rejected: UI shows the pinned copy with dialog open + nothing persists, and a direct API write 422s with the same copy (F-DB1/F-DB2 closed).
2. Distinct people on the same school + slot still save (D-DB1 occupant reading pinned, not slot-capacity); cover-linked pairs still save in either direction (D-DB5); edit re-save and deactivation never 422 (D-DB7).
3. Branch isolation holds: an overlapping row in another branch never blocks (F-DB6).
4. `npm test` + `npx playwright test tests/penugasan*.spec.js --workers=1` green with zero pageerror/console-error; `npm run build` green; unrelated failures labeled pre-existing with evidence (taste #9); PG.D acceptance re-run green (taste #10).
5. Every microtask carries `Verified: <command> -> <result>`; §11 write-back recorded; no `console.log` in `src/`, no build artifacts in `git status`.

---

## Gate DB.A — Cross-host occupant guard (F-DB1–F-DB6; D-DB1–D-DB7)

### DB.A.1 Add server cross-host scan

```text
MICROTASK: Add server cross-host scan
  EDIT:    server/lib/assignments.php (add findCrossHostConflict(newRows, foreignRows) pure + occupants() helper),
           server/api/trainer.php (cross-host 422 hook after the PG.D same-host gate, before masterWrite; branch bound per D-DB3),
           src/lib/__tests__/penugasan-crosshost.test.js (new, PHP-bridge legs mirroring penugasan-slot.test.js pattern)
  FINDS:   F-DB1, F-DB2, F-DB3, F-DB4, F-DB5, F-DB6
  RULES:   R-DB1, R-DB2, R-DB4, R-DB5, R-DB6, R-DB7; predicate = D-DB1 + D-DB2 + D-DB5 (union intersect, exact triple, unscoped fans out, same-id + cover-linked skip, inactive/disjoint/different-school never block); scan bound = host record cabang_id (D-DB3); pinned copy = D-DB6 verbatim; version/409 path untouched; deploy/ untouched
  DEPENDS: none (entry; PG.D closed upstream, no renumbering per taste #74)
  OUTCOME: a direct API update putting the same person on overlapping rows across two same-branch hosts 422s with the pinned copy, while distinct people, cover-linked rows, and cross-branch overlaps still write.
  VERIFY:  npx vitest run src/lib/__tests__/penugasan-crosshost.test.js -> all passed, including: cross-host same-person same-slot returns pinned copy via PHP bridge; same-slot distinct people returns null; cover-linked cross-host returns null; cross-branch fixture returns null; PG.D same-host cases still 422 (bridge re-run); plus php server/tests/entity.validation.php + php server/tests/endpoint.protection.php stay green
  DONE-IF: verify passes; only intended files changed

  DB.A.1 → Verified: npx vitest run src/lib/__tests__/penugasan-crosshost.test.js src/lib/__tests__/penugasan-slot.test.js -> 2 files, 23 passed (12 new DB.A.1 incl. pinned-copy parity vs PENUGASAN_OVERLAP_ERROR + 11 PG.D regression); npm test -> 46 files / 265 passed; php server/tests/entity.validation.php -> all checks passed; php server/tests/endpoint.protection.php -> 274 checks, 0 failed (new scan live on every trainer.php update leg, zero false 422s)
```

### DB.A.2 Mirror client pre-check

```text
MICROTASK: Mirror client pre-check
  EDIT:    src/lib/penugasan.js (add findCrossHostPair(nextRows, otherHostsRows) pure, same predicate as DB.A.1),
           src/features/penugasan/PenugasanManager.jsx (run it in save() after the PG.D findOverlappingPair(next) check, over cached trainers list; same pinned copy via showError),
           src/lib/__tests__/penugasan-crosshost.test.js (client legs: occupant union incl. asistenIds[1], unscoped fan-out, same-id/edit skip, inactive/disjoint skip)
  FINDS:   F-DB1, F-DB2, F-DB4, F-DB5
  RULES:   R-DB1, R-DB2, R-DB3, R-DB6; mirror server predicate exactly (taste #11); no new copy, no new styles; server stays authoritative (taste #61 — pre-check is UX only)
  DEPENDS: DB.A.1 (predicate locked server-side first; client mirrors, never leads)
  OUTCOME: an admin attempting the cross-host duplicate in the manager sees the pinned copy before any write, with the dialog open and nothing persisted.
  VERIFY:  npx vitest run src/lib/__tests__/penugasan-crosshost.test.js -> client legs passed (same-person-as-assistant blocked; 2nd-assistant id blocked; distinct people pass; cover-linked pass; edit re-save passes); temp one-off debug spec (removed after passing per testing taste #15) proves dialog-open + zero writes, OR the DB.A.3 persisted spec covers it directly
  DONE-IF: verify passes; only intended files changed

  DB.A.2 → Verified: npx vitest run src/lib/__tests__/penugasan-crosshost.test.js -> 25 passed (12 DB.A.1 server-bridge + 5 client-mirror legs + 8 client/server parity fixtures with identical verdicts both layers); npm test -> 46 files / 278 passed. One test-authored fixture failure mid-task (cover row sharing an occupant with an unrelated foreign row) was diagnosed as a test bug per testing taste #14 and fixed by isolating the fixture — implementation untouched. Dialog-open + zero-writes UX leg deferred to the DB.A.3 persisted e2e spec (no temp spec needed)
```

### DB.A.3 Pin e2e regression and write back

```text
MICROTASK: Pin e2e regression and write back
  EDIT:    tests/penugasan-crosshost.spec.js (new, persists per taste #16),
           docs/DOUBLE_BOOKING_PLAN.md + docs/DOUBLE_BOOKING_MILESTONES.md (Verified lines + status),
           docs/SCOPE_EXPANSION_MILESTONES.md (append closure row only — no renumbering)
  FINDS:   F-DB1–F-DB6
  RULES:   R-DB6, R-DB7; role-based locators (getByRole), date-aware today fixture (no hardcoded dates), assert zero pageerror (favicon allowlist only), verify store/server state directly where UI hides the invariant (readCached + SELECT payload); full loop + pre-existing-failure triage + PG.D acceptance re-run before done (taste #9/#10); no console.log in src/ (grep gate), git status clean of artifacts; deploy/ only via npm run build:deploy
  DEPENDS: DB.A.2
  OUTCOME: the cross-host guard is regression-pinned end-to-end and the source docs reflect what actually shipped.
  VERIFY:  npx playwright test tests/penugasan-crosshost.spec.js --workers=1 -> green zero pageerror (admin creates row for instructor A; overlapping same-person row for instructor B rejected with pinned copy in UI + via direct POST 422; distinct-person same-slot saves; refresh persists exactly one overlapping occupant); npx playwright test tests/penugasan-manage.spec.js tests/penugasan-attendance-unblock.spec.js --workers=1 -> green (PG.D acceptance re-run); npm test -> green; npm run build -> green; node -e ID check -> every F-DB/D-DB/R-DB cited below exists in DOUBLE_BOOKING_PLAN.md
  DONE-IF: verify passes; only intended files changed
```

---

## Ordering rationale

- **DB.A.1 before DB.A.2:** server is authoritative (taste #61); the predicate must be locked and bridge-tested in PHP before the client mirrors it — mirroring first would bake a client-only rule the server might reject differently.
- **DB.A.2 before DB.A.3:** the e2e spec asserts both the pre-check UX (dialog open, pinned copy) and the 422 persistence leg; both layers must exist before the regression can pin them.
- **DB.A.3 last:** hardening + write-back only after every behavior above is green (taste #10 re-run included).

## Deferred with owners

| Item | Owner / venue | Why deferred |
|---|---|---|
| Auto-create cross-host hardening | Future plan amendment (`DOUBLE_BOOKING_PLAN.md` §10) | Needs explicit re-plan of link-add semantics; this chain is manual-path only |
| Slot-capacity semantics | Business sign-off (`DOUBLE_BOOKING_PLAN.md` D-DB1 rejected alternative) | Would forbid co-teaching; no code until decided |
| PG.D same-host internals | `PENUGASAN_MILESTONES.md` Gate PG.D (closed) | Untouched; re-run only |

## Completion contract

```text
server cross-host scan -> client pre-check mirror
  -> e2e regression + build + write-back
```

Every arrow has a `Verified: <command> -> <result>` line before the chain closes. Dead code/orphan probes are purged at DB.A.3 (taste quality gate), not left as follow-ups.
