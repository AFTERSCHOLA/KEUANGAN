# Manual App Audit — App-vs-Tests, 2026-09-04

> **Author:** Kilo (primary agent, repo-grounded)
> **Trigger:** User-supplied 30 manual-audit findings (Superadmin / Admin Cabang / Trainer)
> **Method:** Read each touched component, cross-reference with `PRODUCTION_PLAN.md`, `SCOPE_EXPANSION_PLAN.md`, `SCOPE_EXPANSION_PRIVILEGES.md`, and the current `server/api/*` source. Per taste #45 (severity-ordered audit), #68 (alignment table vs. docs), #46 (fact-check user examples against source).
> **Scope:** Frontend `src/` and only the `server/api/*` files the findings surfaced. No live-browser repro possible in this session — flag for next session where indicated.
> **Status:** Report only. **No code edits.** The next session will turn F-IDs into microtasks (per taste #64, smallest concrete next action).

---

## 0. Goal and falsifiable check (taste #3)

**Goal:** Produce a single severity-ordered audit report that the next session can convert into a bounded microtask chain (modify existing chains vs. write new `*_PLAN.md` + `*_MILESTONES.md`), so the team can decide fix vs. accept per finding.

**Falsifiable check:** Every finding has a stable `F##` ID, a `verdict` ∈ {drift, gap, intentional-evolution, ghost-test, fact-error}, file:line evidence, and an explicit `recommended action` referencing an existing doc or chain. Reading the `Alignment table` (§4) plus the `Severity-ordered findings` (§2) answers: *what is the app actually doing, and does that match the docs / the team's expectation?* without further reading.

---

## 1. Headline summary (taste #45 ranked quick wins)

| Rank | Finding | One-line verdict | Severity |
|---|---|---|---|
| 1 | **F-04 RESOLVED (D-04 = A)** — server cascade fix filed as `D-X.X` (`_master.php:170-178`, `trainer.php:24`) | `users` is not scanned in either the `isCabang` branch (cabang delete) or trainer delete. So `users.cabang_id` AND `users.trainer_id` both become orphan FKs on delete. Real **server-side data-integrity bug** that matches the team's #014-#016 symptom *and* the same class on trainer. Decision: `UPDATE users SET active=0, FK=NULL` on cascade. | **Server bug, ready to fix** |
| 2 | **F-01 Sekolah delete-without-confirm when 0 siswa** (`SchoolList.jsx:125-134`) | When a sekolah has 0 siswa, the delete path skips `ConfirmDialog` and calls `doDelete(id)` directly. With-siswa path uses `confirmLabel="Reassign ke sekolah lain"` — the team reads it as "instantly deleted" because no dialog appears at all in the no-siswa branch. `#008` is correct. | **Immediate bug** |
| 3 | **F-02 Sekolah form's stale `cabang` dropdown** (`SchoolList.jsx:15-18`) | `cabang` is read once at mount into local state; `SchoolList` does not subscribe to `subscribeStore` and there is no `BroadcastChannel`/`storage` listener anywhere in `src/`. Same-tab and cross-tab deletes both leave the dropdown stale. Real **frontend stale-cache** bug. Matches #017, #018. | **Immediate bug** |
| 4 | **F-03 Modal positioning: AccountMenu exonerated, cause still unverified** (`AppModal.jsx:84`, `AccountMenu.jsx:21-35`) | `AccountMenu` has proper `mousedown` close + Escape close, and its `z-50` lives in the header's `z-40` stacking context — so the AccountMenu is NOT the cause. Modal is `z-50`; sidebar/header are `z-40`/none. Cause remains unverified (ancestor `transform`/`filter`/scroll-state). **Needs live-browser repro.** | **Logic/permission** (unverified) |
| 5 | **F-23 RESOLVED (D-23 = B)** — keep re-auth; not a bug | Server enforces re-auth (`change-password.php:16`); decision: don't weaken. F-23 closed, no microtask. | n/a (closed) |
| 6 | **F-20 RESOLVED (D-20 = A)** — hard-remove siswa.foto + migrate legacy to `foto: null` | Confirmed present at `StudentList.jsx:317-319`. 2 microtasks: `M-AF-SISWAFOTO-1` (UI) + `M-AF-SISWAFOTO-2` (idempotent `JSON_SET` migration). | **Privacy decision** (resolved) |
| 7 | **F-05 RESOLVED (D-05/D-22 = B)** — keep plan, follow Phase A→B→C sequence | `ExecutiveSummary.jsx` is on the Phase B6 roadmap. The team's "use Bootstrap collapse" suggestion is a redesign, accepted as "just a matter of time" per taste #31. | **Planned, deferred** |
| 8 | **F-22 RESOLVED (D-05/D-22 = B)** — keep plan, follow Phase A→B→C sequence | Confirmed at `InvoiceModal.jsx:12, 95-99` (mode is `bulanan|semester`, semester is binary Ganjil/Genap). B4 (custom range) is on the plan, deferred per taste #31. | **Planned, deferred** |
| 9 | **F-06 "Salin" button has no copy feedback** (`TrainerList.jsx:371-374, 385-388`; `BranchManager.jsx:333, 347`) | `navigator.clipboard.writeText` only; no `setState`, no toast, no `aria-live`. Pure UX defect across 4 sites. | **UX/styling** |
| 10 | **F-07 Trainer "Honor" allows leading-zero** (`TrainerList.jsx:427-430`) | Plain `<input type="number">` + `Number(e.target.value)` — `Number("01000000")` → `1000000`. Differs from the `RupiahInput` contract (`src/components/RupiahInput.jsx:29-31`). Inconsistent. | **Redundancy to fix** |
| 11 | **F-08 Trainer scroll-freeze: TrainerDashboard code is not the obvious culprit** (`TrainerDashboard.jsx:1-97`) | The dashboard is small (97 lines), no chart library, no heavy `useEffect`. `financialData()` runs synchronously on every render but is not memoized — could be heavy on real data, but not a containing-block trap. **Root cause still unverified.** | **Logic/permission** (unverified) |
| 12 | **F-09 Absensi "Antrean Verifikasi" / "Semua" toggle semantics** (`RiwayatAbsensi.jsx:12, 44, 58-65`) | `showAll` toggle *is* present and switches the heading between "Antrian Verifikasi" and "Semua Absensi". The team's confusion (#029, #030) is a **discoverability/labeling** problem, not a missing feature. | **UX/styling** |

**The first 4 are app-side defects that need to be filed; F-23 and F-20 are decision-gated; the rest are mostly UX/labeling work that fits an existing chain (PLAYWRIGHT_MIGRATION PM.5+ styling microtasks or AUDIT_FOLLOWUP).** This matches the Option A → Option B prediction in the prior session.

---

## 1a. User decisions surfaced (per taste #25)

These are the 6 decisions the next session needs *before* filing microtasks. Each has full evidence in this report and an explicit A/B/C choice. **No code is filed in this session; the user picks the option, and the next session files accordingly.** The "Default if no answer" column is the audit's recommendation if the user declines to pick; the user can override by naming the letter or the option.

### Resolved (this turn)

| Decision | User pick | F-### affected | Action |
|---|---|---|---|
| D-04 cascade policy | **(A)** — `UPDATE users SET active=0, FK=NULL` on cascade | F-04 | File as a `D-X.X` server microtask in **PRODUCTION_MILESTONES.md**. Audit row per `users.php:347` already exists for `user_deactivated`; add `user_cascade_deactivated` event. |
| D-23 password re-auth | **(B)** — keep re-auth always; no weakening | F-23 | **No microtask filed.** F-23 is closed as "by design, not a bug." Update the team-facing note accordingly. |
| D-20 siswa.foto removal | **(A)** — hard-remove + migrate existing rows to `foto: null` | F-20 | File `M-AF-SISWAFOTO-1` (UI removal) + `M-AF-SISWAFOTO-2` (data migration) in **AUDIT_FOLLOWUP_MILESTONES.md**. |
| D-10 file-picker scope | **(B)** — extend SCOPE_EXPANSION (Phase A2 covers attendance photos; add sekolah/logo as A2.5) | F-10, F-19 | File as SCOPE_EXPANSION Phase A2.5 microtask(s). No new chain. |
| D-18 jadwal UI shape | **(B)** — list of `{dayOfWeek, time}` entries with "Add jadwal" button | F-18 | File as SCOPE_EXPANSION microtask (chain already extended by D-10). |
| D-05/D-22 B4/B6 prioritization | **(B)** — follow the planned Phase A→B→C sequence | F-05, F-22 | **No microtask filed** beyond what the plan already specifies. F-05 and F-22 are accepted as "just a matter of time" (taste #31). |

---

## 2. Severity-ordered findings (taste #45)

Format: `F## | severity | finding | evidence: file:line | verdict | recommended action`.

### 2.1 Immediate bugs (real, reproducible defects)

**F-01 | Critical | Sekolah delete-without-confirm when 0 siswa**
- Evidence: `src/features/schools/SchoolList.jsx:125-134` (the `remove(id)` function). Lines 125-132 open `ConfirmDialog` only when there is at least one siswa to reassign. Line 133 `doDelete(id)` is called immediately otherwise. Sub-agent confirmed: the *only* delete site in the app that bypasses `ConfirmDialog` is `SchoolList.jsx:133`; all other destructive flows (Trainer, Student, Cabang, BackupRestore) are confirmed (`TrainerList.jsx:260,405`; `StudentList.jsx:137,275`; `BranchManager.jsx:368-375`; `BackupRestorePanel.jsx:99`).
- Note: the Sekolah confirm dialog at `SchoolList.jsx:205-212, 295-302` has `confirmLabel="Reassign ke sekolah lain"` (not "Hapus"); its `onConfirm` is `openReassign` (line 211) which then drives a re-assign-and-delete flow. The team reads this as "instantly deleted" because when there are no siswa, no dialog appears at all. Two separate UX issues collapse into one team complaint: (a) the no-siswa path has no confirm, (b) the with-siswa path's label says "Reassign" which doesn't read as a delete.
- Verdict: **drift** — the team expects every delete to confirm; the current code confirms only when there is cascade work to do.
- Recommended action: Open `ConfirmDialog` unconditionally before `doDelete(id)`, with a clearer body and `confirmLabel="Hapus"`. Belongs in **AUDIT_FOLLOWUP_MILESTONES.md** as a new microtask (e.g., `M-AF-DEL-1`). Per taste #15, wire the existing `ConfirmDialog` to a real validation guard rather than building a new pattern.

**F-02 | Critical | `cabang` dropdown goes stale after delete in another tab**
- Evidence: `src/features/schools/SchoolList.jsx:15-18` — `useState(() => readCached('cabang'))` once on mount. Lines 34-38 `refresh()` re-reads `cabang`, but only after a user-initiated `save()` or `doDelete()` *within the same tab*. There is no `useEffect` subscribing to `subscribeStore` in this component. Sub-agent confirmed there is **no `BroadcastChannel` or `storage` event listener anywhere in `src/`** — the `afterschola_v4_changed` event fired by `notifyStoreChanged` (`store.js:23-25`) only reaches listeners in the *same tab* (i.e. the `BranchProvider` at `store.js:589-609`, which `SchoolList.jsx` does not consume). So:
  - Same-tab delete from another component: dropdown stays stale until the user does a same-tab action that calls `refresh()`.
  - Different-tab delete (multi-tab testing): dropdown stays stale until full page reload.
- Verdict: **drift** — the rest of the app's data is keyed on local-state-init-from-cache; this is a known fragile pattern but the dropdown's user-visible impact is a real bug, and it spans *both* the within-tab and cross-tab cases.
- Recommended action: Add `useEffect(() => { return subscribeStore(() => setCabang(readCached('cabang'))) }, [])` to `SchoolList.jsx` (mirrors `BranchProvider` at `store.js:596-600`), and *also* add a `window.addEventListener('storage', ...)` listener to cover the cross-tab case. Belongs in **AUDIT_FOLLOWUP_MILESTONES.md** as `M-AF-CACHE-1`. Per taste #62, when sub-agents are blocked, fall back to direct file reads — the cross-tab part of this finding was surfaced by direct `store.js` inspection.

**F-04 | Critical | Server cascade omits `users` (compound across cabang + trainer) — RESOLVED via D-04 = A**
- Evidence (post 6-file read pass):
  - `_master.php:170-178` — `isCabang` cascade scans `sekolah, trainer, siswa, absensi, spp_payments, honor_payments, invoices` but **not `users`**. After `cabang` delete, `users.cabang_id` becomes an orphan FK.
  - `trainer.php:24` — trainer delete calls `masterDelete('trainer', $user)`. Since `users` is not in the cascade scan, `users.trainer_id` is also orphaned.
  - `siswa.php:21-22` — siswa delete calls `nullifyAbsensiSiswaId()` (M-AF1.3) then `masterDelete('siswa', $user)`. The absensi cascade is correct. `sppPayments` is intentionally preserved (append-only, per the file comment at line 19). Siswa is the *clean* case — no users/ledgers to break.
- **Decision (D-04 = A):** `UPDATE users SET active = 0, cabang_id = NULL` (or `trainer_id = NULL`) on cascade. Preserves audit, locks the user out, mirrors the existing `users.php:345` soft-delete pattern.
- Recommended action: 1 server microtask filed in `PRODUCTION_MILESTONES.md` as `D-X.X` (assign next available D-number; per taste #74 renumber downstream). The fix:
  1. In `_master.php:170-178` (the `isCabang` branch), before the `DELETE FROM {$config['table']}`, run: `UPDATE users SET active = 0, cabang_id = NULL WHERE cabang_id = :id AND active = 1`. Wrap in a transaction with the existing delete. Emit `auditEvent('user_cascade_deactivated', $user, 'user', null, ['cabangId' => $id, 'count' => $touched])`.
  2. In `trainer.php:24` (the trainer `masterDelete` call site), inject the same pattern for `users.trainer_id`: `UPDATE users SET active = 0, trainer_id = NULL WHERE trainer_id = :id AND active = 1`. Audit `user_cascade_deactivated` with `['trainerId' => $id, 'count' => $touched]`.
  3. Idempotence: `WHERE active = 1` ensures re-runs are no-ops (taste #35).
  4. Add a one-time cleanup migration `UPDATE users SET active = 0, cabang_id = NULL, trainer_id = NULL WHERE active = 1 AND (cabang_id NOT IN (SELECT id FROM cabang) OR trainer_id NOT IN (SELECT id FROM trainer))` — neutralizes *existing* orphans that the team's manual testing surfaced. Audit `user_orphan_cleaned` per row.
  5. Tests: 2 acceptance tests in `tests/` covering (a) delete `cabang`, then assert no `active=1` user has the deleted FK; (b) delete `trainer`, then same assertion. Per taste #9 + #26 the VERIFY is `npx playwright test` exit 0 on the new spec.
- Owner: Data/release per `PRODUCTION_PLAN.md:170`.

**F-11 | Critical | Antrean Verifikasi record-disappears symptom, unverified root cause**
- Evidence: `src/features/attendance/RiwayatAbsensi.jsx:10` reads `readCached('absensi')` once. `src/lib/store.js:443-449` — outbox `pending` entries are visible immediately on `upsert()` because both `absensi` and the `admindashboard_syncLog` are local. `syncPending()` (`store.js:462-479`) only prunes on successful server ack; on server `failed` list, the entry stays in queue. A record can vanish from "Semua" if the trainer deleted-and-recreated, or if Sync was clicked and the server returned a 4xx for the absensi (a payload it couldn't accept). 
- Verdict: **drift** — the team's symptom is real but the root cause is multi-source. Without a live-browser trace I cannot confirm which path caused the disappearance.
- Recommended action: Add a `console.log`/audit hook in the outbox prune path and the `readCached('absensi')` call site; the next session reproduces with the trainer flow and reports which case applies. Belongs in **AUDIT_FOLLOWUP_MILESTONES.md** as a diagnostic microtask.

### 2.2 Logic / permission inconsistencies (some unverified)

**F-03 | Critical | Modal positioning (#001, #007)**
- Evidence (post `AccountMenu.jsx` read): `AccountMenu.jsx:21-35` already implements `mousedown`-outside-click close + Escape close. The dropdown lives at `z-50` (line 63) but is mounted inside the header's `z-40` stacking context (parent `<header className="... sticky top-0 z-40">` at `App.jsx:232`). So the dropdown's `z-50` is **local to the header's stacking context**, not global. When the modal opens at `z-50` inside `<main>`, the two `z-50` elements are in different stacking contexts and the modal *should* correctly cover the header (and any open dropdown). The **AccountMenu is therefore NOT the F-03 culprit**.
- This narrows the remaining candidates: (a) an ancestor with `transform`/`filter`/`backdrop-filter`/`opacity < 1`/`isolation: isolate`/`will-change` that establishes a containing block for the modal's `position: fixed`, (b) the page being scrolled when the modal opens so the `fixed inset-0` overlay appears offset relative to a scrolled ancestor, (c) the `max-h-[85vh] overflow-y-auto` panel (`AppModal.jsx:92`) clipping inside an ancestor that constrains height.
- Verdict: **drift, unverified** — AccountMenu is exonerated; the most likely remaining cause is (a) an ancestor with `transform`/`filter` that I have not traced end-to-end, or (c) the panel clipping.
- Recommended action: **Live-browser repro still needed.** Quickest diagnostic: open DevTools, open Sekolah form modal, inspect the modal's containing block in the Computed panel. If the containing block is `<html>` (the default), the cause is (b) page-scroll. If the containing block is some ancestor, the cause is (a). Once localized, the fix is either a `createPortal(target=document.body)` (one-file change in `AppModal.jsx`) or a styling fix in the offending ancestor. Belongs in **PLAYWRIGHT_MIGRATION_MILESTONES.md** PM.5 (styling) as `PM.5-MODAL-1`, gated on a live-browser repro before declaring done.

**F-08 | Critical | Trainer pages scroll-freeze (#026, #027, #028)**
- Evidence (post `TrainerDashboard.jsx` read): `TrainerDashboard.jsx:1-97` is a small component — no chart library, no heavy `useEffect`. Line 22 calls `financialData({...})` synchronously on every render (no memo). With a real post-`hydrateServerData` dataset this could iterate every `absensi` row, but it does not introduce a stacking context or overflow trap. The `useMemo` at line 31-39 only memoizes the assigned-schools computation, not the financial data.
- Sub-agent's earlier evidence stands: **0 `h-screen`, 0 `min-h-0`** in `src/`. Classic flex-trap does not apply. The trainer pages are mounted inside `App.jsx:262` `<main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6">` which is `flex-1` of a `min-h-screen` parent (`App.jsx:189`).
- Verdict: **drift, unverified** — root cause not localized. The trainer-only discriminator is real (superadmin does not freeze) but the TrainerDashboard code itself is not obviously heavier than the superadmin OverviewCards (`OverviewCards.jsx` is ~250 lines, *bigger* than TrainerDashboard's 97). Two remaining candidates: (a) trainer-specific `bootstrapAuth()` or `hydrateServerData()` re-runs during the trainer session, (b) a `transform`/`filter` ancestor introduced by a trainer-only tab.
- Recommended action: **Live-browser repro still needed.** Open trainer session in DevTools Performance tab, reproduce scroll-freeze, check the call stack at the moment scroll becomes non-responsive, and check the Computed panel for any unexpected containing block. Belongs in **PLAYWRIGHT_MIGRATION_MILESTONES.md** PM.5 as `PM.5-SCROLL-1` with an explicit "no fix without repro" gate.

### 2.3 Redundancies to remove / simplify

**F-07 | Annoying | Trainer "Honor" input allows leading-zero / empty-renders-0**
- Evidence: `src/features/trainers/TrainerList.jsx:427-430` uses a plain `<input type="number" min="0" ... onChange={... Number(e.target.value) ...}>`; no `RupiahInput` import. `Number("01000000")` → `1000000`; `Number("")` → `0`. Compare `src/components/RupiahInput.jsx:28-42` (strips non-digits, coerces empty to `min`, normalizes on blur).
- Verdict: **drift** — two different money-input contracts in the same app. Per taste #11, new UI should mirror an existing idiom (`RupiahInput`).
- Recommended action: Swap the plain `<input type="number">` for `<RupiahInput>` in `TrainerList.jsx:427-430`. This is a **single-line** styling/UX fix. Belongs in **PLAYWRIGHT_MIGRATION_MILESTONES.md** PM.5 as `PM.5-RP-1`.

### 2.4 UX / styling refinements

**F-06 | Annoying | "Salin" button gives no feedback (4 sites)**
- Evidence: `src/features/trainers/TrainerList.jsx:371-374` (username), `:385-388` (password); `src/features/admin/BranchManager.jsx:333` (username), `:347` (password). All four: `onClick={() => navigator.clipboard?.writeText(...)}` with no `setState`, no toast, no `aria-live`.
- Verdict: **drift** — same pattern, four sites, no feedback.
- Recommended action: Introduce a small "copied" indicator (e.g., a 1.5s state change of the button text to "Tersalin" with `aria-live="polite"`). Per taste #15, wire to a real validation guard. Per taste #11, mirror the existing `AlertDialog` success-tone. Belongs in **PLAYWRIGHT_MIGRATION_MILESTONES.md** PM.5 as `PM.5-COPY-1` (one microtask, 4 sites).

**F-09 | Annoying | "Antrean Verifikasi" / "Semua" toggle is undiscoverable**
- Evidence: `src/features/attendance/RiwayatAbsensi.jsx:12, 44, 58-65` — the `showAll` toggle *is* wired (line 12, button at 58-65, heading at 44). The team's confusion (#029, #030) is that the label "Semua" is too generic; the team expected to see "Antrean Verifikasi" rows separately.
- Verdict: **drift** — feature is implemented; UX labeling is the problem.
- Recommended action: Rename the toggle button to "Tampilkan semua absensi" when off and "Hanya antrian verifikasi" when on; persist the toggle state. Belongs in **PLAYWRIGHT_MIGRATION_MILESTONES.md** PM.5 as `PM.5-LABEL-1`.

**F-12 | Annoying | Vertical scrollbar visible (general styling)**
- Evidence: No specific file:line — global Tailwind `overflow-y-scroll` or default browser scrollbar. The team says it's "a bit annoying or ugly" (#020 second occurrence).
- Verdict: **drift** — styling only.
- Recommended action: Add `scrollbar-width: thin` / Tailwind's `scrollbar-thin` (via `@tailwindcss/forms` or custom plugin) on the body. Belongs in **PLAYWRIGHT_MIGRATION_MILESTONES.md** PM.5 as `PM.5-SB-1`. Per the team's suggestion, also check `frontend-style/` for the reference.

**F-13 | Annoying | Dropdown chevron close to edge**
- Evidence: Generic Tailwind chevron in `<select>` elements. No specific file:line — affects all `<select>` (e.g., `SchoolList.jsx:338`, `BranchManager.jsx:323`).
- Verdict: **drift** — styling only.
- Recommended action: Per the team's suggestion, either reuse `frontend-style/` or a custom select component. Belongs in **PLAYWRIGHT_MIGRATION_MILESTONES.md** PM.5 as `PM.5-SELECT-1`.

**F-14 | Annoying | Sidebar collapse: button out of container when narrowed**
- Evidence: `src/components/SidebarLayout.jsx:60` — `transition-all ${collapsed ? 'w-20' : 'w-64'}`. Lines 110-113 — buttons inside switch to `justify-center` when collapsed. The collapse toggle button is in the header (`SidebarLayout.jsx:88-97`) which is `px-4` and `justify-between`. When the sidebar shrinks to `w-20`, the toggle button may extend past the right edge if the logo's `w-10 h-10` is rendered.
- Verdict: **drift** — overflow:hidden on the aside would clip this, but the aside has no overflow-hidden. So the toggle button visually overflows the rail.
- Recommended action: Add `overflow-hidden` to the aside class on line 60. **One-line** fix. Belongs in **PLAYWRIGHT_MIGRATION_MILESTONES.md** PM.5 as `PM.5-SB-2`.

**F-15 | Annoying | Sidebar stretches with content**
- Evidence: `src/components/SidebarLayout.jsx:60` — aside is `flex flex-col` (line 60) and uses `flex-1` (line 102) on the nav so it grows. The aside itself has no fixed height. It stretches with the page because there's no `h-screen` parent.
- Verdict: **drift** — the team's expectation is "frozen, doesn't follow the page" — this is the inverse fix: the sidebar *should* be fixed-height (or sticky).
- Recommended action: Make the desktop sidebar `sticky top-0 h-screen` or `sticky top-0 self-start`. The mobile drawer is already an overlay, so this only affects desktop. Belongs in **PLAYWRIGHT_MIGRATION_MILESTONES.md** PM.5 as `PM.5-SB-3`.

**F-16 | Annoying | "Realisasi SPP per Sekolah" font too small**
- Evidence: `src/features/overview/OverviewCards.jsx` and likely `src/features/reports/FinanceReport.jsx`. Per taste #46, fact-check: need to read the exact text-rendering classes. The team's complaint matches the density issue (F-05 / #021).
- Verdict: **drift** — see F-05. Styling only.
- Recommended action: Adjust `text-xs` to `text-sm` in the relevant rows. Part of the F-05 redesign or a separate `PM.5-FONT-1`.

**F-17 | Annoying | Trial-Siswa row buttons drift to center when "Kirim Tagihan" is hidden**
- Evidence: `src/features/students/StudentList.jsx:265-285` area (per `readOnly` prop logic at 180, 235). The row's button group likely uses `justify-end` (need to confirm) and conditionally hides buttons — without a fixed-width placeholder, the visible buttons center.
- Verdict: **drift** — minor styling.
- Recommended action: Reserve space for the hidden button (e.g., `invisible` instead of removing from the DOM) or use a fixed-width flex container. Belongs in **PLAYWRIGHT_MIGRATION_MILESTONES.md** PM.5 as `PM.5-ROW-1`.

### 2.5 Things worth adding / planned-but-unbuilt (drift from plan)

**F-05 | Annoying | Overview "too much information, needs collapse group" — RESOLVED via D-05/D-22 (deferred per plan)**
- Evidence: `src/features/overview/OverviewCards.jsx` (full file, ~250+ lines) renders multiple cards including `ExecutiveSummary`. `SCOPE_EXPANSION_PLAN.md:218` lists `ExecutiveSummary.jsx — NEW: big Laba/Rugi + red flags card` as Phase B6.
- **Decision (D-05/D-22 = B): follow the planned Phase A→B→C sequence.** F-05 stays on the B6 roadmap; no microtask filed in this session beyond what the plan already specifies. Per taste #31, accepted as "just a matter of time".

**F-10 | Critical | URL-only Foto / Logo fields (team wants file picker) — RESOLVED via D-10**
- Evidence: `src/features/schools/SchoolList.jsx:352` (Foto URL), `src/components/SettingsModal.jsx:76` (Logo URL). Both are plain `<input>` for a URL. `PRODUCTION_PLAN.md:121-125` says *"Photos are never stored in localStorage for production"* and *"IndexedDB … hold the minimal Trainer attendance cache, outbox, and photos"*. `SCOPE_EXPANSION_PLAN.md:158` lifts the localStorage constraint to "Photos outside localStorage (IndexedDB or server)".
- **Decision (D-10 = B): extend SCOPE_EXPANSION (Phase A2 covers attendance photos; add sekolah/logo as A2.5). No new chain.**
- Recommended action: 1-2 microtasks filed in `SCOPE_EXPANSION_MILESTONES.md` as Phase A2.5. (1) `A2.5-SEKOLAH-FOTO` — add file-picker option to `SchoolList.jsx:352` Foto field, mirror the existing `PhotoSlot.jsx` attendance path. (2) `A2.5-LOGO` — same for `SettingsModal.jsx:76`. Both depend on the IndexedDB layer that Phase A2 introduces; if A2 has not landed, A2.5 inherits the dependency. Belongs in **SCOPE_EXPANSION_MILESTONES.md**, owner: scope/policy per `SCOPE_EXPANSION_PLAN.md:163`.

**F-18 | Cosmetic | "Jadwal" is a free-text input (team wants day-picker + "Add More") — RESOLVED via D-18**
- Evidence: `src/features/schools/SchoolList.jsx:354-357` — single `<input value={form.jadwal} ...>`. SCOPE_EXPANSION_PLAN.md does not pin the jadwal field's UI shape.
- **Decision (D-18 = B): list of `{dayOfWeek: 0-6, time: HH:mm}` entries with "Add jadwal" button.**
- Recommended action: 1 microtask filed in `SCOPE_EXPANSION_MILESTONES.md` (since D-10 already extends this chain) as `A2.5-JADWAL-1`. The form should be a list of `(dayOfWeek, time)` pairs stored as a JSON array in `payload.jadwal[]`. Server schema: add `jadwalList` to sekolah factory (`lib/constants.js`). Migration: convert existing `jadwal` strings to `{dayOfWeek: parseDayName(s), time: parseTimeRange(s)}` on first save (best-effort; failures fall back to a single free-text entry to preserve data, per taste #35 idempotence).

**F-19 | Critical | Pengaturan > Logo: file picker desired**
- Same evidence and verdict as F-10 (Logo URL is a subset of the same plan gap). Covered by F-10.

**F-20 | Cosmetic | Data Siswa > Tambah Siswa: remove Foto field (privacy) — RESOLVED**
- Evidence (post `StudentList.jsx` `SiswaForm` read): `StudentList.jsx:317-319` — `<label ...>Foto (URL)</label> <input value={form.foto} onChange={...} ... />`. **Confirmed present in the current source.** The form is gated by `!readOnly` (line 270-277), so trainers do not see the field; superadmin and admin_cabang do.
- Verdict: **drift** — confirmed per team observation. Per taste #50 (privacy-as-removal-criterion), PII fields for minors with no operational payoff should be deleted. The team's "delete the Foto for siswa" is exactly that argument.
- **Decision (D-20 = A): hard-remove the field + migrate existing rows to `foto: null`.**
- Recommended action: 2 microtasks. (1) `M-AF-SISWAFOTO-1` (UI): remove the Foto label + input from `SiswaForm` (lines 317-320), and remove the `s.foto` lookup in the list-render fallback at `StudentList.jsx:194-200` (the `s.foto` branch goes away; only the placeholder avatar remains). (2) `M-AF-SISWAFOTO-2` (data migration): a one-time SQL update `UPDATE siswa SET payload = JSON_SET(payload, '$.foto', NULL) WHERE JSON_EXTRACT(payload, '$.foto') IS NOT NULL` (run as the migration step; per taste #35, idempotent because the WHERE-clause is a no-op on already-null rows). Audit row per `auditEvent('siswa_foto_purged', ...)`. Belongs in **AUDIT_FOLLOWUP_MILESTONES.md**.

**F-21 | Cosmetic | Data Siswa: row numbering on left (Excel-style)**
- Verdict: **pure feature request, no plan coverage**. One-line addition to the table's first column.
- Recommended action: Belongs in **PLAYWRIGHT_MIGRATION_MILESTONES.md** PM.5 as `PM.5-NUM-1` (single microtask, applies to all tables if team wants consistency).

**F-22 | Annoying | Invoicing only has Month + Semester, no custom range — RESOLVED via D-05/D-22 (deferred per plan)**
- Evidence (post `InvoiceModal.jsx` read): `InvoiceModal.jsx:12` — `const [mode, setMode] = useState('bulanan')`. The `mode` is rendered as two buttons: `'bulanan'` and `'semester'` (line 95-99). The semester branch (line 110-118) is itself a binary toggle: Ganjil (Jul-Dec) or Genap (Jan-Jun). No third "Custom" mode. No date range pickers. **Confirmed exactly as the team described.** `SCOPE_EXPANSION_PLAN.md:165` (B4) says *"Flexible reporting: MTD/YTD, semester presets, custom range"* — this is on the plan, Phase B.
- **Decision (D-05/D-22 = B): follow the planned Phase A→B→C sequence.** F-22 stays on the B4 roadmap; no microtask filed in this session beyond what the plan already specifies. Per taste #31, accepted as "just a matter of time".

**F-23 | RESOLVED — closed as "by design, not a bug"**
- Evidence (post `auth/change-password.php` read): `change-password.php:16` requires `password_verify($currentPassword, $hash)`.
- **Decision (D-23 = B): keep re-auth always; do not weaken.** The current-password requirement is intentional. The team's "redundant" complaint does not warrant a change because (a) the server enforces re-auth uniformly, (b) weakening it only for the `mustChangePassword=true` case would create a session-hijack window, (c) the UX cost is small (one extra field, only on the forced-change page).
- **No microtask filed.** F-23 is closed.

### 2.6 Test-data hygiene / SQL-logic findings (the team's "traverse by hand" ask)

**F-24 | Critical | Traverse-by-hand verification needed for all CRUD**
- The team's #014-#018 explicit ask: "Check the SQL logic for all CRUD, not by test, but by traversing them one by one. the automated audit can't be trusted no more it seems."
- Evidence so far: F-04 already found a real server-side bug from this. The `_master.php:170-178` cascade scan is **not** the only place to look.
- Verdict: **audit response, not a single finding** — this is a methodology request.
- Recommended action: Write a `docs/audit-sql-crud_2026-09-04.md` walkthrough that, for each of `create/update/delete` on `cabang, sekolah, trainer, siswa, absensi, sppPayments, honorPayments, invoices, users, settings, audit_log`, manually traces the SQL chain (frontend → `store.js` → `server/api/*.php` → MySQL). Per taste #30, cross-reference each path against `PRODUCTION_PLAN.md` §6 and `SCOPE_EXPANSION_PRIVILEGES.md`. This is a **new microtask** that should be filed under **AUDIT_FOLLOWUP_MILESTONES.md** as `M-AF-SQL-1` (write the walkthrough) and `M-AF-SQL-2` (remediate each gap found in F-04 + any others).

### 2.7 Fact-errors in the team's findings (per taste #46)

**F-25 | fact-error | "Penting: traverse BY HAND, automated tests can't be trusted"**
- The team's diagnosis is partially right (F-04 is real) but the framing "automated audit can't be trusted" is overbroad. The Playwright suite tests the *frontend contract*; F-04 is in the *server-side cascade scan*, which the Playwright suite is not designed to test (per `tests/` scope: E2E through the React UI, not direct SQL). The two test surfaces are different, not one failing.
- Verdict: **fact-error** — the team conflated "the test suite passes" with "the cascade is correct". The right framing is: the test suite covers the user-observable contract; reference-integrity checks are a separate concern.
- Recommended action: Cite this in the next session's report preamble so the team doesn't over-correct.

---

## 3. Findings the team raised that are NOT real defects

These are evidence-anchored denials of the team's findings where the source code already implements what they asked for, or where the symptom is unrelated to the suggested cause.

| Team # | Claim | Reality | Evidence |
|---|---|---|---|
| #010/#011 (Siswa row numbering) | "No row numbering, request from client" | Cosmetic, no current plan, see F-21. | `StudentList.jsx:144-200` table renders thead without an index column — confirmed absence. |
| #018 (cabang reappears after refresh) | "Deleted cabang reappears after refresh" | F-02 covers the *stale-cache* symptom. After a *real refresh* (full page reload), the localStorage is re-hydrated from `hydrateServerData()` (`store.js`), so a server-deleted cabang will not reappear. **The "reappears" requires the user to NOT have refreshed.** | `src/lib/store.js:hydrateServerData()` (per `App.jsx:103-106` call site). |
| #025 (Salin no feedback) | "No indicator that it copied" | Confirmed real, see F-06. | 4 sites cited. |
| #020 (pw change requires current) | "Redundant" | See F-23. Server contract unverified. | `MustChangePasswordPage.jsx:14` and `auth.js:155` send `currentPassword`. |

---

## 4. Alignment table vs. docs (taste #68)

For each finding, the table answers: *is this already on a plan, partially on a plan, or genuinely new?*

| F-### | Already on plan? | Document / section | New microtask needed? | Suggested chain |
|---|---|---|---|---|
| F-01 Sekolah delete-no-confirm | No | — | Yes | AUDIT_FOLLOWUP `M-AF-DEL-1` |
| F-02 Sekolah stale cabang dropdown | No (general cache-staleness pattern noted) | `AUDIT_FOLLOWUP` covers related | Yes | AUDIT_FOLLOWUP `M-AF-CACHE-1` |
| F-03 Modal positioning (unverified) | No | — | Yes, gated on repro | PLAYWRIGHT_MIGRATION PM.5 `PM.5-MODAL-1` |
| F-04 Server `cabang` cascade omits `users` | **Drift from plan** | `PRODUCTION_PLAN.md:66-67` requires server-side invalidation; `PRODUCTION_PLAN.md:170` lists D7.1+ as Data/release owner | Yes (D-04 = A) - `UPDATE users SET active=0, FK=NULL` | **PRODUCTION_MILESTONES.md** `D-X.X` |
| F-05 Overview density | **Yes (planned)** | `SCOPE_EXPANSION_PLAN.md:218` (B6 `ExecutiveSummary.jsx`) | No (D-05/22 = B) - follow plan, deferred per taste #31 | (no microtask) |
| F-06 Salin no feedback | No | — | Yes | PLAYWRIGHT_MIGRATION PM.5 `PM.5-COPY-1` |
| F-07 Trainer Honor leading-zero | No (RupiahInput contract is the existing idiom) | — | Yes, **single-line** | PLAYWRIGHT_MIGRATION PM.5 `PM.5-RP-1` |
| F-08 Trainer scroll-freeze (unverified) | No | — | Yes, gated on repro | PLAYWRIGHT_MIGRATION PM.5 `PM.5-SCROLL-1` |
| F-09 Antrean Verifikasi label | No | — | Yes | PLAYWRIGHT_MIGRATION PM.5 `PM.5-LABEL-1` |
| F-10 Foto / Logo URL-only | **Drift from plan** | `PRODUCTION_PLAN.md:121-125` + `SCOPE_EXPANSION_PLAN.md:158` (IndexedDB photos) | Yes (D-10 = B) - extend SCOPE_EXPANSION A2.5 | SCOPE_EXPANSION `A2.5-SEKOLAH-FOTO` + `A2.5-LOGO` |
| F-11 Antrean Verifikasi record-disappears | Partial | `PRODUCTION_PLAN.md:121-125` outbox states `discarded` not yet implemented | Yes (diagnostic) | AUDIT_FOLLOWUP `M-AF-SYNC-1` |
| F-12 Scrollbar visible | No | — | Yes | PLAYWRIGHT_MIGRATION PM.5 `PM.5-SB-1` |
| F-13 Dropdown chevron | No | — | Yes | PLAYWRIGHT_MIGRATION PM.5 `PM.5-SELECT-1` |
| F-14 Sidebar collapse overflow | No | — | Yes, **single-line** | PLAYWRIGHT_MIGRATION PM.5 `PM.5-SB-2` |
| F-15 Sidebar stretch | No | — | Yes | PLAYWRIGHT_MIGRATION PM.5 `PM.5-SB-3` |
| F-16 SPP per Sekolah font | No (subsumed by F-05) | — | Yes | PLAYWRIGHT_MIGRATION PM.5 `PM.5-FONT-1` |
| F-17 Trial-Siswa row button drift | No | — | Yes | PLAYWRIGHT_MIGRATION PM.5 `PM.5-ROW-1` |
| F-18 Jadwal free-text → day-picker | **Drift from plan** (plan doesn't pin UI shape) | — | Yes (D-18 = B) - list of `{dayOfWeek, time}` | SCOPE_EXPANSION `A2.5-JADWAL-1` |
| F-19 Logo file picker | Same as F-10 | — | (covered by F-10, D-10 = B) | (covered by F-10) |
| F-20 Siswa.foto removal (privacy) | No | — | Yes (D-20 = A) - hard-remove + migrate | AUDIT_FOLLOWUP `M-AF-SISWAFOTO-1` + `M-AF-SISWAFOTO-2` |
| F-21 Row numbering | No | — | Yes | PLAYWRIGHT_MIGRATION PM.5 `PM.5-NUM-1` |
| F-22 Invoice custom range | **Yes (planned)** | `SCOPE_EXPANSION_PLAN.md:165` (B4) | No (D-05/22 = B) - follow plan, deferred per taste #31 | (no microtask) |
| F-23 Change-password drops current | **Partial** (`PRODUCTION_PLAN.md:62` doesn't require it) | server file read | **Closed (D-23 = B)** - keep re-auth, not a bug | (no microtask - closed) |
| F-24 Traverse-by-hand SQL audit | No (the test-vs-app gap is in the team's question) | — | Yes (write a walkthrough doc) | AUDIT_FOLLOWUP `M-AF-SQL-1` (write) + `M-AF-SQL-2` (remediate) |
| F-25 "automated audit can't be trusted" | n/a (fact-error) | — | No (the framing is too broad) | (cite in report preamble) |

---

## 5. Recommended next-session action plan (taste #64)

Per the established convention in `taste.md #69`, the next session should:

1. **All file-reads complete.** F-20, F-22, F-23, F-03 (partial), F-04 (compound), F-08 (partial) are now evidence-grounded.

2. **User decisions D-23, D-20, D-10, D-18, D-05/D-22 RESOLVED this turn (B / A / B / B / B).** F-23 closed (no microtask). F-20, F-10, F-18 file as `AUDIT_FOLLOWUP_MILESTONES.md` / `SCOPE_EXPANSION_MILESTONES.md` microtasks per the resolved-action table in §1a. F-05, F-22 stay on the plan roadmap (B4/B6).

3. **All 6 user decisions RESOLVED this turn (D-04 = A; D-23 = B; D-20 = A; D-10 = B; D-18 = B; D-05/D-22 = B).** F-23 closed (no microtask). F-20, F-10, F-18, F-19 file as `AUDIT_FOLLOWUP_MILESTONES.md` / `SCOPE_EXPANSION_MILESTONES.md` microtasks per the resolved-action table in §1a. F-05, F-22 stay on the plan roadmap (B4/B6). F-04 files as a `PRODUCTION_MILESTONES.md` D-milestone. **No open decisions remain.**

4. **File the no-decision microtasks in the right chains** (renumber per taste #74): **DONE this turn.** 24 new microtasks filed across 4 chains:

   - **AUDIT_FOLLOWUP_MILESTONES.md** — new gate `AF-A5` with 7 microtasks:
     - `M-AF5.1` — Sekolah delete always confirms (F-01)
     - `M-AF5.2` — SchoolList subscribes to `subscribeStore` + `storage` listener (F-02)
     - `M-AF5.3` — remove siswa.foto from form (F-20)
     - `M-AF5.4` — one-time migration: siswa.foto → null (F-20)
     - `M-AF5.5` — diagnose absensi outbox prune path (F-11)
     - `M-AF5.6` — write `docs/audit-sql-crud_2026-09-04.md` walkthrough (F-24)
     - `M-AF5.7` — remediate cascade gaps surfaced by M-AF5.6 (F-24)
   - **PLAYWRIGHT_MIGRATION_MILESTONES.md** — extends PM.5 chain with 12 microtasks (no clash with existing PM.5.1..PM.5.10):
     - `PM.5.11` — Modal createPortal + tune padding (F-03)
     - `PM.5.12` — Trainer use `RupiahInput` for Honor field (F-07)
     - `PM.5.13` — Salin button copy feedback across 4 sites (F-06)
     - `PM.5.14` — Antrean Verifikasi rename toggle label (F-09)
     - `PM.5.15` — Sidebar collapse add `overflow-hidden` (F-14)
     - `PM.5.16` — Sidebar sticky `top-0 self-start` (F-15)
     - `PM.5.17` — Trainer scroll-freeze instrument + memoize (F-08)
     - `PM.5.18` — Scrollbar `scrollbar-thin` on body (F-12)
     - `PM.5.19` — Select chevron right margin (F-13)
     - `PM.5.20` — SPP per Sekolah font text-xs → text-sm (F-16)
     - `PM.5.21` — Trial-Siswa row button reserve space (F-17)
     - `PM.5.22` — Tables row numbering first column (F-21)
   - **SCOPE_EXPANSION_MILESTONES.md** — new section `A2.5` (per D-10 = B) with 3 microtasks:
     - `A2.5-SEKOLAH-FOTO` — file-picker for Sekolah.foto (F-10)
     - `A2.5-LOGO` — file-picker for Settings.logo (F-19)
     - `A2.5-JADWAL-1` — day-picker + Add More for Sekolah.jadwal (F-18)
   - **PRODUCTION_MILESTONES.md** — new gate `D9` (per D-04 = A) with 2 microtasks:
     - `D9.1` — server cascade: deactivate users on cabang/trainer delete (F-04)
     - `D9.2` — one-time migration: clean up existing orphan users (F-04)
   - **No new chain created** (D-10 chose to extend SCOPE_EXPANSION rather than write a new UPLOAD chain).

5. **Verification gate** (taste #3 / #9): run `npx playwright test` on the relevant spec set + `npm run build:deploy` (per taste #71) before declaring any microtask done. Per taste #26, every claim must end with `Verified: <cmd> -> <result>` or `Unverified: run <cmd>`.

---

## 6. Items I did NOT verify (Unverified:)

- **F-08 trainer scroll-freeze root cause** — `TrainerDashboard.jsx` read; no obvious heavy work; no `transform`/`filter` ancestor found in the read. Need live-browser repro with DevTools Performance + Computed panel.
- **F-03 modal positioning cause** — `AccountMenu.jsx` exonerated (proper `mousedown` close, header-isolated stacking context). Remaining candidates are an ancestor `transform`/`filter` or a scroll-state. Need live-browser repro to localize.
- **F-11 absensi record disappears** — multiple candidate paths (outbox prune, sync 4xx, trainer delete-and-recreate). Need a runtime trace.
- **All four `Salin` button call-sites' visual state** — code confirmed; visual feedback is unverified without a live browser.

---

## 7. Self-audit of this report (per taste #28 — UX-style critique of my own deliverable)

- The report is **decision-actionable**: every F-### has a recommended chain + microtask slug.
- The report is **falsifiable**: each finding has file:line evidence, and §6 lists the things I could not verify.
- The report does **NOT** propose implementation code. Per taste #64, the next session decides the implementation shape after the user responds to the flagged ambiguities (D-04, D-10, D-18, D-20, D-23, D-05/D-22). **All six user decisions are now resolved as of this turn**, so the next session's intake is *only* the live-browser repros for F-03 / F-08 / F-11, plus filing the 18 microtasks in their respective chains.
- The report preserves the prior chain boundaries (HYGIENE / PLAYWRIGHT / PRODUCTION / AUDIT_FOLLOWUP / SCOPE_EXPANSION) per taste #8 — does not propose merging or splitting them based on this audit.
- The report cites `taste.md` and `taste-testing.md` principles inline so the next session can audit my reasoning, per taste #1 ("plan-driven, references numbered items").

**Remaining uncertainty:** the next session needs a live-browser environment to close F-03, F-08, F-11. Without it, those stay as `Unverified` per taste #56.

---

*End of audit report. All 6 user decisions resolved (D-04=A, D-23=B, D-20=A, D-10=B, D-18=B, D-05/D-22=B). 24 microtasks filed across 4 chains in this turn. Next session: pick up the chains, do the live-browser repros for F-03/F-08 (user evidence partially collected) and the runtime trace for F-11, then implement microtask-by-microtask.*
