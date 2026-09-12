# Logo Portability Milestones — Microtask Chain (LP.A → LP.C)

**Companion to `docs/LOGO_PORTABILITY_PLAN.md`.** Decomposes the fix plan into strictly ordered microtasks. Each microtask must VERIFY before the next begins; a failing check becomes a bounded follow-up, not a widened edit (taste #3/#4). All microtasks conform to the standard MICROTASK shape used across `docs/`.

**Source of truth for findings/decisions:** `LOGO_PORTABILITY_PLAN.md` §3 (F-LP1–F-LP6) and §4 (D-LP1–D-LP6). The chain below does not restate plan prose; each `FINDS`/`RULES` line cites the registry.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-LP references>
  RULES:   <R-LP codes + existing invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

**Gate exit criteria (the chain closes when all of these hold):**

1. `DEPLOY_GUIDE_CPANEL.md` contains no bare `` `config.php` `` reference (every occurrence is qualified per D-LP5) and the row-4b warning callout is present.
2. Superadmin logo upload on device A renders on device B (fresh context) through the logo trio with zero per-device import; the stored `logoEntry` is `{type:'server', id}`.
3. Branch-photo upload/download contracts are unchanged (existing photo specs still green — no broadening, no regression).
4. `git ls-files` contains neither `deploy-upload.zip` nor `login.json`; `git check-ignore` covers both names.
5. Every microtask's VERIFY has a recorded `Verified: <command> -> <result>` line (or an explicit manual-runbook record for the inherently manual rows, taste #19).
6. §11 write-back records exist on the source docs (DEPLOY_GUIDE, A2.5-LOGO spec header, SCOPE_EXPANSION_MILESTONES A2.5-LOGO, PRODUCTION_MILESTONES M5.2).

---

## Gate LP.A — Config-docs disambiguation (F-LP4)

### LP.A.1 Qualify every config.php reference

```text
MICROTASK: Disambiguate config.php wording
  EDIT:    docs/DEPLOY_GUIDE_CPANEL.md (only)
  FINDS:   F-LP4; D-LP5
  RULES:   R-LP6; docs-only edit (no app behavior); keep the .env-only sanction (RH.A.2) word-for-word; Indonesian operator copy where the UI is involved stays untouched
  DEPENDS: none
  OUTCOME: a teammate reading the login-500 rows can no longer mistake the tracked source for the forbidden stray file.
  VERIFY:  node -e probe: read docs/DEPLOY_GUIDE_CPANEL.md, assert zero bare "`config.php`" occurrences outside the two qualified forms ("server/config.php" and "<docroot>/config.php") and assert the row-4b warning callout string is present; `git diff --stat` shows only docs/DEPLOY_GUIDE_CPANEL.md
  DONE-IF: verify passes; only intended files changed
```

---

## Gate LP.B — Logo server tier (F-LP1, F-LP2, F-LP3)

### LP.B.1 Add logo-upload endpoint

```text
MICROTASK: Add server/api/logo-upload.php
  EDIT:    server/api/logo-upload.php (new); server/tests/logo.endpoint.php (new, proves the matrix below)
  FINDS:   F-LP1, F-LP2; D-LP1, D-LP2, D-LP3
  RULES:   R-LP1, R-LP2, R-LP3; mirror server/api/photo-upload.php validation pipeline verbatim (finfo sniff + getimagesize + 2 MB cap on actual bytes, server-generated name via savePhotoBytes, auditEvent('logo_uploaded')); superadmin-only (403 otherwise) + requireCsrf(); accept NO cabangId (422 if sent); cabang_id stored NULL; never trust client-declared type
  DEPENDS: LP.A.1
  OUTCOME: a superadmin POST with a real JPEG/PNG/WebP receives 201 {id} and a private/uploads file; any other role receives 403 and leaves zero rows and zero files.
  VERIFY:  php server/tests/logo.endpoint.php -> upload matrix green (valid 201 + row + file exists; spoofed MIME 422; oversized 422; non-superadmin 403; cabangId-sent 422; all rejects leave zero new rows/files)
  DONE-IF: verify passes; only intended files changed
```

### LP.B.2 Add logo-current + logo-download endpoints

```text
MICROTASK: Add logo-current.php + logo-download.php
  EDIT:    server/api/logo-current.php (new), server/api/logo-download.php (new)
  FINDS:   F-LP3; D-LP2, D-LP3
  RULES:   R-LP1, R-LP3; mirror server/api/photo-download.php guards (traversal/mime checks, 404 unknown id, scope before disk read); GET with cookie-session auth only (no CSRF, same as photo-download/read.php); any authenticated role may read logo bytes or the current id — the full settings payload stays superadmin-only (D-LP3, no roleCanReadEntity change)
  DEPENDS: LP.B.1
  OUTCOME: any logged-in device can resolve the current logo id and stream its exact bytes while the bank-rekening settings payload stays closed.
  VERIFY:  php server/tests/logo.endpoint.php (read leg) -> anonymous 401, superadmin 200, admin_cabang 200, trainer 200, unknown id 404, cross-check byte-identical to upload bytes with matching Content-Type
  DONE-IF: verify passes; only intended files changed
```

### LP.B.3 Wire the client to the logo tier

```text
MICROTASK: Wire PhotoSlot + SettingsModal + SidebarLogo to logo tier
  EDIT:    src/lib/photoStorage.js (add uploadLogoToServer + logo-current/download fetchers), src/components/PhotoSlot.jsx (add uploadMode prop, default 'branch-photo'), src/components/SettingsModal.jsx (logo slot passes uploadMode='global-logo'), src/components/SidebarLayout.jsx + src/App.jsx (hydrate missing logo via logo-current/download, warm idb cache)
  FINDS:   F-LP1, F-LP2, F-LP3; D-LP4
  RULES:   R-LP3, R-LP4; taste #11 (mirror the existing uploadPhotoToServer/fetchPhotoDataUrl idiom — no new pattern); one concern per edit (no styling changes, classNames verbatim); offline/denied falls back to idb silently (R-LP5 boundary); Indonesian copy unchanged (Pilih foto / Ganti foto / Hapus foto / Simpan)
  DEPENDS: LP.B.2
  OUTCOME: a superadmin logo pick saves {type:'server', id} and every device renders it; offline picks still save {type:'idb'} and render locally.
  VERIFY:  npm test -- photoStorage + npx playwright test tests/settings-logo-picker.spec.js --project=default --workers=1 -> superadmin upload saves {type:'server'} and header renders data URL; offline/denied probe keeps {type:'idb'}; existing branch-photo specs still pass unchanged
  DONE-IF: verify passes; only intended files changed
```

### LP.B.4 Update the A2.5-LOGO contract

```text
MICROTASK: Update settings-logo-picker spec to server contract
  EDIT:    tests/settings-logo-picker.spec.js (header comment + {type:'server'} assertion + cross-device leg), docs/SCOPE_EXPANSION_MILESTONES.md (A2.5-LOGO row expectation)
  FINDS:   F-LP1; D-LP4
  RULES:   R-LP3, R-LP6; taste #21 (specs named after milestone rows); keep the same-device refresh leg (now proves cache warming) and add the second-context leg (proves portability); cleanup leg still clears the test logo so the shared profile does not leak
  DEPENDS: LP.B.3
  OUTCOME: the suite pins universal-logo behavior instead of same-browser behavior.
  VERIFY:  npx playwright test tests/settings-logo-picker.spec.js --project=default --workers=1 -> green, and a deliberate revert probe (logoEntry forced to {type:'idb'}) fails the new cross-device leg while passing the old refresh leg
  DONE-IF: verify passes; only intended files changed
```

---

## Gate LP.C — Hygiene + reconciliation and write-back (F-LP5, F-LP6)

### LP.C.1 Harden ignores + prove zip/login absence

```text
MICROTASK: Harden .gitignore for zip/login artifacts
  EDIT:    .gitignore (append deploy-upload.zip + login.json lines)
  FINDS:   F-LP5; D-LP6
  RULES:   R-LP3; defense-in-depth only (no tracked file is touched); taste #73 idiom (generated/mirror artifacts ignored at rest)
  DEPENDS: LP.B.4
  OUTCOME: a future deploy-upload.zip or login.json drop is invisible to git add -A on any clone.
  VERIFY:  git check-ignore -v deploy-upload.zip login.json -> both ignored; git ls-files | select-string 'deploy-upload|login\.json' -> no hits; Test-Path deploy-upload.zip, login.json, deploy/config.php -> all False
  DONE-IF: verify passes; only intended files changed
```

### LP.C.2 Manual carry-overs + source-doc write-back

```text
MICROTASK: Record manual checks + write completion back
  EDIT:    docs/DEPLOY_GUIDE_CPANEL.md (DONE note on §3.2 + Cron-removal checklist box), docs/PRODUCTION_MILESTONES.md (M5.2 logo-portability DONE), docs/LOGO_PORTABILITY_PLAN.md (status line: IMPLEMENTED with date)
  FINDS:   F-LP6; all (taste #43 write-back)
  RULES:   R-LP6; taste #19 (inherently manual rows stay manual with an explicit runbook: cPanel Cron Jobs screenshot + File Manager listing showing no deploy-upload.zip/login.json on the server, owner = teammate with cPanel access); taste #42 (stale claims corrected: A2.5-LOGO idb-only expectation superseded); destructive steps last (taste #55 — server cleanup after all automated VERIFYs)
  DEPENDS: LP.C.1
  OUTCOME: the repo records what automation proved and names the human owner and evidence for what it cannot prove.
  VERIFY:  document inspection: every Gate exit criterion 1-6 checks out; each LP microtask DONE record carries its Verified: line (or manual-runbook record with owner + evidence slot); git status shows only intended doc/test/ignore changes with no console.log in src/ and no build artifacts
  DONE-IF: verify passes; only intended files changed
```

---

## Ordering rationale

- LP.A before everything: doc wording changes which file a teammate might delete; the safety note must land before any implementation begins.
- LP.B.1 before B.2: the upload endpoint creates the ids the read endpoints serve; the read matrix is meaningless without a known-good id.
- LP.B.2 before B.3: the client hydrates against `logo-current`/`logo-download` — wiring before the endpoints exist strands the UI on 404s.
- LP.B.3 before B.4: the spec pins behavior the client just implemented; writing the assertion first would fail against the old client.
- LP.C last: ignore-hardening and write-back compose every prior VERIFY; manual server cleanup runs after all automated evidence is frozen (taste #55).

## Deferred with owners (taste #53)

| Item | Owner / resolving venue | Why deferred |
|---|---|---|
| One-time bootstrap Cron removal proof | Teammate with cPanel access (LP.C.2 manual row) | Off-repo state; no repo command can verify it |
| `deploy-upload.zip` / `login.json` server-side deletion | Same teammate (LP.C.2 manual row) | Server File Manager state, not repo state |
| Photo outbox (offline retry) | Future scope-expansion microtask | YAGNI; boundary documented in R-LP5 / OPERATIONS.md |
| Branch-photo scope changes (D-RH9) | None in this chain | Explicit non-goal; logo tier is additive |
| Full-suite green (16 pre-existing failures) | HYGIENE chain (`RELEASE_HYGIENE_PLAN.md` §13) | Owned elsewhere; LP battery asserts only its own slices + no-regression of photo specs |
