# Drift Close Milestones — Microtask Chain (DC.A → DC.E)

**Companion to `docs/DRIFT_CLOSE_PLAN.md`.** Strictly ordered microtasks; each must VERIFY before the next begins; a failing check becomes a bounded follow-up, not a widened edit (taste #3/#4).

**Source of truth:** `DRIFT_CLOSE_PLAN.md` §3 (F-DC1–F-DC5) and §4 (D-DC1–D-DC5). Violated invariant for the whole chain (one hypothesis): *role-bearing records lose their role on correction, writes take two contradictory paths, and the suite checks yesterday's paths — F-DC1/F-DC2*; DC.A–DC.E is the single slice that tests it.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-DC references>
  RULES:   <R-DC codes + existing invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

**Gate exit criteria (the chain closes when all hold):**

1. Text-only admin correction preserves `peran`/`dicatatOleh` with unit pin (F-DC1 closed, D-DC2).
2. Zero client queue writes; `Sinkronisasi` UI + sync plumbing gone; server `sync.php` retained legacy-marked; every ex-queue writer direct with forbidden/conflict paths (F-DC2 closed, D-DC1).
3. `sync.php`-waiting E2E legs updated; no test waits on a removed button (DL-1 closed).
4. `asistenIds` test legs added; assignment UI offers Asisten 2; timetable shows both (F-DC3 closed, D-DC3).
5. E2E pipeline leg green: Terbit → dashboard moves, Frozen unchanged (F-DC4 closed, D-DC4).
6. Full E2E + `npm test` + `php server/tests/entity.validation.php` + `php server/tests/endpoint.protection.php` + `npm run build` green; unrelated failures stash-proven pre-existing (taste #9); original acceptance legs re-run (taste #10).
7. Drift log extended with everything found; §11 write-back recorded; no `console.log` in `src/`; `git status` clean of artifacts.

---

## Gate DC.A — Correction carries role (F-DC1; D-DC2)

### DC.A.1 Carry role through correction

```text
MICROTASK: Carry role through correction
  EDIT:    src/lib/trainerAttendance.js (pure buildPengajarCorrection),
           src/lib/__tests__/trainerAttendance.test.js (extend: role-carry cases),
           src/features/attendance/TrainerAttendanceAdmin.jsx (submitCorrection uses helper; no visual change)
  FINDS:   F-DC1; D-DC2
  RULES:   R-DC1, R-DC2, R-DC5; role rides unchanged (no dialog control added); server re-validates; legacy rows without peran stay null
  DEPENDS: none
  OUTCOME: a text-only correction on an (A) row keeps peran A + recorder and prices 50k before and after.
  VERIFY:  npx vitest run src/lib/__tests__/trainerAttendance.test.js -> Vazira-A text-correction keeps peran A + dicatatOleh, legacy-no-peran stays null; honorForPengajarRow before/after identical
  DONE-IF: verify passes; only intended files changed

  DC.A.1 → Verified: npx vitest run src/lib/__tests__/trainerAttendance.test.js -> 16 passed (14 existing + 2 role-carry); npm run build -> green (5.94s, pre-existing store.js warning only)
```

---

## Gate DC.B — Drop the client queue (F-DC2; D-DC1)

### DC.B.1 Direct-write absensi writers

```text
MICROTASK: Direct-write absensi writers
  EDIT:    src/features/attendance/AttendanceForm.jsx (upsert->writeRemote absensi, mirror TrainerAttendanceForm.jsx:103 forbidden/conflict paths),
           src/features/attendance/RiwayatAbsensi.jsx (verify stamp direct),
           src/features/attendance/TrainerHistory.jsx (self-certify direct)
  FINDS:   F-DC2; D-DC1
  RULES:   R-DC1, R-DC2, R-DC3, R-DC5; ownership/assignment gates unchanged server-side; Tersimpan/error copy unchanged
  DEPENDS: DC.A.1
  OUTCOME: class attendance, verify stamps, and self-certifications land on the server at save time with no Sync step.
  VERIFY:  npx vitest run src/lib/__tests__/store-cache-isolation.test.js + rg "upsert\('absensi'" src/features/attendance -> 0 hits (all three call sites direct)
  DONE-IF: verify passes; only intended files changed

  DC.B.1 → Verified: php server/tests/endpoint.protection.php -> 274 checks, 0 failed (incl. 13 new update+certify legs); rg "upsert\('" src/ -> 0 functional callers (def + comments + unit-test only); npm test -> 243 passed; npm run build -> green
```

### DC.B.2 Direct-write payment writers

```text
MICROTASK: Direct-write payment writers
  EDIT:    src/features/payments/PaymentTable.jsx (upsert honorPayments x2 -> writeRemote),
           src/lib/sppPayments.js (upsert sppPayments -> writeRemote; update the stale queueSync comment)
  FINDS:   F-DC2; D-DC1
  RULES:   R-DC1, R-DC2, R-DC3, R-DC5; append-only ledger semantics unchanged; R-SB1 holds (new rows, never updates)
  DEPENDS: DC.B.1
  OUTCOME: honor + SPP payments persist at submit time with no Sync step.
  VERIFY:  rg "upsert\('(honorPayments|sppPayments)'" src/ -> 0 hits; npm test -- honor-settlement -> green
  DONE-IF: verify passes; only intended files changed

  DC.B.2 → Verified: rg upsert-(honor|spp) -> 0 callers; honorPayments.php maps create→append (update stays 400, append-only); npm test -> 243 passed; npm run build -> green
```

### DC.B.3 Remove queue plumbing and Sync UI

```text
MICROTASK: Remove queue plumbing and Sync UI
  EDIT:    src/lib/store.js (upsert keeps cache write, drops queueSync call; remove queueSync/readSyncLog/writeSyncLog/pendingRecordsForKey/syncPending export/getSyncStatus; LEDGER_KEYS retained only if still referenced),
           src/components/AccountMenu.jsx (remove Sinkronisasi item + badge),
           src/App.jsx (remove boot flush + syncStatus props),
           server/api/sync.php (header-mark legacy, retained)
  FINDS:   F-DC2; D-DC1
  RULES:   R-DC1, R-DC2, R-DC3, R-DC4, R-DC5; server endpoint retained (old cached clients); grep gate: no orphan Sinkronisasi/syncPending strings in src/
  DEPENDS: DC.B.2
  OUTCOME: the app has no queue, no Sync button, and no boot flush; every write is direct.
  VERIFY:  rg "queueSync|syncPending|Sinkronisasi|getSyncStatus" src/ -> 0 hits (excluding legacy comment pointers); npm run build -> green
  DONE-IF: verify passes; only intended files changed

  DC.B.3 → Verified: grep-zero gate -> 4 comment-pointer hits only, 0 functional; npm test -> 243 passed; npm run build -> green (5.49s, pre-existing warning only)
```

### DC.B.4 Update sync-waiting test legs

```text
MICROTASK: Update sync-waiting test legs
  EDIT:    tests/trainer-attendance-form.spec.js (drop sync blocks, assert server row post-Tersimpan),
           tests/trainer-attendance-admin.spec.js, tests/trainer-attendance-summary.spec.js (same),
           any further sync.php-waiting legs found via rg (drift-log each per D-DC5)
  FINDS:   F-DC2; D-DC1, D-DC5
  RULES:   R-DC1, R-DC5; legacy-absensi (AttendanceForm direct now — no queue legs remain) consistent; sync.php server endpoint untouched
  DEPENDS: DC.B.3
  OUTCOME: no E2E leg waits on the removed Sync path; attendance legs assert server state directly.
  VERIFY:  rg "sync\.php" tests/*.spec.js -> 0 waiter hits (route-mocks for legacy documented if kept); npx playwright test tests/trainer-attendance-form.spec.js --workers=1 -> green zero pageerror
  DONE-IF: verify passes; only intended files changed
```

---

## Gate DC.C — Two-assistant sessions (F-DC3; D-DC3)

### DC.C.1 Extend assistant tests

```text
MICROTASK: Extend assistant tests
  EDIT:    src/lib/__tests__/penugasan-slot.test.js (extend: asistenIds union + max-2 cases),
           tests/penugasan-manage.spec.js (add Asisten-2 leg; keep legacy asistenId assertions)
  FINDS:   F-DC3; D-DC3
  RULES:   R-DC1, R-DC2, R-DC5; legacy assertions kept (union position 0); Indonesian copy pinned
  DEPENDS: DC.B.4
  OUTCOME: union reads + max-2 gate pinned in unit; Asisten 2 selectable end-to-end.
  VERIFY:  npx vitest run src/lib/__tests__/penugasan-slot.test.js -> union + max-2 green; playwright penugasan-manage leg -> Asisten 2 persists server-side
  DONE-IF: verify passes; only intended files changed

  DC.C.1 → Verified: npx vitest run src/lib/__tests__/penugasan-slot.test.js -> 9 passed (7 existing + 2 union); form uses penugasanInvolvesTrainer (server-gate parity)
```

### DC.C.2 Offer second assistant in UI

```text
MICROTASK: Offer second assistant in UI
  EDIT:    src/features/penugasan/PenugasanManager.jsx (Asisten 2 select mirroring Asisten idiom + both-position validation),
           src/features/penugasan/PenugasanTimetable.jsx (Asisten column joins both names)
  FINDS:   F-DC3; D-DC3
  RULES:   R-DC1, R-DC2, R-DC5; writes prefer asistenIds, legacy asistenId preserved (D-CS4 additive rule)
  DEPENDS: DC.C.1
  OUTCOME: an admin assigns two assistants to one slot from the UI; the timetable shows both.
  VERIFY:  npx playwright test tests/penugasan-manage.spec.js --workers=1 -> green incl. Asisten-2 leg, zero pageerror
  DONE-IF: verify passes; only intended files changed

  DC.C.2 → Verified: npx playwright test tests/penugasan-manage.spec.js --workers=1 -> 3/3 green incl. DC.C.2 Asisten-2 leg (server asistenIds + joined render), zero pageerror; npm test -> 245 passed; npm run build -> green
```

---

## Gate DC.D — On-screen pipeline proof (F-DC4; D-DC4)

### DC.D.1 Prove pipeline on screen

```text
MICROTASK: Prove pipeline on screen
  EDIT:    tests/invoice-pipeline-dashboard.spec.js (new: Tarif school generate+Terbit -> dashboard Potensi = invoice figure + source label; Frozen school unchanged same run)
  FINDS:   F-DC4; D-DC4
  RULES:   R-DC1, R-DC5; never assert pipeline figures from financialData() (layer contract); Indonesian labels by exact name
  DEPENDS: DC.C.2
  OUTCOME: the dashboard-last switch is proven on screen for both categories in one run.
  VERIFY:  npx playwright test tests/invoice-pipeline-dashboard.spec.js --workers=1 -> green zero pageerror
  DONE-IF: verify passes; only intended files changed

  DC.D.1 → Verified: npx playwright test tests/invoice-pipeline-dashboard.spec.js --workers=1 -> 1 passed (Tarif 360000 + invoice badge, Frozen 250000 flat no badge, hermetic cleanup), zero pageerror
```

---

## Gate DC.E — Full run + drift log + write-back (F-DC5; D-DC5)

### DC.E.1 Run full suite, log drift, write back

```text
MICROTASK: Run full suite, log drift, write back
  EDIT:    docs/DRIFT_CLOSE_PLAN.md (§10 drift log append only),
           docs/DRIFT_CLOSE_MILESTONES.md (Verified lines + status),
           docs/SCOPE_EXPANSION_MILESTONES.md (closure row only),
           docs/EXEMPLAR_MIGRATION.md (drift deltas into 2026-09-27 addendum only)
  FINDS:   F-DC1–F-DC5
  RULES:   R-DC5; full loop npm test + php entity.validation + php endpoint.protection + full playwright + build; stash-proven pre-existing triage; acceptance re-run (DC.A.1 role-carry + DC.B.4 direct-save + DC.C.2 Asisten-2 + DC.D.1 pipeline); destructive project last with backup-restore; no console.log; no artifacts
  DEPENDS: DC.D.1
  OUTCOME: suite dispositioned per leg (green / updated-test / app-microtask / pre-existing), drift logged, source docs reflect what shipped.
  VERIFY:  full playwright run -> disposition table complete; node -e ID check -> every F-DC/D-DC/R-DC cited exists in DRIFT_CLOSE_PLAN.md
  DONE-IF: verify passes; only intended files changed
```

---

## Ordering rationale

- **DC.A first:** independent app bug (silent repricing); smallest slice; its spec never touches the queue.
- **DC.B before DC.C/DC.D legs:** the write path is foundation — new E2E legs must be written against direct-save, not migrated twice.
- **DC.B.1 before B.2:** attendance writers before payment writers (G5-order analog: sessions exist before money moves).
- **DC.B.3 before B.4:** remove the path before rewriting its waiters (falsifiable: grep-zero gate).
- **DC.C.1 before C.2:** pin union semantics before adding the picker (taste #4 — pricing unpersistable roles is untestable).
- **DC.E last:** full evidence + write-back only when every behavior above is green.

## Deferred with owners

| Item | Owner / venue | Why deferred |
|---|---|---|
| Server `sync.php` removal | Future hygiene + PWA cache review | Bricks old cached installs; zero runtime benefit |
| Offline-capture replacement | New plan if business wants it | Explicitly unsupported per D-DC1 |
| Role control inside correction dialog | Team pick (control vs read-only line) | Carry-through closes the money risk; UI choice is separate |
| Legacy `AttendanceForm` single-assistant | By design (per-record entity) | F9 lives on per-person pengajar rows |
| Q8 real samples / F4/F14 holes | Team data or accepted-Unverified | No ground truth (carried, not deleted) |

## Completion contract

```text
role-carry fix -> direct-write writers -> queue/UI removal -> test-leg updates
  -> assistant tests + picker -> on-screen pipeline leg
  -> full run + drift log + write-back
```
