# Cover Slot Milestones — Microtask Chain (CS.A → CS.C)

**Companion to `docs/COVER_SLOT_PLAN.md`.** Decomposes the slot-pick revision + cover path + per-session role into strictly ordered microtasks. Each microtask must VERIFY before the next begins; a failing check becomes a bounded follow-up, not a widened edit (taste #3/#4). Later work does not start until gates pass. No app code changes in this pair yet — this chain is the build order for implementers.

**Source of truth for findings/decisions:** `COVER_SLOT_PLAN.md` §3 (F-CS1–F-CS6) and §4 (D-CS1–D-CS7). The chain below does not restate plan prose; each `FINDS`/`RULES` line cites the registry. Violated invariant for the whole chain (taste bug rule, one hypothesis): *a cover session bills the school but pays nobody because the assignment gate has no cover path, and the slot model has no explicit pick — F-CS1/F-CS2*; CS.A–CS.C is the single slice that tests it.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-CS references>
  RULES:   <R-CS codes + existing invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

**Gate exit criteria (the chain closes when all hold):**

1. Link-add auto-create offers an explicit slot pick; no wholesale whole-school copy path remains (F-CS1 closed, D-CS1; unscoped `null` rows byte-identical).
2. A cover row (`coverOf`) passes the `absensiPengajar` gate and pays the substitute while the school bills (F-CS2 closed, D-CS2/Q1(a)); genuinely unassigned writes still 403.
3. Session role rides on the attendance row (`peran` I/A), independent of live `tipePengajar` (F-CS4 closed, D-CS3); 1 I + 2 A sessions representable (F-CS3 closed, D-CS4).
4. External assistants without logins are writable with mandatory `dicatatOleh`; trainer creation of externals stays denied (F-CS5 closed, D-CS5).
5. Honor reads role-first (`A` → 50k, `I` → owner's tier); legacy rows without `peran` compute exactly as before (D-CS6).
6. The dashboard-source guard pins both exemplar figures and fails on premature switches; generator upgrade itself stays in SPP_BILLING (F-CS6 guarded, D-CS7).
7. No role reads/writes outside §9; `npx playwright test tests/penugasan*.spec.js tests/trainer-attendance*.spec.js --workers=1` + `npm test` + `php server/tests/entity.validation.php` + `php server/tests/endpoint.protection.php` + `npm run build` green; unrelated failures labeled pre-existing with stash evidence (taste #9); original acceptance legs re-run before done (taste #10).
8. Every microtask carries `Verified: <command> -> <result>`; §11 write-back recorded; no `console.log` in `src/`, no build artifacts in `git status`.

---

## Gate CS.A — Slot-pick auto-create revision (F-CS1; D-CS1)

### CS.A.1 Offer slot pick on auto-create

```text
MICROTASK: Offer slot pick on auto-create
  EDIT:    server/lib/assignments.php (replace whole-copy append with slot-picked rows; cover-aware overlap: coverOf rows never conflict with origin),
           server/validation/entities.php (picked triple must equal a jadwalList entry; hari null forces times null; missing triple reads unscoped),
           src/features/penugasan/PenugasanManager.jsx (Slot picker per D-PS6 idiom; Slot column shows Semua slot or Hari · HH:MM–HH:MM),
           src/lib/__tests__/penugasan-slot.test.js (extend: picked-triple + coverOf-agnostic overlap cases)
  FINDS:   F-CS1; D-CS1, D-PS2, D-PS3
  RULES:   R-CS1, R-CS2, R-CS4, R-CS5, R-CS6; additive only (legacy rows without triple valid); exact string equality, no interval overlap (YAGNI); Indonesian copy pinned (§7); deploy/ untouched
  DEPENDS: none (PENUGASAN_SLOT PS.A–PS.B green is the entry assumption; if red, stop and re-plan per taste drift rule)
  OUTCOME: linking a school to a trainer creates rows only for the picked slots, and a 3-slot school no longer fans one assignment out to all slots.
  VERIFY:  php server/tests/entity.validation.php + npx vitest run src/lib/__tests__/penugasan-slot.test.js -> picked Rabu 14:15-15:15 accepted; out-of-vocabulary time rejected with pinned copy; legacy row without triple accepted as unscoped; overlap helper skips when an overlapping active row exists but ignores the cover origin pair
  DONE-IF: verify passes; only intended files changed
```

---

## Gate CS.B — Cover path + per-session role + externals (F-CS2–F-CS5; D-CS2–D-CS5)

### CS.B.1 Link cover sessions to assignments

```text
MICROTASK: Link cover sessions to assignments
  EDIT:    server/validation/entities.php (coverOf must reference an existing assignment, same sekolahId + overlapping scope; cover rows excluded from origin-conflict),
           server/auth/authorize.php (trainerHasActiveAssignment passes via direct assignment OR valid coverOf link; genuinely unassigned stays false/403),
           src/features/penugasan/PenugasanManager.jsx (Buat penugasan pengganti: origin read-only + Slot + Tanggal; confirm copy §7),
           server/tests/entity.validation.php (cover link cases)
  FINDS:   F-CS2; D-CS2
  RULES:   R-CS1, R-CS3, R-CS4, R-CS5, R-CS6; no cover link, no pay (403 preserved); coverOf immutable once written (new row to change, append-only analog)
  DEPENDS: CS.A.1
  OUTCOME: a substitute with a cover link writes their own absensiPengajar row where the same write 403s without the link.
  VERIFY:  php server/tests/entity.validation.php -> cover with valid origin validates; cover with missing/foreign origin rejected; Dedic: trainer write without assignment or cover still 403 in endpoint protection suite (php server/tests/endpoint.protection.php)
  DONE-IF: verify passes; only intended files changed
```

### CS.B.2 Record per-session roles and externals

```text
MICROTASK: Record per-session roles and externals
  EDIT:    src/lib/constants.js (newAbsensiPengajar gains peran null|I|A + dicatatOleh null|userId; no asisten field added — attendance stays per-person rows),
           server/validation/entities.php (peran enum; dicatatOleh required iff the row's person is external; legacy rows without both keys valid),
           server/auth/authorize.php (external-person create denied to trainer; external attendance allowed in own school+date scope with dicatatOleh=self; admin_cabang own-branch, superadmin all),
           src/features/attendance/TrainerAttendanceForm.jsx (Peran sesi ini: Instruktur/Asisten control; external picker reference-only for trainers),
           server/api/absensiPengajar.php (write path carries peran/dicatatOleh through requireRecord + insertLedger),
           src/lib/__tests__/trainerAttendance.test.js (extend: role-on-row + external-recorder cases)
  FINDS:   F-CS3, F-CS4, F-CS5; D-CS3, D-CS4, D-CS5
  RULES:   R-CS1, R-CS2, R-CS3, R-CS4, R-CS5, R-CS6; live tipePengajar never overwrites stored peran (matrix reads row first, type second); asistenIds max 2 with union-read of legacy asistenId; trainer external-create stays 403 (no broadening, taste #33)
  DEPENDS: CS.B.1
  OUTCOME: one person holds peran I in one session row and peran A in another with no type change, and an external without a login has a Present row carrying who recorded it.
  VERIFY:  npx vitest run src/lib/__tests__/trainerAttendance.test.js + php server/tests/entity.validation.php -> Vazira-style I-then-A rows label independently of a later tipePengajar flip; external row without dicatatOleh rejected; trainer-issued external-person create 403; zero pageerror on the form leg (npx playwright test tests/trainer-attendance-form.spec.js --workers=1 if present, else Unverified with owner)
  DONE-IF: verify passes; only intended files changed
```

---

## Gate CS.C — Role-first honor + sequencing guard + write-back (D-CS6–D-CS7)

### CS.C.1 Pay honor by session role

```text
MICROTASK: Pay honor by session role
  EDIT:    src/lib/finance.js (pengajarHonorStats/bebanHonor read row peran first: A -> 50k per D2, I -> owner's trainer.honor per R-TA3; rows without peran use the legacy per-person path byte-identically),
           src/lib/trainerAttendance.js (matrix label reads row peran first, live tipePengajar second),
           src/lib/__tests__/finance-pengajar-honor.test.js (extend: I/A split fixtures incl. external-A-50k + legacy-no-peran regression)
  FINDS:   F-CS4; D-CS3, D-CS6
  RULES:   R-CS1, R-CS2, R-CS4, R-CS6; history byte-identical for rows without peran (R-SB3 analog); no hardcoded tiers beyond D2-flat-50k-for-A (documented here, not in a second place)
  DEPENDS: CS.B.2
  OUTCOME: the exemplar dual-role sessions price correctly (I at tier, A at 50k) while every legacy row prices exactly as today.
  VERIFY:  npx vitest run src/lib/__tests__/finance-pengajar-honor.test.js -> I-row at Senior prices 100k, A-row by the same person prices 50k, external-A prices 50k, legacy row without peran prices per-person honor unchanged
  DONE-IF: verify passes; only intended files changed
```

### CS.C.2 Guard dashboard order and write back

```text
MICROTASK: Guard dashboard order and write back
  EDIT:    src/lib/__tests__/finance-regression.test.js (extend: exemplar pins Potensi 53,535,011 + tariff-only ≈73,453,750 stay derived from their own paths; dashboard source switch without generator upgrade fails),
           docs/COVER_SLOT_PLAN.md + docs/COVER_SLOT_MILESTONES.md (Verified lines + status),
           docs/SCOPE_EXPANSION_MILESTONES.md (append closure row only — no renumbering),
           docs/AUTO_PENUGASAN_PLAN.md (note D-AP1/D-AP2 revision scope in §10 only — no AP history rewrite)
  FINDS:   F-CS1–F-CS6
  RULES:   R-CS6; full loop npm test + npx playwright test tests/penugasan*.spec.js tests/trainer-attendance*.spec.js --workers=1 + php server/tests/entity.validation.php + php server/tests/endpoint.protection.php + npm run build; unrelated failures labeled pre-existing with git-stash evidence (taste #9); re-run original acceptance (CS.A.1 picked-save leg + CS.B.1 cover-403-gone leg + CS.C.1 I/A-price leg) before declaring done (taste #10); no console.log in src/ (grep gate), git status clean of artifacts; deploy/ only via npm run build:deploy
  DEPENDS: CS.C.1
  OUTCOME: the chain is regression-pinned with Dashboard-last enforced, and the source docs reflect what actually shipped.
  VERIFY:  npm test -> green; npx playwright test tests/penugasan*.spec.js tests/trainer-attendance*.spec.js --workers=1 -> green zero pageerror; npm run build -> green; node -e ID check -> every F-CS/D-CS/R-CS cited below exists in COVER_SLOT_PLAN.md
  DONE-IF: verify passes; only intended files changed
```

---

## Ordering rationale

- **CS.A.1 before CS.B.1:** the slot triple + overlap semantics must exist before a cover link can scope itself to a slot; building covers first would be unverifiable against rows that cannot yet persist scope (taste: smallest slice that runs end-to-end, falsifiable).
- **CS.B.1 before CS.B.2:** pay-eligibility (cover link) is the strong claim; role/external representation serializes on top of it. Strong first.
- **CS.B before CS.C:** honor math reads stored roles; pricing roles that cannot yet persist is untestable (taste #4).
- **CS.C.1 before CS.C.2:** row-pricing correctness first, guard + write-back last; regression + build + docs only after every behavior above is green.

## Deferred with owners

| Item | Owner / venue | Why deferred |
|---|---|---|
| Invoice-generator per-meeting upgrade | SPP_BILLING chain SB.B/SB.C (D-SB10) | Canonical-path build; this chain only guards the order (D-CS7) |
| Invoice-level payments / carry-over / credits | SPP_BILLING chain (D-SB8/R-SB6, SB.B.4) | Ledger economics, finance sign-off required |
| Honor payment scheduling + cash-flow deferral | Finance chain after Payable (EVALUATION_LOG Stages 5–6) | Payable must exist first (this chain builds it) |
| Dashboard source switch | After generator upgrade (Q2/P2) | P1/P2 lesson: Dashboard last |
| Trainer inline creation of externals | Future amendment + abuse review | Would broaden trainer write (taste #33) |
| Audit-log viewer UI | AUDIT chain | Server trail only; no UI requested |
| Slot-scoped honor weighting beyond role-first | Finance chain + explicit tariff source | Would change D-TA14 beyond D-CS6 |

## Completion contract

```text
slot-picked auto-create -> cover link (403 gone where linked, kept where not)
  -> per-session role + externals with recorder -> role-first honor
  -> dashboard-last guard + regression + build + write-back
```
