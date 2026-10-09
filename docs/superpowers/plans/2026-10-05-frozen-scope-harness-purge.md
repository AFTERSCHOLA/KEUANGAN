# Frozen Scope + Harness + Purge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze Jadwal/Kalender/Notif/Bell polish, wire server contract checks into `npm run test:server`, and remove the orphan Firebase prototype.

**Architecture:** Docs-only freeze registry with change gate; new Node wrapper reuses the XAMPP-PHP-with-fallback pattern from `scripts/run-db-reset.cjs` to run the existing `rc-verify.cjs` PHP battery order; single-file delete for the orphan after grep + build VERIFY. No entity, endpoint, dependency, or UI behavior change.

**Tech Stack:** Node (CJS scripts), PHP 8.2 via XAMPP path with PATH fallback, Vitest 4 (untouched), Windows cmd.exe.

**Spec:** User approval in chat 2026-10-05 (Option A: harness + freeze + orphan purge only, no functionality removal per client decree). Argues from `docs/UNIVERSAL.md` guardrails; executors read both.

## Global Constraints

- Windows cmd.exe: no heredocs; multi-line commits use repeated `-m` flags.
- No `console.log`/debug left in `src/`; `git status` clean of build artifacts.
- No new dependency, entity, table, endpoint, or route; preserve public interfaces and Indonesian copy.
- PHP binary: `D:\Games and Apps\xampp\php\php.exe` when present, else `php` on PATH (verbatim from `scripts/run-db-reset.cjs:12-18`).
- Server stays authoritative; harness never grants write and never touches prod DB (test DB `afterschola_t3_test` only where applicable).
- Destructive helpers excluded from battery: `db-reset.php`, `_cleanup_sim_data.php`, `_manual_seed_fixtures.php`.

## Review Focus

- Frozen doc edited without the change-gate section — expect gate checklist present (reason, client sign-off, VERIFY).
- `test:server` on machine without XAMPP and without PHP on PATH — expect non-zero exit naming the missing prerequisite, not a silent pass.
- Contract script fails mid-battery — expect early exit naming the script + stdout tail, later scripts reported NOT-RUN.
- `Projects.tsx` re-added by a teammate's uncommitted work — expect grep VERIFY to fail the delete rather than force it.
- `npm run test:server` run twice in a row — expect repeatable pass (endpoint.protection re-seed keeps order stable; no leftover `test_` rows breaking the second run).
- 7 newer checks (`throttle-csrf`, `service-token`, `remember`, `logo.endpoint`, `clear-throttle`, `attendance-bearer`) not in this battery — expect them listed as follow-up, never claimed as passing.

---

### Task 1: Frozen registry doc

**Files:**
- Create: `docs/FROZEN_SCOPE.md`
- Test: manual read (docs-only; no code test)

**Interfaces:**
- Consumes: `docs/UNIVERSAL.md` Scope and Roadmap Gate (nothing normative beyond it).
- Produces: Frozen table (`Area | Status | Since | Change gate`) consumed by all future work as scope guard.

- [ ] **Step 1: Write `docs/FROZEN_SCOPE.md`**

Create with: title + one-sentence goal (Jadwal/Kalender/Notif/Bell sufficient as-is, polish frozen); table with 4 rows (Jadwal Harian/Mingguan + CSV export, Kalender view + navbar shortcut, Notification bell H-1/H-day + deep-links, Reminders derivation) each `Status: Frozen`, `Since: 2026-10-05`; Change-gate section (plausible/sufficient reason required: client request or falsifiable bug with VERIFY, plus plan-doc update before code); Explicit non-goals (no UI removal, no behavior change).

- [ ] **Step 2: Verify doc shape**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('docs/FROZEN_SCOPE.md','utf8');for(const k of ['Jadwal','Kalender','Notif','Bell','Frozen','Change gate']){if(!s.includes(k))throw new Error('missing '+k)}console.log('FROZEN_SCOPE OK')"`
Expected: `FROZEN_SCOPE OK`, exit 0.

- [ ] **Step 3: Commit**

```bash
git add docs/FROZEN_SCOPE.md
git commit -m "docs: freeze jadwal-kalender-notif-bell scope" -m "Sufficient as-is per 2026-10-05 approval; changes need plausible reason + plan update"
```

### Task 2: `test:server` wiring for contract battery

**Files:**
- Create: `scripts/run-contract-battery.cjs`
- Modify: `package.json:6-17` (add `scripts.test:server`)
- Test: `npm run test:server` (live PHP battery)

**Interfaces:**
- Consumes: `PHP_BATTERY` order from `scripts/rc-verify.cjs:61-79`, corrected for disk drift (see note).
- Produces: `npm run test:server` -> exit 0 iff all listed checks pass; non-zero names failing script.

> Disk drift (Verified: `Get-ChildItem server/tests/*.php` -> 27 files; `Test-Path server/tests/invoice.generation.php` -> MISSING): `rc-verify.cjs` lists `invoice.generation.php` which no longer exists; disk has `invoice-billing.check.php` + `invoice-doc.check.php` instead. 3 helpers are never run (`db-reset.php`, `_cleanup_sim_data.php`, `_manual_seed_fixtures.php`). 7 newer checks not yet in the proven battery (`throttle-csrf.matrix.php`, `service-token.lifecycle.php`, `remember.check.php`, `logo.endpoint.php`, `clear-throttle.php`, `attendance-bearer.scope.php`, plus `invoice-doc/billing` split) stay as follow-up — this task runs the corrected proven set only and lists the rest as NOT-RUN follow-up, never silently claiming them.

- [ ] **Step 1: Implement `scripts/run-contract-battery.cjs`**

Mirror `scripts/run-db-reset.cjs:12-26` PHP resolution (XAMPP path else `php`, probe `php --version`, clear error if neither). Run this corrected 18-file order via `spawnSync(cmd,[rel],{stdio:'pipe'})`, print `OK: <rel>` per pass with one result line from stdout tail; on first failure print `FAIL: <rel>` + tail and exit non-zero listing remaining as NOT-RUN. After `server/tests/endpoint.protection.php`, run `npm run db:reset` re-seed before continuing (verbatim from `rc-verify.cjs:227-230`, keeps battery order-stable). Pre-check each file with `fs.existsSync`, fail as `battery file missing on disk` like `rc-verify.cjs:218`. No Playwright, no build.
```text
server/tests/identity.contract.php, session.bootstrap.php, login.lifecycle.php, schema.migration.php, authorize.policy.php, entity.validation.php, api.integration.php, invoice-billing.check.php, invoice-doc.check.php, superadmin.bootstrap.php, endpoint.protection.php (+ db:reset re-seed), users.endpoint.php, cascade-cleanup.php, cascade-orphan-cleanup.php, siswa-foto-purge.php, photo.endpoint.php, v4.import.php, reconcile.check.php
```

- [ ] **Step 2: Add npm script**

In `package.json` scripts add: `"test:server": "node scripts/run-contract-battery.cjs"`. No other script touched.

- [ ] **Step 3: Run battery to verify it passes**

Run: `npm run test:server`
Expected: exit 0, 18 `OK:` lines in the order above. If any FAIL, stop: bounded follow-up, do not patch app code here; report script + tail as `Unverified/Remaining`.

- [ ] **Step 4: Commit**

```bash
git add scripts/run-contract-battery.cjs package.json
git commit -m "feat: add test:server contract battery" -m "Reuses rc-verify PHP order + XAMPP fallback; excludes destructive helpers"
```

### Task 3: Purge orphan `Projects.tsx`

**Files:**
- Delete: `Projects.tsx` (tracked, 2174 lines Firebase prototype)
- Test: grep orphan VERIFY + `npm run build`

**Interfaces:**
- Consumes: nothing (standalone delete).
- Produces: repo without `Projects.tsx`; `git status` shows only the delete.

- [ ] **Step 1: Run orphan VERIFY (must pass before delete)**

Run: `node -e "const{execSync}=require('child_process');const out=execSync('git grep -n \"from.*Projects|import.*Projects|Projects\\.tsx\" -- . \":!:Projects.tsx\"',{encoding:'utf8'}).trim();if(out)throw new Error(out)"` (expect empty = no references) and `git ls-files | findstr Projects` shows only `Projects.tsx`.
Expected: grep empty; no importer. If any reference appears, STOP: report file:line, do not delete.

- [ ] **Step 2: Delete the file**

Run: `git rm Projects.tsx`
Expected: `git status --short` shows only `D Projects.tsx`.

- [ ] **Step 3: Verify build still green**

Run: `npm run build`
Expected: exit 0. Confirm `git status --short` still only the delete (no `dist/` or stray artifacts; `dist/` is gitignored).

- [ ] **Step 4: Commit**

```bash
git rm Projects.tsx
git commit -m "chore: remove orphan Projects.tsx Firebase prototype" -m "2174-line unused prototype; no references per git grep VERIFY"
```
