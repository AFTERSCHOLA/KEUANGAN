# Release Hygiene Milestones — Microtask Chain (RH.A → RH.H)

**Companion to `docs/RELEASE_HYGIENE_PLAN.md`.** Decomposes the release-readiness fix plan into strictly ordered microtasks. Each microtask must VERIFY before the next begins; a failing check becomes a bounded follow-up, not a widened edit (taste #3/#4). All microtasks conform to the standard MICROTASK shape used across `docs/`.

**Source of truth for findings/decisions:** `RELEASE_HYGIENE_PLAN.md` §3 (F-RH1–F-RH9) and §4 (D-RH1–D-RH11). The chain below does not restate the plan prose; each `FINDS`/`RULES` line cites the registry.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-RH references>
  RULES:   <R-RH codes + existing invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

**Gate exit criteria (the chain closes when all of these hold):**

1. `npm run rc:verify` exits 0 end-to-end (RH.G.1's seven steps).
2. `git ls-files deploy/` shows only Vite outputs + `deploy/invoice/` + `deploy/pwa/` + the tracked Vite entry files — no mirror artifacts, no `config.php`.
3. `scripts/secret-scan.cjs` exits 0 (no tracked credential files, no non-placeholder password literals).
4. Every microtask's VERIFY has a recorded `Verified: <command> -> <result>` line appended to its DONE record.
5. `docs/OPERATIONS.md` exists and covers all six M5.4 topics with a verified backup→restore cycle.
6. The v4 import dry-run/commit + reconcile cycle passes against both fixture sets and a seeded drift.
7. All completion records from `RELEASE_HYGIENE_PLAN.md` §15 are written back to the source milestone docs.

---

## Gate RH.A — Credential incident and .env seam (F-RH1, F-RH2)

### RH.A.1 Untrack the deploy/ mirror and remove the leaked config

```text
MICROTASK: Untrack deploy mirror + remove leaked config.php
  EDIT:    .gitignore (add /deploy/config.php defense-in-depth line), deploy/config.php (delete from disk), scripts/build-deploy.cjs (DEPLOY_GITIGNORE constant gains config.php and .env lines)
  FINDS:   F-RH1, F-RH2; D-RH1, D-RH6
  RULES:   R-RH1, R-RH2; git rm --cached for the mirror set (api/, auth/, bin/, lib/ once mirrored, bootstrap.php, config.example.php, schema.sql, .htaccess) — Vite outputs and invoice/ + pwa/ assets stay tracked; the removal commit message records the rotation requirement
  DEPENDS: none
  OUTCOME: git ls-files deploy/ lists only Vite outputs + deploy/invoice/ + deploy/pwa/ + deploy/index.html + manifest/sw/registerSW/workbox files; deploy/config.php exists nowhere on disk; a freshly hand-dropped deploy/config.php is ignored by git
  VERIFY:  git ls-files deploy/ contains no api/ auth/ bin/ lib/ bootstrap.php config.example.php schema.sql .htaccess config.php entries; git check-ignore deploy/config.php exit 0; Test-Path deploy/config.php -> False
  DONE-IF: verify passes; only intended files changed
```

### RH.A.2 Add .env.example + dotenv loader

```text
MICROTASK: Add .env.example and parse .env in bootstrap
  EDIT:    .env.example (new, repo root), server/bootstrap.php (parseEnvFile() + load first existing of __DIR__/.env and dirname(__DIR__)/.env), scripts/build-deploy.cjs (mirror .env.example → deploy/.env.example)
  FINDS:   F-RH1 (prevention half); D-RH4
  RULES:   R-RH1; real environment variables always win over .env; no new composer/npm dependency; # comments, KEY=VALUE, optional single/double quotes stripped; .env already root-gitignored
  DEPENDS: RH.A.1
  OUTCOME: an operator can copy .env.example to .env, paste the rotated APP_DSN/APP_DB_USER/APP_DB_PASS/APP_SESSION_SECURE values, and serverConfig() picks them up on the next request with zero file edits inside server/
  VERIFY:  php -r test: with a temp .env (APP_ENV=production, APP_DB_USER=envtest) beside server/, require server/bootstrap.php + serverConfig() returns production/envtest; with APP_DB_USER set as a real env var AND .env holding a different value, the real env var wins; cleanup leaves no .env on disk
  DONE-IF: verify passes; only intended files changed
```

### RH.A.3 Secret scan script

```text
MICROTASK: Add scripts/secret-scan.cjs
  EDIT:    scripts/secret-scan.cjs (new), package.json (no script entry yet — rc:verify owns it)
  FINDS:   F-RH1, F-RH2 (regression guard)
  RULES:   R-RH1; zero dependencies; checks — (a) git ls-files contains no deploy/config.php, .env, or mirror artifacts; (b) no tracked file matches a password literal pattern (non-'replace_me' DB password key with a non-empty value in config-shaped files, skip .env.example placeholders); (c) deploy/.gitignore content includes config.php when deploy/ exists
  DEPENDS: RH.A.2
  OUTCOME: node scripts/secret-scan.cjs exits 0 on the cleaned tree and exits 1 with a named file list when a credential-shaped file is tracked or a password literal is present
  VERIFY:  node scripts/secret-scan.cjs -> exit 0; temporary negative probe (git add a fake .env via .gitignore bypass) -> exit 1 naming the file; probe removed
  DONE-IF: verify passes; only intended files changed
```

## Gate RH.B — Deploy bundle integrity (F-RH3)

### RH.B.1 Mirror server/lib into the bundle

```text
MICROTASK: Add server/lib to build-deploy mirrors
  EDIT:    scripts/build-deploy.cjs (MIRRORS += { from: server/lib, to: deploy/lib }; parity expected-set += lib/; DEPLOY_GITIGNORE += lib/)
  FINDS:   F-RH3
  RULES:   R-RH2; parity post-check remains the hard gate (taste #72); the api/validation special-case precedent is the model for relative-require dirs
  DEPENDS: RH.A.1
  OUTCOME: npm run build:deploy produces deploy/lib/backupRestore.php and deploy/lib/invoiceGenerator.php; backup-create/backup-download/restore/invoices-generate would no longer 500 on cPanel from the missing require
  VERIFY:  npm run build:deploy exits 0 with post-check parity clean; Test-Path deploy/lib/backupRestore.php, deploy/lib/invoiceGenerator.php -> both True; php -l on both mirrored files passes
  DONE-IF: verify passes; only intended files changed
```

### RH.B.2 Update bundle/config docs

```text
MICROTASK: Update DEPLOY_BUNDLE.md and CONFIG.md
  EDIT:    docs/DEPLOY_BUNDLE.md (D7 wording — .env flow replaces edit-config.php-on-server; §3 bundle list gains lib/; D-RH6 untrack decision recorded), docs/CONFIG.md (§3 production block: .env flow + .env.example as the paste-ready template)
  FINDS:   F-RH1 follow-through; F-RH3
  RULES:   R-RH7 (documentation of real endpoints only); mirror the existing docs' decision-set format exactly (taste #52)
  DEPENDS: RH.B.1
  OUTCOME: a new operator reading DEPLOY_BUNDLE.md §4 deploys with cp .env.example .env + paste, never edits a PHP file, and knows server/lib/ ships in the bundle
  VERIFY:  document inspection: DEPLOY_BUNDLE.md §4 references .env/.env.example not "edit config.php"; §3 lists lib/backupRestore.php + lib/invoiceGenerator.php; CONFIG.md §3 shows the .env paste flow
  DONE-IF: verify passes; only intended files changed
```

## Gate RH.C — HTTP hardening leftovers (F-RH4, M5.1)

### RH.C.1 HSTS behind session_secure + sourcemap pin

```text
MICROTASK: Add gated HSTS and pin sourcemap=false
  EDIT:    server/bootstrap.php (securityHeaders() gains Strict-Transport-Security iff serverConfig()['session_secure'] === true), vite.config.js (explicit build.sourcemap: false)
  FINDS:   F-RH4
  RULES:   R-RH9, D-RH7, D-RH8; HSTS max-age=31536000 includeSubDomains, no preload; local dev (secure=false default) must never receive the header; no repo-root .htaccess is added (D-RH7 — the repo root is never a document root; deploy/.htaccess stays the single protection point)
  DEPENDS: RH.A.2 (serverConfig env precedence feeds the gate)
  OUTCOME: a production HTTPS host (APP_SESSION_SECURE=true / .env) sends HSTS on every API response; local dev sends none; no dist/assets/*.map can ever be emitted by default config
  VERIFY:  php -r CLI probe: headers_list() with APP_SESSION_SECURE=true contains the HSTS line; with false (default) it does not; npm run build -> Get-ChildItem dist/assets/*.map count 0
  DONE-IF: verify passes; only intended files changed
```

## Gate RH.D — Server-side photo storage (F-RH5, M5.2)

### RH.D.1 Photo store library

```text
MICROTASK: Add server/lib/photoStore.php
  EDIT:    server/lib/photoStore.php (new)
  FINDS:   F-RH5
  RULES:   R-RH3, R-RH4, D-RH5; photoStorageDir() mirrors backupStorageDir() (private/uploads, one above server/, 0750); savePhotoBytes(): random bin2hex name, 0640, returns storage_path relative to the uploads dir; loadPhotoBytes(): realpath traversal guard (must resolve inside photoStorageDir())
  DEPENDS: RH.B.1 (lib/ is a mirrored dir now)
  OUTCOME: the storage primitives exist: dir creation, save with server-generated names, load with traversal guard — no endpoint wiring yet
  VERIFY:  php -r probe: savePhotoBytes(jpeg bytes) returns a path; loadPhotoBytes(same) returns identical bytes; loadPhotoBytes('../../server/config.php') throws/returns null without reading the file
  DONE-IF: verify passes; only intended files changed
```

### RH.D.2 Photo upload endpoint

```text
MICROTASK: Add server/api/photo-upload.php
  EDIT:    server/api/photo-upload.php (new), server/auth/authorize.php (only if 'photos' needs an explicit deny-list/matrix entry — mirror the manage_backup pattern)
  FINDS:   F-RH5
  RULES:   R-RH1..R-RH4, D-RH9; requireAuthenticatedUser + requireCsrf; finfo content sniff + getimagesize sanity; allow JPEG/PNG/WebP actual content only; 2 MB cap (bootstrap's requestJson cap already guards the JSON envelope — the raw upload path must enforce its own); INSERT INTO photo_uploads (id, cabang_id, owner_user_id, storage_path, mime_type, byte_size); auditEvent('photo_uploaded'); cabang_id from the user's session scope
  DEPENDS: RH.D.1
  OUTCOME: any authenticated role can POST a photo and receive {id} with the row recorded; spoofed-MIME (declared image/png, actual text/php), oversized, and non-image content all 422 with zero rows and zero files written
  VERIFY:  server/tests/photo.endpoint.php (new, part of RH.D.4) covers this matrix
  DONE-IF: verify passes; only intended files changed
```

### RH.D.3 Photo download endpoint

```text
MICROTASK: Add server/api/photo-download.php
  EDIT:    server/api/photo-download.php (new)
  FINDS:   F-RH5
  RULES:   R-RH3, D-RH9; GET ?id=; requireAuthenticatedUser; superadmin any, admin_cabang own branch (photo row's cabang_id), trainer own branch; 404 unknown id (do not leak existence); Content-Type from the stored mime_type; bytes via loadPhotoBytes(); never a public URL
  DEPENDS: RH.D.2
  OUTCOME: an authorized same-branch request returns the exact bytes with the right content type; a cross-branch or anonymous request gets 403/401 with no bytes; there is no filesystem path under the document root that serves the file
  VERIFY:  covered by server/tests/photo.endpoint.php (RH.D.4)
  DONE-IF: verify passes; only intended files changed
```

### RH.D.4 Photo endpoint verification suite

```text
MICROTASK: Add server/tests/photo.endpoint.php
  EDIT:    server/tests/photo.endpoint.php (new)
  FINDS:   F-RH5; M5.2 VERIFY clause (PRODUCTION_MILESTONES.md:287)
  RULES:   taste #54 (run backend contract scripts directly, report individually); self-booting PHP dev server on a scratch port with proc reaping (Windows-safe: taskkill /T pattern; taste #56 no fabrication if a blocker appears)
  DEPENDS: RH.D.3
  OUTCOME: the full M5.2 VERIFY matrix passes in one script: anonymous 401, cross-branch 403, spoofed MIME 422, oversized 422, traversal 422/404, valid upload+download roundtrip byte-identical, audit row present; no orphan php.exe left after the run
  VERIFY:  php server/tests/photo.endpoint.php -> all checks passed, exit 0; Get-CimInstance php.exe count returns to baseline after the run
  DONE-IF: verify passes; only intended files changed
```

### RH.D.5 Client server-photo tier

```text
MICROTASK: Add server photo tier to photoStorage.js + PhotoSlot flow
  EDIT:    src/lib/photoStorage.js (uploadPhotoToServer()/fetchPhotoDataUrl() + entry {type:'server', id} with idb cache), src/components/PhotoSlot.jsx (no API change — the save path calls the server tier when authed), tests (vitest unit for the entry-shape resolution)
  FINDS:   F-RH5; PRODUCTION_PLAN §8 (photos never in localStorage; approved idb holds offline cache)
  RULES:   taste #11 (mirror the existing PhotoSlot/idiom; no new pattern); offline = stay idb-only entry (photo outbox deferred, RELEASE_HYGIENE_PLAN §13); authenticated requests via the existing api.js apiRequest
  DEPENDS: RH.D.4
  OUTCOME: an online trainer saving attendance photos gets server-backed entries that render on any device after login (idb cache warms from the server); offline-captured photos keep the existing idb behavior
  VERIFY:  Playwright tests/photo-server-roundtrip.spec.js (new): login as admin_cabang, upload via PhotoSlot, assert photo_uploads row + entry {type:'server'}; second context (fresh login, empty idb) renders the thumbnail from the download endpoint; vitest unit tests for entry resolution pass; npm run build green
  DONE-IF: verify passes; only intended files changed
```

**DONE record (2026-09-11, post-implementation review):** Implementation landed across commits `ae11c3c..acfbdcf` and passed `npm run rc:verify` ALL 7 STEPS OK. The full-suite re-run then exposed a **spec-side race** in this microtask's own VERIFY (not an app defect): the device-2 leg registered `page2.waitForResponse('/api/photo-download.php?id=…')` *after* `openTab()` + card-visibility await, but `SchoolThumbnail`'s mount effect fires the fetch at tab render — the trace (`test-results/.../trace.zip` → `1-trace.network`) shows the app correctly issued GET photo-download and received **200** three times ~40.16–40.28, all before the waiter was registered; `waitForResponse` then timed out at 20 s. Register-too-late race, same class as the `881ae5c` loginViaApi fix. Fixed in the spec only (`tests/photo-server-roundtrip.spec.js`): the response waiter is now registered **before** `openTab()`, the `img.src` poll stays as the render proof. `Verified: npx playwright test tests/photo-server-roundtrip.spec.js --project=default --workers=1 -> 1 passed (36.9s)`; `Verified: --repeat-each=3 -> 3 passed (1.6m)`; `Verified: php server/tests/photo.endpoint.php -> 30 checks / 0 failed, no orphan php.exe`; `Verified: npm run rc:verify -> ALL 7 STEPS OK`. Carry-in fix: `scripts/build-deploy.cjs:253` summary line still instructed the pre-RH.A.2 "create config.php" flow — updated to the `.env` flow (docs already were). The remaining full-suite failures are the 16 documented pre-existing cohorts (RELEASE_HYGIENE_PLAN §13), unchanged by this chain.

**Follow-up fixed the same day (bundle determinism):** the review also exposed non-deterministic CSS: Tailwind v4 auto content-detection scanned *tracked* previous build generations under `deploy/assets/` as class sources, so a stale bundle (e.g. one containing the now-dead `mx-4` modal class) fed classes back into the next CSS build — two builds of identical `src/` produced different hashes (observed when the implementer's `acfbdcf` needed a manual asset-reference fix, and reproduced 2026-09-11: old CSS 46,011 B contained `.mx-4`, zero usage anywhere in `src/`, JS bytes identical but hash changed via Rollup graph-hash cascade). Permanent fix, two layers: (1) `src/index.css` pins the input set — `@import "tailwindcss" source(none)` + `@source "."` + `@source "../index.html"` — classes now come only from `src/` and `index.html`, never from build outputs/tests/docs; (2) `scripts/build-deploy.cjs` step 6 purges stale Vite generations in `deploy/` (`assets/`, `pwa/`, hashed roots, `workbox-*.js`) before overlaying `dist/`, so exactly one generation ever ships. `Verified: two consecutive builds with a stale generation planted in deploy/assets -> byte-identical CSS+JS (sha256 match, same filenames)`; `Verified: class-coverage probe -> 353 unique src/ class tokens, NONE missing from built CSS`; `Verified: npm test -> 65/65`; `Verified: visual+photo specs (r3-verify, sekolah-foto-picker, settings-logo-picker) -> 6/6`; `Verified: build:deploy -> parity clean, single generation, index.html+sw.js refs resolve`. CSS dropped 46,011 -> 38,856 B (purged deploy-scanned dead classes).

## Gate RH.E — Operator runbook (F-RH6, M5.4)

### RH.E.1 Write docs/OPERATIONS.md

```text
MICROTASK: Write docs/OPERATIONS.md
  EDIT:    docs/OPERATIONS.md (new)
  FINDS:   F-RH6
  RULES:   R-RH7; follow the six-section structure in RELEASE_HYGIENE_PLAN §10; UI copy stays Indonesian, doc structure English, matching house docs; every command is real (no invented cPanel paths — placeholders <user>/<db-name> where host-specific)
  DEPENDS: RH.B.2 (deploy flow), RH.D.4 (photo paths), RH.C.1 (.env flow)
  OUTCOME: an operator alone can deploy, rotate credentials, back up, restore, disable a user, respond to an incident, and roll back by following one document
  VERIFY:  document inspection against the M5.4 OUTCOME topics (PRODUCTION_MILESTONES.md:303-313): configure, backup, restore, rotate credentials, disable users, incident response — all six present with exact commands; plus a live backup→restore cycle against the test DB (npm run db:reset; backup via endpoint; restore via endpoint; re-read counts identical)
  DONE-IF: verify passes; only intended files changed
```

## Gate RH.F — v4 import and reconciliation (F-RH7, M6.1 + M6.2)

### RH.F.1 v4 importer endpoint

```text
MICROTASK: Add server/api/v4-import.php
  EDIT:    server/api/v4-import.php (new), server/lib/v4Import.php (new — pure functions: shapeNormalize, validateReferences, deriveMissingCabangIds, buildReport), server/tests/v4-import.fixtures.json (new: valid, broken-references, duplicate-ids sets)
  FINDS:   F-RH7; D-RH2 (empty DB), D-RH3, D-RH10
  RULES:   R-RH5, R-RH1; superadmin-only via manage_backup deny-list + CSRF; accepts {version:2,data:{…}} and the server snapshot {entities:{…}}; dryRun:true returns the report without a transaction; commit wraps ALL entities in one transaction — any duplicate id aborts to 409 with zero rows written; hard reference edges per RELEASE_HYGIENE_PLAN §11; auditEvent('v4_imported', {counts, dryRun})
  DEPENDS: RH.E.1 (runbook references it)
  OUTCOME: the operator's browser export imports in one shot or not at all, with a preview report either way
  VERIFY:  server/tests/v4.import.php (new): broken fixture -> zero rows + per-error report; valid fixture -> all rows, counts match fixture; same valid fixture again -> 409, zero new rows, counts unchanged; dryRun -> report-only, DB counts unchanged
  DONE-IF: verify passes; only intended files changed
```

### RH.F.2 Reconciliation CLI

```text
MICROTASK: Add server/bin/reconcile.php
  EDIT:    server/bin/reconcile.php (new), server/tests/reconcile.check.php (new)
  FINDS:   F-RH7; M6.2 VERIFY clause
  RULES:   R-RH6; sha256 signature over the report body; report stored under private/reports/ (outside doc root); exit 0 MATCH / exit 1 DRIFT with named drift lines; compares per-entity counts, per-branch tallies, ledger sums (spp_payments, honor_payments), invoice status mix
  DEPENDS: RH.F.1
  OUTCOME: php server/bin/reconcile.php <v4-export.json> verifies the imported DB against the source export and writes the signed report
  VERIFY:  server/tests/reconcile.check.php: matching fixture -> exit 0 + MATCH + report file written with sha256; seeded drift (one spp row deleted) -> exit 1 naming the drift
  DONE-IF: verify passes; only intended files changed
```

### RH.F.3 UI import path + E2E

```text
MICROTASK: Add Impor Data v4 to BackupRestorePanel + spec
  EDIT:    src/components/BackupRestorePanel.jsx (superadmin-only "Impor Data v4 ke Server" block: file picker or use-browser-data, dry-run AlertDialog preview with per-entity counts, commit, reload), tests/v4-import.spec.js (new)
  FINDS:   F-RH7; D-RH3 (the data is in the operator's browser)
  RULES:   taste #11 (mirror the existing AlertDialog/ConfirmDialog idiom); R-RH8 (no app-behavior broadening — UI asserts only the new import surface); Indonesian copy (Pratinjau Impor / Mulai Impor / Batalkan); no localStorage-only import — the server importer is the only write path; destructive action confirmed (taste #55 — restore/import runs last)
  DEPENDS: RH.F.2
  OUTCOME: a superadmin with a v4 export in their browser can import to the server through the UI; every other role sees nothing
  VERIFY:  npx playwright test tests/v4-import.spec.js --project=default --workers=1: trainer renders no import button; superadmin imports a seeded v4 fixture (use-browser-data leg), /api/read.php counts match; second import surfaces the conflict preview
  DONE-IF: verify passes; only intended files changed
```

## Gate RH.G — RC battery + CI (F-RH8, M6.3)

### RH.G.1 npm run rc:verify

```text
MICROTASK: Add scripts/rc-verify.cjs + rc:verify script
  EDIT:    scripts/rc-verify.cjs (new), package.json (scripts.rc:verify)
  FINDS:   F-RH8
  RULES:   D-RH11 (named-green battery, NOT the full Playwright suite — 16 documented pre-existing failures stay owned by RELEASE_HYGIENE_PLAN §13); ordered steps with early exit on failure; each step's command + decisive result line printed; taste #28 (no claiming pass when capped)
  DEPENDS: RH.F.3 (the battery includes the v4 + photo specs)
  OUTCOME: one command proves the release candidate: php -l all server files, PHP battery (all server/tests/*.php incl. photo, v4, reconcile), npm test, db:reset + focused Playwright named set, build with zero sourcemaps, build:deploy with parity, secret-scan
  VERIFY:  npm run rc:verify -> exit 0 with all seven step results printed; a deliberately broken probe (temp php syntax error) -> exits non-zero at step 1 naming the file; probe reverted
  DONE-IF: verify passes; only intended files changed
```

### RH.G.2 GitHub Actions fast lane

```text
MICROTASK: Add .github/workflows/ci.yml
  EDIT:    .github/workflows/ci.yml (new)
  FINDS:   F-RH8; M6.3
  RULES:   D-RH11 node-only lane (no third-party setup actions, no guessed runner PHP): npm ci, npm test, npm run build, node scripts/secret-scan.cjs, tracked-file guard (git ls-files deploy/ contains no mirror artifacts); PHP battery stays local/staging via rc:verify; push remains user-owned (taste #21)
  DEPENDS: RH.G.1
  OUTCOME: every push gets a green/red fast-lane check; the heavier RC battery is a documented pre-release local/staging gate
  VERIFY:  yaml parse check (node -e js-yaml-free manual parse or actionlint if available) + document the expected first-run evidence slot; the first real Actions run result is recorded in the DONE record when the user pushes
  DONE-IF: verify passes; only intended files changed; first-run evidence recorded when pushed
```

## Gate RH.H — Final reconciliation and write-back

### RH.H.1 Run the full battery + record completion

```text
MICROTASK: Final rc:verify + source-doc write-back
  EDIT:    docs/PRODUCTION_MILESTONES.md (M5.1/M5.2/M5.4/M6.1/M6.2/M6.3 DONE records), docs/PRODUCTION_GATE_CONFIRMATION_MILESTONES.md (T5/T6 rows + cross-cutting findings #6/#8/#10 resolution notes + AppModal retraction note per F-RH9), docs/DEPLOY_BUNDLE.md + docs/CONFIG.md (already updated RH.B.2 — cross-check), docs/RELEASE_HYGIENE_PLAN.md (status line: IMPLEMENTED)
  FINDS:   all; taste #43 (record completed gate work back on source milestone docs)
  RULES:   R-RH10, taste #42 (stale claims corrected: the AppModal orphan claim and the "server/config.php ignored" T0 claim are reconciled); every DONE record carries its Verified: command -> result line; the D9.1 section gains the 2026-09-10 HEAD re-verification note (44ede9c refactor was post-battery)
  DEPENDS: RH.G.2
  OUTCOME: the release-readiness state is recorded in the authoritative docs; the project re-enters PRODUCTION Gate D7.1 (staging inspection) with the cPanel password rotation as the only human prerequisite
  VERIFY:  npm run rc:verify -> exit 0 (final run, recorded); grep the source docs for the DONE records — every M5.x/M6.x row updated; git status shows only intended doc changes
  DONE-IF: verify passes; only intended files changed
```

---

## Ordering rationale

- RH.A before everything: the credential fix and the .env seam change which files exist on disk; every later build/parity/spec step must run against the cleaned tree.
- RH.B (bundle integrity) precedes RH.D because `photoStore.php` ships via the lib/ mirror — adding it before the mirror exists would strand it out of the bundle.
- RH.C is independent of RH.D/E/F and is scheduled between them to keep the chain's rhythm (small verifiable slices, taste #4) — it may be reordered after RH.B.1 without breaking DEPENDS lines.
- RH.E (runbook) lands after the flows it documents exist (deploy/.env, photos, HSTS) and before RH.F, because the importer's operator steps are part of the runbook's restore/import section.
- RH.F (import/reconcile) runs after the runbook so D7.4's "no ad-hoc SQL" rule has a documented home for the import procedure.
- RH.G (battery) is last because it composes every prior verify into one command; RH.H writes the results back.
- Destructive data steps (v4 import E2E against the test DB) run last within their gate, after db:reset (taste #55).
