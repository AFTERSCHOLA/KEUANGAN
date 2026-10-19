# Exemplar Flow Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simulate the full business flow (Superadmin → Cabang → Sekolah/Siswa → Trainer → Penugasan → Absensi → SPP/Honor) against backup `docs/exemplar/afterschola_t3_test.sql` using current code, dropping conflicts per EXEMPLAR_MIGRATION.

**Architecture:** Read-only simulation: parse backup SQL for ground-truth counts, walk real frontend flow (`App.jsx` tabs + `finance.js`) and backend gates (`authorize.php`, `api/*.php`), recompute G5 money with real `billingForSekolah`/`financialData`, triage gaps per taste #30/#31.

**Tech Stack:** React SPA (no router, tab-state), PHP 8.2 + MariaDB 10.4 (`afterschola_t3_test`), Node 24, vitest 4, Playwright (deferred full run).

**Spec:** `docs/exemplar/afterschola_t3_test.sql` (582,993 bytes, 2026-09-25) + `docs/EXEMPLAR_MIGRATION.md` (G0–G5, F1–F15, Q1–Q8, B1) + `docs/EXEMPLAR_F6_CONFIRM.md` (OPEN) + `docs/UNIVERSAL.md` + `docs/IMPLEMENTATION_PLAN.md` + `docs/SCOPE_EXPANSION_PLAN.md` + `docs/SPP_BILLING_PLAN.md`

## Global Constraints

- UNIVERSAL.md checklist-first; one falsifiable hypothesis per check.
- No credentials in git (taste #41); passwords session-only.
- Server RBAC is authoritative (taste #61); UI/server mismatch = permission finding.
- Destructive verification steps last; test DB disposable, backup first (taste #55, D6).
- Smallest slice, verify immediately; never stack unverified changes.
- Bahasa Indonesia UI copy preserved; money = plain-digit entry, `150.000` display, numeric storage.
- `Verified: <command> -> <result>` / `Unverified: run <command>` language only.

## Review Focus

- Cover session billed (legacy `absensi` no gate) but honor-unpaid (`absensiPengajar` assignment gate) — which Q6 pick does team want?
- Per-session role honor (D2-revised) vs per-person `trainer.honor` + live `tipePengajar` label — when does G3/G5 microtask land?
- Second asisten dropped (single `asistenId`) — does Asisten-2 union already cover Sept data?
- SMP Sains sessions with zero pupils (F14) — bill on SD roster or register SMP pupils?
- EXPO billed vs honored asymmetry (Q5) — keep excluded-from-billing?

---

### Task 1: Freeze evidence + backup inventory

**Files:**
- Create: `docs/superpowers/plans/2026-10-09-exemplar-flow-simulation.md`
- Test: none (read-only audit)

**Interfaces:**
- Consumes: `docs/EXEMPLAR_MIGRATION.md` B1/G0, `git log/status`, `node/php/mysql --version`
- Produces: evidence table + INSERT-count table for Tasks 2–6

- [ ] **Step 1: Record one-sentence outcome + falsifiable check before reading**

```text
Outcome: backup inventory reproduces B1 counts exactly.
Check: rg counts for cbg-BDG-bandung/skl-BDG-/2026-09 match 2397/997/2779 or task fails.
```

- [ ] **Step 2: Run inventory (read-only, no restore)**

Run: `rg -c "cbg-BDG-bandung|skl-BDG-|2026-09" docs/exemplar/afterschola_t3_test.sql`
Expected: matches B1; `honor/spp/invoices` INSERT count 0

- [ ] **Step 3: Record branch/commit/tree state in plan evidence**

Run: `git branch --show-current; git log --oneline -5; git status --porcelain=v1`
Expected: `test-stage`, clean or explicitly listed deltas

- [ ] **Step 4: Run narrow build + unit gate**

Run: `npm run build` + `npm run test`
Expected: PASS (build ~6s, 322 tests)

### Task 2: Identity + cabang + sekolah/siswa flow (G1/G2)

**Files:**
- Modify: none (read-only)
- Test: `src/lib/__tests__` existing + live `read.php` branch filter

**Interfaces:**
- Consumes: Task 1 counts (2 cabang, 20 sekolah, 397 siswa)
- Produces: verdict table G1/G2 + dropped F2/F6/F8 list

- [ ] **Step 1: Write falsifiable check**

```text
Outcome: 20 canonical schools + 397 students resolve by ID joins.
Check: backup has 20 skl-BDG- rows + 397 sw-BDG- rows or FAIL.
```

- [ ] **Step 2: Verify G1/G2 against code**

Run: grep `server/api/cabang.php:38 manage_branch` + `sekolah.php:167-176 cabangId-from-session` + `siswa.php:33-35 cabangId-forbidden`
Expected: superadmin-only cabang writes; admin cabangId derived; G1 `mustChangePassword` rotation explains dump `0` (not a gap)

- [ ] **Step 3: Triage drops (taste #31)**

Dropped-carried (not patched): F2 SMPN18 `metode=null` flat; F6 aliases → `EXEMPLAR_F6_CONFIRM.md` OPEN, no merge/split; F8 empty student WA → M1-tolerated; MA+SDM3 zero pupils (F4-adjacent).

### Task 3: Trainer + penugasan flow (G3/G4a/G4b)

**Files:**
- Modify: none
- Test: `trainer.php:27-33` 403 probe + `penugasan.js:55 validateRowDates`

**Interfaces:**
- Consumes: Task 2 schools
- Produces: roster verdict (18 trainers, 25 rows, 23 slots) + F3/F9/F11 drops

- [ ] **Step 1: Write falsifiable check**

```text
Outcome: 8 Inti-capable + 9 asisten + 3 absensi-only resolve to 25 slot-scoped rows.
Check: backup trainer 20 total (18 BDG+2 test), penugasan rows 25, slots 23 or FAIL.
```

- [ ] **Step 2: Verify privilege boundary (taste #33)**

Run: grep `server/api/trainer.php:30-32` + `server/auth/authorize.php:302-304`
Expected: superadmin create 403 holds; admin.bandung path only

- [ ] **Step 3: Triage drops**

Dropped-carried: F3 per-session role vs `tipePengajar` live label + `pengajarHonorStats` per-person (unplanned, G3/G5 microtask); F9 2nd asisten + `asistenIds` absent (partially specified A2); F11 WA-less + typos canonicalized; F10 `Fleksibel/TEGANTUNG PJ` → null/deferred; F13 cover-without-assignment surfaced.

### Task 4: Attendance flow (G4c/G4d)

**Files:**
- Modify: none
- Test: `src/lib/trainerAttendance.js:14 resolveCurrent` + `finance.js:73 pengajarHonorStats`

**Interfaces:**
- Consumes: Task 3 assignments
- Produces: 69+69-c1 trainer rows + 70 siswa records verdict + F13/F14 drops

- [ ] **Step 1: Write falsifiable check**

```text
Outcome: Sept 69 Hadir (6 EXPO) + 70 siswa records JUMLAH-exact.
Check: backup absensi 70 + absensi_pengajar 138 (69+69-c1) with periode backfill or FAIL.
```

- [ ] **Step 2: Verify dual-gate asymmetry**

Run: grep `server/auth/authorize.php:203 vs :205-215` + `server/api/absensi.php:128-130`
Expected: legacy `absensi` ownership-only (cover writes 200) vs `absensiPengajar` ownership+assignment (same event 403) — recorded as F13, not patched

- [ ] **Step 3: Triage drops**

Dropped-carried: F13 3 expected-403 covers (no assignment invented); F14 SMP Sains 3 sessions/0 pupils; EXPO-only trainers write no `absensi`; 13 asisten-only cells skipped (no accounts).

### Task 5: Money flow (G5) — real code recompute

**Files:**
- Modify: none
- Test: `src/lib/finance.js:270 billingForSekolah` + `:104 financialData` + `:57 honorForPengajarRow`

**Interfaces:**
- Consumes: Tasks 2–4 (19 configured schools, Sept matrices)
- Produces: SPP 19/19 HIT + honor -850k decomposition + F15/Q-table

- [ ] **Step 1: Write falsifiable check**

```text
Outcome: real billingForSekolah HITs all 19 configured schools to the rupiah.
Check: node import recompute (e.g. Sains 13.750.000, Sabang 9.528.750, SDM7 22.050.000) or FAIL.
```

- [ ] **Step 2: Run spot recompute (no DB write)**

Run: `node -e "import('./src/lib/finance.js').then(...billingForSekolah spot...)"`
Expected: exact rupiah match; flat_legacy only SMPN18

- [ ] **Step 3: Triage drops**

Dropped-carried: F15 fractional `spp` legacy (rounding rule only); Q8 zero payment samples → settlement `Unverified`, synthetic fixtures only; invoice `penerima/follow-up` (F12) deferred additive metadata; Q1–Q7 with team.

### Task 6: Alignment + report (taste #68/#30/#31)

**Files:**
- Create: `docs/EXEMPLAR_SIMULATION_2026-10-09.md` (single-doc, taste #69 short-task)
- Modify: none in `src/`/`server/`

**Interfaces:**
- Consumes: Tasks 1–5 verdicts
- Produces: severity-ordered report (bugs → permission gaps → redundancies → UX → adds) + quick wins + `Verified/Unverified/Remaining`

- [ ] **Step 1: Build alignment table docs-vs-findings**

Check: every F/Q maps to IMPLEMENTATION / SCOPE_EXPANSION / SPP_BILLING / PRODUCTION or `Unplanned`
Expected: zero unmapped findings

- [ ] **Step 2: Run full unit gate once more before claiming**

Run: `npm run test` + `npm run build`
Expected: PASS; full Playwright deferred as `Unverified` with drift owners (D1–D4)

- [ ] **Step 3: Close with smallest next action as question (taste #64)**

Expected: report ends with `Want me to implement <group>?` not autonomous edits
