# Logo Portability Plan — making the uploaded logo universal (cPanel-only)

**Status:** IMPLEMENTED 2026-09-12 — Gate LP-C closed by LP.C.2 (this change is docs-only: the three write-back files listed in §11).
**Position:** Temporary release-readiness chain per taste #40. It does **not** replace `PRODUCTION_PLAN.md` / `PRODUCTION_MILESTONES.md`, `SCOPE_EXPANSION_PLAN.md`, or `RELEASE_HYGIENE_PLAN.md`. When Gate LP-C closes, §11 records completion back on the source docs and this pair is folded or retired.
**Contract order:** `docs/UNIVERSAL.md` (primary contract, read first) → `docs/IMPLEMENTATION_PLAN.md` Part 2 → `docs/SCOPE_EXPANSION_PLAN.md` + `docs/SCOPE_EXPANSION_PRIVILEGES.md` (scope-expansion first-reads) → this file.

---

## 1. Context and inputs

- The cPanel photo tier already exists and is green: `server/lib/photoStore.php` (`private/uploads/` outside the docroot), `server/api/photo-upload.php` (POST, auth + CSRF, finfo + getimagesize, 2 MB cap), `server/api/photo-download.php` (GET, scope per D-RH9), client `src/lib/photoStorage.js` (`{type:'server',id}` + idb cache).
- The logo path never reaches that tier. `SettingsModal` saves `logoEntry` via `setSettings()` (`src/lib/store.js:592-610`, explicitly "No server endpoint exists for this yet — stays localStorage-only"), and `PhotoSlot` (`src/components/PhotoSlot.jsx:38-51`) uploads to the server only for non-superadmin roles — while only superadmin may edit settings (`SettingsModal.jsx:36`, `manage_settings` deny-list in `server/auth/authorize.php:87`). The combination guarantees a superadmin-saved logo stays `{type:'idb'}` on one browser.
- Even if the bytes reached the server, non-superadmin devices could not resolve them through the current paths: `settings` is excluded from `roleCanReadEntity()` (`server/auth/authorize.php:12-15`) and from `READABLE_SERVER_KEYS` (`src/lib/store.js:18-21`), so a second device outside superadmin has no sanctioned logo read.
- The teammate's mental model ("save the upload on the cPanel host's own disk, into the app") is half-right and is corrected and pinned here exactly as `RELEASE_HYGIENE_PLAN.md` §9 / D-RH5 corrected it: yes to the host filesystem, no to inside the codebase/`deploy/` document root (§4, D-LP1).
- Teammate pending list (2026-09-12): (1) `DEPLOY_GUIDE_CPANEL.md` `config.php` wording still ambiguous after the deletion incident; (2) one-time bootstrap Cron must be confirmed removed (cPanel-side); (3) logo not portable across devices; (4) `photoStorage.js` / Settings / `logoEntry` workflow needs review; (5) `deploy-upload.zip` / `login.json` hygiene.

## 2. Goals and non-goals

**Goals**

1. A logo uploaded once by superadmin renders on every authenticated device (desktop + mobile) with no per-device import.
2. The fix uses cPanel only (filesystem + MySQL + PHP endpoints already on the host) — no third-party storage, no new dependency.
3. Privilege boundaries stay explicit: `manage_settings` remains superadmin-only; no role is broadened as a shortcut (taste #33).
4. `DEPLOY_GUIDE_CPANEL.md` can no longer be misread as permission to delete the tracked source config.
5. `deploy-upload.zip` / `login.json` can never enter the repo silently again.

**Non-goals (stay out of this chain)**

- Photo outbox (retrying offline uploads) — stays deferred per `RELEASE_HYGIENE_PLAN.md` §13; the offline boundary is restated, not built.
- Branch-scoped photo rules (D-RH9) — untouched; the logo tier is additive.
- Full-suite green, trial billing, email reset, soft-delete — long-standing non-goals, owned elsewhere.
- cPanel execution itself (upload, Cron removal, rotation) — operator-owned; this chain produces the checklist, not the clicks.

## 3. Findings registry (F-LP)

| ID | Finding | Evidence |
|---|---|---|
| F-LP1 | **Logo is local-only by construction.** `setSettings()` writes `logoEntry` to `afterschola_v4_settings` only; no settings write endpoint is called. | `src/lib/store.js:597-610`; `src/components/SettingsModal.jsx:38-43`; `tests/settings-logo-picker.spec.js:100` pins `{type:'idb'}` |
| F-LP2 | **Superadmin can never reach the server photo tier through `PhotoSlot`.** Server upload is skipped for `role === 'superadmin'` (no branch context, and `photo-upload.php` 422s superadmin without an explicit `cabangId`), falling back to idb silently — and superadmin is the only role allowed to save a logo. | `src/components/PhotoSlot.jsx:36-51`; `server/api/photo-upload.php:50-60`; `src/components/SettingsModal.jsx:36` |
| F-LP3 | **No cross-role logo read exists.** `settings` is excluded from `roleCanReadEntity()` and from `READABLE_SERVER_KEYS`; `hydrateServerData()` never pulls it, so a second device (especially non-superadmin) has no sanctioned path to the logo reference. | `server/auth/authorize.php:10-16`; `src/lib/store.js:13-21,215-216`; `src/App.jsx:194-195` (props come from local `getSettings()`) |
| F-LP4 | **`config.php` wording is ambiguous and deletion-unsafe.** One bare name covers two different files: tracked source `server/config.php` (env-driven, never delete — CONFIG.md D1) vs forbidden stray `<docroot>/config.php` (delete if present — DEPLOY_GUIDE §3.2 row 4b, DEPLOY_BUNDLE.md D7). | `docs/CONFIG.md:13-21`; `docs/DEPLOY_GUIDE_CPANEL.md:137`; `docs/DEPLOY_BUNDLE.md:17-19`; `git ls-files` shows `server/config.php` tracked, `deploy/config.php` absent |
| F-LP5 | **Zip/login hygiene is unguarded.** `deploy-upload.zip` and `login.json` are absent today but no ignore rule names them, so a future drop is committable by accident. | `git ls-files \| select-string zip/login` → no hits; `Test-Path` all False; root `.gitignore` has no such lines |
| F-LP6 | **Bootstrap Cron removal is cPanel-side and unverifiable from the repo.** The one-time Cron path is sanctioned (create superadmin, then delete) but its removal cannot be proven by any repo command. | `docs/DEPLOY_GUIDE_CPANEL.md:98` (Cron-once-then-delete); manual owner check required |

## 4. Decision set (D-LP)

| # | Decision | Status |
|---|---|---|
| D-LP1 | **Storage model reaffirmed (no architecture change).** Uploaded bytes live in `private/uploads/` created at runtime — locally repo-root `private/` (gitignored), on cPanel `/home/<user>/private/uploads/` outside `public_html`. Never inside `deploy/` or any tracked source dir. Retrieval only through an authorized endpoint. Mirrors D-RH5 / R-RH3. | Locked |
| D-LP2 | **Logo is global: concrete pick.** Reuse the `photo_uploads` + `photoStore.php` idiom (taste #11, #17) with `cabang_id = NULL` for the single global logo, plus a narrow trio: `POST /api/logo-upload.php` (superadmin-only + CSRF, same finfo/getimagesize/2 MB pipeline as `photo-upload.php` but takes **no** `cabangId` — this is what unblocks superadmin), `GET /api/logo-current.php` (any authenticated role, no CSRF — returns `{id, updatedAt}` only), `GET /api/logo-download.php?id=` (any authenticated role, no CSRF — streams bytes; the logo is branding, not minor PII). The `settings` payload carries only the `{type:'server',id}` reference, never bytes. Rejected alternative: dataURL inside `settings.payload` (bloats every read/backup, skips content sniffing). | Locked |
| D-LP3 | **Privilege boundary stays explicit (taste #33).** `manage_settings` and `roleCanReadEntity()` for `settings` do not change — non-superadmin never reads/writes the full settings payload (bank rekening stays closed). Logo bytes are the only newly cross-role-readable surface, via the narrow download/current endpoints above. | Locked |
| D-LP4 | **Client is additive.** New `uploadLogoToServer()` helper beside `uploadPhotoToServer()`; `PhotoSlot` gains an explicit `uploadMode: 'branch-photo' \| 'global-logo'` (default preserves today's behavior). `SidebarLogo` prefers cached entry, falls back to `logo-current.php` → `logo-download.php` when local state is empty (covers fresh mobile login). `tests/settings-logo-picker.spec.js` (A2.5-LOGO) is updated to expect `{type:'server'}` + cross-device read-back. Existing branch-photo flow is untouched. | Locked |
| D-LP5 | **Config docs use fully-qualified paths only.** Every bare `config.php` in `DEPLOY_GUIDE_CPANEL.md` becomes either `` `server/config.php` `` (tracked source — "never delete, never edit on the server") or "stray `<docroot>/config.php`" (forbidden — "delete if present"), plus a warning callout at §3.2 row 4b. | Locked |
| D-LP6 | **Ignore hardening.** Root `.gitignore` gains explicit `deploy-upload.zip` and `login.json` lines (defense-in-depth alongside the existing `/deploy/config.php*.zip` line). | Locked |

## 5. Rules (R-LP)

- **R-LP1** Photos/logo bytes are stored outside the document root and served only through an authorized endpoint; filenames are server-generated (inherits R-RH3).
- **R-LP2** Logo validation validates actual content (finfo MIME + `getimagesize`), never the client-declared type; size cap enforced server-side (inherits R-RH4).
- **R-LP3** One concern per edit (taste #1-implementation-rule R1): logo endpoints, client helper, spec update, and doc wording are separate microtasks; never restyle while fixing logic.
- **R-LP4** Preserve public interfaces and existing style (UNIVERSAL scope gate; taste #11): branch-photo upload/download contracts do not change; new UI reuses the existing `PhotoSlot`/`SidebarLogo` idiom and Indonesian copy (`Pilih foto` / `Ganti foto` / `Hapus foto` / `Simpan`).
- **R-LP5** No photo-outbox expansion in this chain; offline captures stay device-local (idb) until saved again online — the boundary is documented in `OPERATIONS.md`, not built here.
- **R-LP6** Verification language is `Verified: <command> -> <result>` / `Unverified: run <command>` (UNIVERSAL); every microtask carries one OUTCOME + one falsifiable VERIFY (taste #2).

## 6. Alignment table — verify-the-verification gate (taste #68)

| Finding | Confirmed by docs (file/section) | Not documented / implied | Disposition in this chain |
|---|---|---|---|
| Logo local-only (F-LP1) | `store.js:594-595` comment ("No server endpoint exists for this yet"); `RELEASE_HYGIENE_PLAN.md` §9 client boundary (offline stays idb) | A2.5-LOGO spec pins idb-only as the contract — implies local-only is "by design" | Confirmed gap: LP.B adds the server tier + updates the spec |
| Superadmin bypass (F-LP2) | `PhotoSlot.jsx:36-51` comment states it; `photo-upload.php:50-60` requires superadmin `cabangId` | No doc states the composition ("superadmin × settings ⇒ never server") | New finding: LP.B.1/B.2 resolves it with the cabang-less logo endpoint |
| No cross-role read (F-LP3) | `authorize.php:12-15` exclusion; `SCOPE_EXPANSION_PRIVILEGES.md` "Global settings → superadmin ✅, others ❌" | Implies logo (rendered for all roles in the sidebar) needs an exception — never written down | Partially planned: D-LP3 records the narrow exception explicitly |
| `config.php` ambiguity (F-LP4) | CONFIG.md D1 vs DEPLOY_GUIDE row 4b vs DEPLOY_BUNDLE D7 all use the bare name for different files | The deletion incident itself is not recorded in any doc | Stale-claim correction (taste #42): LP.A.1 disambiguates + records the incident note |
| Zip/login (F-LP5) | `.gitignore` covers `/deploy/config.php*.zip` but not these names; no doc claims coverage | — | New hardening: LP.C.1 |
| Cron removal (F-LP6) | DEPLOY_GUIDE step 7 sanctions cron-once-then-delete | Removal state is inherently off-repo | Deferred with owner (teammate, §9) as a manual runbook row, not code |

## 7. Config-docs fix (F-LP4, D-LP5)

`EDIT` is `docs/DEPLOY_GUIDE_CPANEL.md` only. Replace each bare `` `config.php` `` with the qualified form, keep the `.env`-only sanction (RH.A.2) unchanged, and add a one-paragraph warning callout at §3.2 row 4b: tracked `server/config.php` must never be deleted (fresh-clone login depends on it — CONFIG.md §4); only a hand-dropped `<docroot>/config.php` next to `.env` on the server is deleted. No behavior change; the guide remains the step-by-step companion to `OPERATIONS.md`.

## 8. Logo server tier design (F-LP1–F-LP3, D-LP2–D-LP4)

- **Server (LP.B.1–B.2).** `server/api/logo-upload.php`: `POST`, `requireAuthenticatedUser()` + `requireCsrf()`, `role === 'superadmin'` else 403, no `cabangId` accepted at all (422 if sent — mirrors the `photo-upload.php:62` strictness in reverse), identical content pipeline (finfo sniff → JPEG/PNG/WebP only, `getimagesize` sanity, 2 MB cap on actual bytes), `savePhotoBytes()` + `INSERT INTO photo_uploads (…, cabang_id = NULL, …)` + `auditEvent('logo_uploaded')` → `201 {id}`. `server/api/logo-current.php`: `GET`, auth only, returns the current logo id (source: latest `logo_uploaded` audit row or a single-row `settings`-adjacent pointer — implementer picks one, records it; no new table). `server/api/logo-download.php`: `GET ?id=`, auth only (any role), same traversal/mime guards as `photo-download.php:72-89`, streams bytes. All three mirrored into `deploy/` by the existing `build:deploy` lib/api mirror — no build-script change expected (parity gate proves it).
- **Client (LP.B.3).** `uploadLogoToServer()` in `photoStorage.js` (same FormData-through-`apiRequest` shape as `uploadPhotoToServer`, no `cabangId`); `PhotoSlot uploadMode='global-logo'` calls it when the session is superadmin, falling back to idb on offline/denied (same silent-fallback idiom); `SettingsModal` passes `uploadMode='global-logo'` for the logo slot only; `SidebarLogo`/`App.jsx` hydrate missing logo via `logo-current.php` → `logo-download.php` and warm the idb cache. Branch-photo slots keep `uploadMode='branch-photo'` (today's path, untouched).
- **Spec (LP.B.4).** A2.5-LOGO keeps its upload-in-header + refresh legs and gains a cross-device leg: second context (or `read.php`-independent `logo-current` + `logo-download` fetch) resolves the same bytes; assertion on `{type:'server'}` replaces the `{type:'idb'}` pin. Old idb-only legs stay green as the offline-fallback proof.

## 9. Hygiene + manual carry-overs (F-LP5–F-LP6, D-LP6)

- `.gitignore` gains the two lines; `git check-ignore` proves them; `git ls-files` proves neither name is tracked and neither file exists on disk (already true — this microtask locks it in).
- Cron removal and `deploy-upload.zip`/`login.json` server cleanup are inherently manual (taste #19): the MILESTONES chain records them as explicit manual runbook rows with owner = teammate holding cPanel access, verified by a cPanel screenshot / File Manager listing, not by a repo command. Photo outbox stays deferred with owner = future scope-expansion (YAGNI).

## 10. Evidence freeze (taste #41)

| Item | Record (2026-09-12) |
|---|---|
| Commit / tree | HEAD `9d1a3f9`, `git status --short` clean |
| Package scripts | `dev, build, preview, build:deploy, db:reset, setup, test, test:destructive, rc:verify, hygiene:verify` |
| Config state | `server/config.php` tracked env-driven; `deploy/config.php` absent on disk and untracked; `.env` absent; `.env.example` present; `git ls-files \| select-string deploy-upload\|login.json` → no hits; both names absent on disk |
| Photo tier | `server/api/photo-upload.php`, `photo-download.php`, `server/lib/photoStore.php`, `photoStorage.js` server tier all present; `settings` write path still local-only (`store.js:592-610`) |
| Baseline | Prior chain `RELEASE_HYGIENE_PLAN.md` IMPLEMENTED 2026-09-11 (`rc:verify` ALL 7 STEPS OK at that HEAD); this chain re-verifies only its own slices |
| User-owned prerequisites | (1) cPanel Cron removal confirmation; (2) staging smoke on the domain after LP.B lands |

## 11. Completion recording (taste #43)

When Gate LP-C closes: update `docs/DEPLOY_GUIDE_CPANEL.md` (disambiguation DONE note), `tests/settings-logo-picker.spec.js` header (server-tier contract note), `docs/SCOPE_EXPANSION_MILESTONES.md` A2.5-LOGO row (server expectation), and `docs/PRODUCTION_MILESTONES.md` M5.2 block (logo portability DONE with `Verified:` lines). Then the project re-enters the normal staging flow (PRODUCTION Gate D7.1) with no new long-term roadmap edits.

**Closure record (LP.C.2, 2026-09-12 — docs-only, no app behavior changed in this microtask).** Gate exit criteria checkout:

1. `DEPLOY_GUIDE_CPANEL.md` has zero bare config.php occurrences (every occurrence qualified per D-LP5) and the row-4b warning callout is present — Verified: node probe in LP.C.2 session.
2. Superadmin logo upload on device A renders on device B with zero per-device import; stored `logoEntry` is `{type:'server', id}` — trio (`logo-upload.php` / `logo-current.php` / `logo-download.php`) + client (`uploadLogoToServer`, `uploadMode='global-logo'`, `App.jsx` convergence, `SidebarLogo` fallback) present by inspection; upload matrix Verified: `php server/tests/logo.endpoint.php` -> 48 checks / 0 failed (LP.C.2 session); cross-device leg per the LP.B.4 record (`npx playwright test tests/settings-logo-picker.spec.js --project=default --workers=1` -> 1 passed, 2026-09-12; re-run Unverified in this doc-only session).
3. Branch-photo contracts unchanged — Verified: LP diff touches no `photo-upload.php` / `photo-download.php` / `photoStore.php` file; `PhotoSlot` default stays `branch-photo`. Full photo-spec green re-run Unverified here; owned by the staging `rc:verify` battery (D7.1).
4. `deploy-upload.zip` / `login.json` hygiene — Verified: `git check-ignore -v` covers both names (root `.gitignore` LP.C.1), precise `git ls-files` probe shows neither tracked, all of `deploy-upload.zip` / `login.json` / `deploy/config.php` absent on disk (LP.C.2 session).
5. Per-microtask VERIFY records: LP.A.1 DONE note (`DEPLOY_GUIDE_CPANEL.md` §3.2, Verified probe); LP.B.1 upload matrix (48/0 above); LP.B.2 read tier (code inspection: auth-only, any role, 404 unknown — E2E leg per the LP.B.4 record); LP.B.3 client wiring (inspection: `uploadLogoToServer`, `uploadMode`, hydration in `App.jsx`/`SidebarLayout.jsx`); LP.B.4 contract (`tests/settings-logo-picker.spec.js` header + `SCOPE_EXPANSION_MILESTONES.md` LP.B.4 update, both present); LP.C.1 ignores (check-ignore + ls-files probes); LP.C.2 this record. Manual rows (F-LP6) stay manual with owner + evidence slots (taste #19): `DEPLOY_GUIDE_CPANEL.md` §3.2 checklist — owner = teammate with cPanel access, evidence = Cron Jobs screenshot + File Manager listing, ordered after all automated VERIFYs (taste #55).
6. §11 write-backs exist: DEPLOY_GUIDE DONE note + manual checklist (LP.C.2), A2.5-LOGO spec header (LP.B.4, present), SCOPE_EXPANSION_MILESTONES A2.5-LOGO LP.B.4 update (present, idb-only expectation superseded per taste #42), PRODUCTION_MILESTONES M5.2 logo-portability DONE (LP.C.2).

Stale claim corrected (taste #42): the A2.5-LOGO `{type:'idb'}`-only expectation is superseded by the `{type:'server', id}` contract; offline/denied stays `{type:'idb'}` (R-LP5). Deferred with owners (taste #53, unchanged): bootstrap-Cron removal proof + server-side zip/login/config cleanup (teammate, runbook above); photo outbox (future scope-expansion); branch-photo scope (non-goal); full-suite green (HYGIENE chain). Next venue: PRODUCTION Gate D7.1 staging (rebuild `deploy/` via `npm run build:deploy`, then domain smoke).

## 12. Cross-references

- `docs/UNIVERSAL.md` — Core Checklist + Executor Loop + Verification Language (primary contract).
- `docs/IMPLEMENTATION_PLAN.md` Part 2 — `settings: { logoUrl, title }` contract (extended only by `logoEntry`, already in code).
- `docs/SCOPE_EXPANSION_PLAN.md` Part 5 (photos never in localStorage; server-first) + Part 6 (Global settings → superadmin-only).
- `docs/SCOPE_EXPANSION_PRIVILEGES.md` — Global settings row (the boundary D-LP3 preserves).
- `docs/RELEASE_HYGIENE_PLAN.md` §9 / D-RH5 / R-RH3 / R-RH4 — storage model, endpoint idiom, offline boundary.
- `docs/DEPLOY_BUNDLE.md` D6/D7, `docs/CONFIG.md` D1-D7, `docs/OPERATIONS.md` §1 — deploy/config/private runbook.
- Code anchors: `src/lib/photoStorage.js:59-111`, `src/components/PhotoSlot.jsx:22-58`, `src/components/SettingsModal.jsx:36-56`, `src/components/SidebarLayout.jsx:13-28`, `src/lib/store.js:13-21,592-610`, `server/api/photo-upload.php:50-60`, `server/api/photo-download.php:52-89`, `server/auth/authorize.php:10-16,87`.
