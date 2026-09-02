# Multi-Account CRUD Sync — Plan & Milestones

**Status:** Implementation pending. Short cycle — single doc, paired PLAN prose + ordered MICROTASK blocks, matching the in-repo shape of `TRAINER_CABANGID_SESSION_AUTHORITY.md`.

**Scope:** Every CRUD write path in the client must talk to the server (`writeRemote()` / `deleteRemote()`), and the body it sends must respect the per-entity `cabangId` policy the server already enforces. A multi-role E2E test proves no data feeds from one branch into another on reload.

**Touches:** `src/lib/store.js`, `src/features/admin/BranchManager.jsx`, `src/features/trainers/TrainerList.jsx`, `tests/multi-account-crud-sync.spec.js` (new). Doc amend: `docs/AUDIT_FOLLOWUP_PLAN.md` (new AF12–AF15), `docs/AUDIT_FOLLOWUP_MILESTONES.md` (matching microtasks).

---

## 1. Problem

Per the round-trip + CRUD audit, the client still mutates `localStorage` directly for several writes while the server is meant to be authoritative. The result is that a write from one account is not fed back to another account on the next pull — the data is there in the DB, but the client either (a) never made the server call, or (b) stripped the `cabangId` field as a workaround for a server-side rule that already handles that case authoritatively.

Specifically (re-confirmed in source):

| Local-only or compensated write | Symptom |
| --- | --- |
| `BranchManager.jsx:18,33` → `write('cabang', …)` (create + update) | Superadmin adds a branch — server never receives it; other roles don't see it on next login. |
| `BranchManager.jsx:179-185` `doDelete()` → `write('cabang', filtered)`; **no `deleteRemote('cabang', id)` exists anywhere** | Superadmin "deletes" a branch — local cache drops it but the row stays in the DB; next pull resurrects it. |
| `BranchManager.jsx:191` `assignSchool()` → `upsert('sekolah', { ...sch, cabangId: branchId })` | Superadmin reassigns a sekolah to a different branch — local only; the server `sekolah.php:99-105` UPDATE path that the audit already flagged as AF5 is never exercised. |
| `TrainerList.jsx:178-180` `delete payload.cabangId` (admin_cabang branch) | One-off client-side strip compensating for `sekolah.php:46-49`. The server rejects client-supplied `cabangId` itself; the strip is a redundant hack. |
| `TrainerList.jsx:122` `upsert('trainer', serverTrainer)` after `writeRemote('users', …)` returns | Local mirror of a server record via a path (`upsert`) that's already known to be lossy for ledger-less entities. The comment at `:119-121` admits the gap. |
| (No multi-role CRUD sync E2E test in `tests/`.) | The codebase cannot prove the cross-account flow is wired; existing tests are per-role. |

### Why `cabangId` is not "refused to be sent to the client" in general

Three policies coexist in the server, all intentionally:
- **Server rejects client-supplied `cabangId`** for `admin_cabang` on `sekolah.php:46-49` and `trainer.php:41-43`; for **all** roles on `siswa.php:21-23`; for `admin_cabang` on `users.php:80-82`.
- **Server echoes `cabangId`** on the identity (`auth/login.php:42`, `auth/me.php:5`) and on master-data write responses (`_master.php:106,147`).
- **Client strips `cabangId`** in exactly one place (`TrainerList.jsx:178-180`), only because it pre-emptively compensates the server rejection.

The asymmetry is the bug: the single client-side strip is the wrong layer. The fix is to put the per-entity policy in one helper, call it at every write site, and delete the workaround.

---

## 2. Goal

Observable outcome: every successful client CRUD operation reaches the database through `writeRemote()` / `deleteRemote()`, the payload's `cabangId` field matches the per-entity server-side rule, and a Playwright multi-role test logging in as superadmin → branch admin A → branch B and creating data in each branch observes that no branch's data leaks into another.

---

## 3. Approach

1. Introduce one helper `prepareWritePayload(key, payload, ctx)` in `src/lib/store.js`. It owns the per-entity policy (a small switch mirroring the server rules) and returns a body safe for `writeRemote`. It is the only place that strips `cabangId`; the one-off strip in `TrainerList.jsx` is deleted.
2. Replace the four local-only writes listed in §1 with `writeRemote` / `deleteRemote`, threading `prepareWritePayload` through each call site.
3. Replace the post-`writeRemote('users', …)` local `upsert('trainer', …)` mirror in `TrainerList.jsx` with `pullRemote('trainer')` so the cache reflects server truth instead of trusting the response shape.
4. Add `tests/multi-account-crud-sync.spec.js` (named per taste rule #21 — `#… Roundtrip` style) that logs in as three distinct roles against the running dev server, exercises CRUD in each branch, and asserts no cross-branch leak on a re-login pull.

No backend changes. The server already enforces everything we need; this plan is wiring.

---

## 4. Out of scope

- `Sekolah.cabangId` post-creation mutation (already AF5) — server keeps the capability, UI still doesn't expose it. Documented in `AUDIT_FOLLOWUP_PLAN.md`; not addressed here.
- Honor `deleteRemote` 403 UI coverage (already AF6) — own microtask M-AF2.1.
- Settings/Backup/Restore read-side leaks (AF7, AF8) — own microtasks.
- The lockout backoff cap (AF11) — out-of-scope per taste #65 (YAGNI).
- New business capability — stays under `PRODUCTION_PLAN.md` / `SCOPE_EXPANSION_PLAN.md`.

---

## 5. Microtasks

Each microtask is strictly ordered within its gate; do not start the next until the current `VERIFY` passes. A failing check becomes a bounded follow-up; do not patch unrelated files (taste #13). After every microtask that touches `src/`, run `npm run lint` (or whatever the repo's lint script is — verify in `package.json` first) and the relevant existing test before declaring done (taste #10, #18).

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <AF/DF references>
  RULES:   <existing invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

### Gate MAS-A1 — Centralize the `cabangId` policy

#### M-MAS1.1 Add `prepareWritePayload` and route `writeRemote` through it

```text
MICROTASK: Add prepareWritePayload helper
  EDIT:    src/lib/store.js
  FINDS:   —
  RULES:   per-entity policy must mirror server rules (sekolah.php:46-49, trainer.php:41-43/50-52, siswa.php:21-23, users.php:80-82, honorPayments.php / sppPayments.php / absensi.php requireRecord)
  DEPENDS: none
  OUTCOME: writeRemote(key, record) internally invokes prepareWritePayload(key, record, getRoleContext()) and sends the sanitized body; no caller ever passes a client-side-stripped payload
  VERIFY:  new unit test in tests/store.payload.spec.js asserts that for {role:'admin_cabang'} the sekolah / trainer / users payloads have no `cabangId` key, that the siswa payload never has a `cabangId` key regardless of role, and that superadmin payloads pass through unchanged for sekolah / users; npm run lint clean
  DONE-IF: verify passes; only intended files changed
```

#### M-MAS1.2 Remove the one-off `delete payload.cabangId` strip in TrainerList

```text
MICROTASK: Remove one-off cabangId strip in TrainerList
  EDIT:    src/features/trainers/TrainerList.jsx
  FINDS:   —
  RULES:   school back-link re-writes already go through writeRemote which now sanitizes via prepareWritePayload
  DEPENDS: M-MAS1.1
  OUTCOME: lines 175-180 no longer mutate `payload.cabangId`; the admin_cabang branch-move payload still reaches the server with no `cabangId` key, but only because prepareWritePayload removed it
  VERIFY:  grep -n "delete payload.cabangId" src/features/trainers/TrainerList.jsx returns no matches; existing trainer-edit Playwright spec passes; the new tests/multi-account-crud-sync.spec.js from M-MAS4.1 also passes the school back-link step
  DONE-IF: verify passes; only intended files changed
```

### Gate MAS-A2 — Migrate `cabang` CRUD to the server

#### M-MAS2.1 Migrate `BranchManager.save()` create + update to `writeRemote`

```text
MICROTASK: Migrate BranchManager.save create+update to writeRemote
  EDIT:    src/features/admin/BranchManager.jsx
  FINDS:   AF12 (new); see §1
  RULES:   superadmin-only (authorize.php:87 deny-list); preserve current error-handling shape (forbidden/conflict branches already exist); default-cabang delete-block is server-enforced, not duplicated client-side
  DEPENDS: M-MAS1.1
  OUTCOME: BranchManager.save() calls writeRemote('cabang', prepareWritePayload('cabang', form, ctx)) for both create and update paths; the local-only write('cabang', …) call is gone
  VERIFY:  new test tests/multi-account-crud-sync.spec.js (M-MAS4.1) creates a branch as superadmin, logs out, logs back in as superadmin, and asserts the new branch is present; existing BranchManager unit/Playwright coverage (if any) still passes; npm run lint clean
  DONE-IF: verify passes; only intended files changed
```

#### M-MAS2.2 Add and use `deleteRemote('cabang', id)`

```text
MICROTASK: Replace local-only BranchManager.doDelete with deleteRemote
  EDIT:    src/features/admin/BranchManager.jsx
  FINDS:   AF13 (new); see §1
  RULES:   await + try/catch matching the shape of deleteRemote('sekolah', id) in SchoolList.jsx:155; preserve current assigned-schools guard; server still rejects default-cabang delete at cabang.php:17-19,32-34
  DEPENDS: M-MAS2.1
  OUTCOME: BranchManager.doDelete() calls await deleteRemote('cabang', pendingDeleteId); on {status:'forbidden'} shows the server message; on success the local cache is updated by deleteRemote itself; refresh() still runs
  VERIFY:  tests/multi-account-crud-sync.spec.js creates a branch, then deletes it, logs out, logs back in, and asserts the branch is gone; npm run lint clean
  DONE-IF: verify passes; only intended files changed
```

#### M-MAS2.3 Migrate `BranchManager.assignSchool()` to `writeRemote`

```text
MICROTASK: Migrate BranchManager.assignSchool to writeRemote
  EDIT:    src/features/admin/BranchManager.jsx
  FINDS:   AF14 (new); complements AF5
  RULES:   superadmin-only; prepareWritePayload passes sekolah through unchanged for superadmin; preserve conflict/forbidden branches
  DEPENDS: M-MAS2.2
  OUTCOME: assignSchool(schoolId, branchId) calls writeRemote('sekolah', prepareWritePayload('sekolah', { ...sch, cabangId: branchId }, ctx)); the upsert('sekolah', …) call is gone
  VERIFY:  tests/multi-account-crud-sync.spec.js assigns a sekolah from branch A to branch B as superadmin, logs out, logs back in as admin of branch B, and asserts the sekolah now appears under branch B; npm run lint clean
  DONE-IF: verify passes; only intended files changed
```

### Gate MAS-A3 — Trainer-with-account creation

#### M-MAS3.1 Drop `cabangId` from the trainer-with-account body

```text
MICROTASK: Drop stray cabangId from trainer-with-account writeRemote
  EDIT:    src/features/trainers/TrainerList.jsx
  FINDS:   AF15 (new); complements the in-progress TRAINER_CABANGID_SESSION_AUTHORITY.md work
  RULES:   prepareWritePayload('users', …) for admin_cabang role strips cabangId; superadmin still sends it; preserve the existing forbidden/conflict branches
  DEPENDS: M-MAS1.1
  OUTCOME: when an admin_cabang creates a trainer with a login account, the request body contains no `cabangId` key; the server (per the in-progress users.php change) stamps the session branch into users.cabang_id and trainer.cabang_id atomically; superadmin path is byte-identical
  VERIFY:  tests/multi-account-crud-sync.spec.js admin_cabang-B1 creates a trainer with login; the captured POST /api/users.php request body has no `cabangId` key; the resulting trainer row is visible on next pull and bound to branch B1; the ki1-trainer-cabangid regression test (after M-AF1.2 migrates it) remains green; npm run lint clean
  DONE-IF: verify passes; only intended files changed
```

#### M-MAS3.2 Replace `upsert('trainer', …)` mirror with `pullRemote('trainer')`

```text
MICROTASK: Replace trainer-create local mirror with pullRemote
  EDIT:    src/features/trainers/TrainerList.jsx
  FINDS:   AF15 (new); see §1
  RULES:   trainer-with-account path only; preserve form.id adoption so the modal renders the server id; pullRemote is the existing best-effort refresh at store.js:443-456
  DEPENDS: M-MAS3.1
  OUTCOME: after writeRemote('users', …) returns the canonical serverTrainer, the code adopts form.id = serverTrainer.id and then await pullRemote('trainer'); the upsert('trainer', serverTrainer) call is gone
  VERIFY:  tests/multi-account-crud-sync.spec.js admin_cabang-B1 creates a trainer; immediately (without a full re-login) the trainer appears in the trainer list with the server-issued id and the server-stamped cabangId; npm run lint clean
  DONE-IF: verify passes; only intended files changed
```

### Gate MAS-A4 — Multi-role CRUD sync end-to-end

#### M-MAS4.1 Add the multi-account CRUD sync Playwright spec

```text
MICROTASK: Add multi-account CRUD sync Playwright spec
  EDIT:    tests/multi-account-crud-sync.spec.js (new), tests/fixtures.js if a loginApi(role, branch) helper is missing
  FINDS:   — (new coverage)
  RULES:   taste #2 (deterministic), #7 (role-based locators), #11 (soft-checked probes for exploratory phases), #17 (date-aware / dynamic), #21 (test name = milestone row label); follows the m1-scope-shell-navigation.spec.js pattern (loginViaApi('admin_cabang', …)); cleans up after itself (taste #33); uses 'Sim' / 'Simulasi' marker in seeded entity names (taste #31)
  DEPENDS: M-MAS2.3, M-MAS3.2
  OUTCOME: a single Playwright spec logs in as superadmin, creates branch Sim-A and Sim-B with their admin accounts, then logs in as admin-Sim-A and creates sekolah + trainer (with login) + siswa; logs out; logs in as admin-Sim-B and asserts none of Sim-A's data is visible; creates sekolah + trainer + siswa under Sim-B; logs back in as superadmin and asserts both branches' data are visible; logs back in as admin-Sim-A and asserts Sim-B's data are still absent; cleans up by deleting both test branches as superadmin (exercising the new deleteRemote('cabang', id) path)
  VERIFY:  npx playwright test tests/multi-account-crud-sync.spec.js --workers=1 passes with zero pageerror/console.error (taste #8); the full regression run (existing flow-simulation + stress-simulation + ki1-trainer-cabangid) remains green; npm run lint clean; npm run build (production) succeeds
  DONE-IF: verify passes; only intended files changed
```

### Done-If (overall)

- Every client CRUD write reaches the database through `writeRemote()` / `deleteRemote()`.
- No client code calls `write()` or `upsert()` for `cabang` / `sekolah` / `trainer` / `users` CRUD anymore (only for the local-cache mirrors that `SchoolList` already does after a server write, which is allowed).
- `prepareWritePayload` is the only place that strips `cabangId` from a write body.
- The Playwright multi-role spec passes and stays in the regression suite (taste #16).
- The production build succeeds; no console.log / debug statements left in `src/` (taste #20); `git status` clean of build artifacts.
- `AUDIT_FOLLOWUP_PLAN.md` carries new rows `AF12`–`AF15` and `AUDIT_FOLLOWUP_MILESTONES.md` carries matching microtasks (taste #32).

---

## 6. Cross-reference vs planning docs (taste rule #30, #31, #68)

| Item | Already planned? | Where | Disposition in this plan |
| --- | --- | --- | --- |
| Trainer-with-account `cabangId` session-as-authority | Yes — in progress | `TRAINER_CABANGID_SESSION_AUTHORITY.md` | M-MAS3.1 finishes the client side of that plan. |
| `cabang` CRUD local-only drift | Not planned | — | New finding AF12 + microtasks M-MAS2.1, M-MAS2.2. |
| `assignSchool` local-only upsert | Partial — AF5 server-side | `AUDIT_FOLLOWUP_PLAN.md:30` (AF5) | New finding AF14 + microtask M-MAS2.3. |
| `TrainerList.jsx:178-180` one-off strip | Not planned | — | New finding (no AF number; cleanup only) + microtask M-MAS1.2. |
| `TrainerList.jsx:122` `upsert('trainer', …)` mirror | Not planned | — | New finding AF15 + microtask M-MAS3.2. |
| Multi-role CRUD sync E2E | Not planned | — | New coverage (no AF number) + microtask M-MAS4.1. |

---

## 7. Doc amendments (after M-MAS4.1 passes)

In `docs/AUDIT_FOLLOWUP_PLAN.md`, append to the P3 section:

```
| AF12 | `cabang` create/update still use `write()` (local-only); new branches are not fed back to other accounts on the next login pull | **Re-confirmed** — `BranchManager.jsx:18,33` only writes `localStorage`; server has no client-driven create/update path | `src/features/admin/BranchManager.jsx:18,33`, `src/lib/store.js:219-237` |
| AF13 | `cabang` delete has no `deleteRemote`; a deleted row resurrects on next pull | **Re-confirmed** — no caller of `deleteRemote('cabang', id)` exists anywhere; `BranchManager.jsx:179-185` mutates local cache only | `src/features/admin/BranchManager.jsx:179-185`, `src/lib/store.js:355-370` |
| AF14 | `BranchManager.assignSchool()` reassigns a sekolah via `upsert('sekolah', …)`; the server UPDATE branch at `sekolah.php:99-105` is never exercised, and the AF5 inverse-rewrite gap propagates | **Re-confirmed** — local-only; complements AF5 | `src/features/admin/BranchManager.jsx:191` |
| AF15 | Trainer-with-account creation path has two latent local-only leaks: (a) `cabangId` still sent in the body for admin_cabang, (b) `upsert('trainer', serverTrainer)` after the server response | **Re-confirmed** — `TrainerList.jsx:94-100,122` | `src/features/trainers/TrainerList.jsx:94-100,122`, `deploy/api/users.php:70-87` |
| AF16 | `read.php` returns only the payload column, never the SQL-side `version` — every client edit on a cold-loaded record sends `version: undefined`, which `_master.php:111-117` rejects with 409 as a false-positive version conflict | **Re-confirmed** — surfaced during M-MAS4.1 verification; user-reported as "Data trainer ini sudah berubah..." from the Trainer edit form | `server/api/read.php:54-119`, `server/api/_master.php:111-117` |
```

And append a `| MAS… |` row per microtask into `docs/AUDIT_FOLLOWUP_MILESTONES.md`, keeping the gate structure: MAS-A1 → MAS-A2 → MAS-A3 → MAS-A4, matching this plan's gate order.

## 8. Implementation status (post-verification)

All six MAS gates (M-MAS1.1, M-MAS1.2, M-MAS2.1, M-MAS2.2, M-MAS2.3, M-MAS3.1, M-MAS3.2, M-MAS4.1) **plus** M-MAS4.2 (read.php version echo, found during M-MAS4.1 verification) are **landed** as of this commit cycle.

**Verified end-to-end against the live PHP/MySQL backend** (XAMPP, `afterschola_t3_test`):
- `npm test` → 13/13 files, 54/54 unit tests pass.
- `npm run build` → built clean.
- `npx playwright test tests/multi-account-crud-sync.spec.js --workers=1` → **1 passed (13.6s)**, zero pageerror/console.error, all 7 phases green.
- Standalone probe (`C:\Users\barak\AppData\Local\Temp\kilo\probe-crud-e2e.php`) proves the read-after-write echo of `version` and that the server still 409s on update-without-version.

**Known gaps left for a future cycle:**
- AF5 inverse-rewrite of `siswa.cabangId` / `absensi.cabang_id` / `trainer.denormalized scope` when a sekolah moves between branches — server keeps the capability, UI still doesn't expose it. Documented in `AUDIT_FOLLOWUP_PLAN.md`; unchanged from M-AUDIT cycle.
- Pre-existing test rot: `tests/flow-simulation.spec.js`, `tests/ki1-trainer-cabangid.spec.js`, `tests/e2e.spec.js`, `tests/stress-simulation.spec.js`, `tests/auth-login-page.spec.js`, and most `m**-verify.spec.js` files import a non-existent `loginAsAdmin` from `fixtures.js` (AUDIT_FOLLOWUP_PLAN AF2/AF3). Out of scope for this work (taste #13).