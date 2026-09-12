# cPanel Deploy & Troubleshooting Guide

**Status:** Living document — companion to `docs/OPERATIONS.md` (the full runbook). This guide is the step-by-step for a teammate performing the cPanel deploy, with a troubleshooting matrix for the 500-on-login failure reported 2026-09-11.
**Audience:** teammate deploying to cPanel (has cPanel access, not necessarily the repo).
**Scope:** deploy + the login 500 diagnosis. Backup/restore/rotation/incident stay in `docs/OPERATIONS.md`.

---

## 1. What must be true before you start (pre-flight)

| # | Requirement | Why |
|---|---|---|
| 1 | `npm run rc:verify` → ALL 7 STEPS OK locally | the bundle you upload must be the verified one (OPERATIONS §1) |
| 2 | `npm run build:deploy` → exits 0, parity clean | `deploy/` is generated, never hand-edited (D-RH6) |
| 3 | cPanel account has: MySQL® Databases, phpMyAdmin, Terminal/SSH (or "API" — see §2 step 7 fallback), File Manager or FTP, and **MultiPHP Manager** | needed for steps 3, 5, 6 |
| 4 | A database + DB user created in cPanel (Databases → MySQL® Databases), user granted ALL on that DB | the app's DB credential; create one now if it doesn't exist |
| 5 | The DB password you will use is **not** the old leaked credential — generate a new one (RELEASE_HYGIENE_PLAN D-RH1) | the old one is in git history; rotation is mandatory |

## 2. Step-by-step deploy

### Step 1 — Build the bundle

On the dev machine:

```text
npm run build:deploy
```

The `deploy/` directory now contains the complete bundle: Vite outputs (assets, sw.js, index.html, pwa/), mirrored PHP (`api/`, `auth/`, `bin/`, `lib/`, `bootstrap.php`, `config.example.php`, `schema.sql`), `.env.example`, `.htaccess`, `.gitignore`. **Do not edit anything in `deploy/` by hand.**

### Step 2 — Upload

cPanel → File Manager → navigate to the document root (usually `/home/<user>/public_html/`) → Upload → upload everything under `deploy/` **preserving directory structure**. If File Manager's upload is slow, zip `deploy/` (inside `deploy/` — zip its *contents*), upload the zip to the document root, then in File Manager right-click → Extract, then delete the zip.

### Step 3 — Create `.env` (REQUIRED — this is the step that prevents the 500)

The bundle ships **without credentials by design** (R-RH1: no secret ever lands in git). If you skip this step, the server runs in production mode with defaults that point at a test database — and by CONFIG.md decision D6, the app **fails closed** with 500 instead of silently using wrong credentials.

In the document root (next to `index.html`):

1. File Manager → New File → name it exactly `.env` (leading dot) → create.
2. Copy the template from `.env.example` (or the repo root `.env.example`) into it:
   ```text
   APP_ENV=production
   APP_DSN=mysql:host=localhost;dbname=<db-name>;charset=utf8mb4
   APP_DB_USER=<db-user>
   APP_DB_PASS=<db-password>
   APP_SESSION_SECURE=true
   ```
3. Replace `<db-name>`, `<db-user>`, `<db-password>` with your cPanel database values:
   - `<db-name>` and `<db-user>`: in cPanel, database names and users are always **prefixed with your cPanel username** — e.g. `aftersch_bisnis_manajemen`, user `aftersch_bisnisuser` (the D-RH1 leaked config used exactly these names — if this is your existing DB, the *password* must be a newly generated one, never the old).
   - `<db-password>`: the password you created in §1 pre-flight #4 (or a fresh rotation of it).
4. Save. Confirm `.htaccess` blocks it over HTTP: open `https://<domain>/.env` in a browser → must be denied (403/404), never the file contents.

**Local sanity-check of the `.env` content** (recommended, catches typos): the most common `.env` failures are a truncated password or an unprefixed DB name (see table rows 4c/5). Note that cPanel MySQL usually accepts connections only from the server itself (`localhost`), so a DSN test *from your dev machine* generally does not work — the real verification happens in Step 8 smoke checks on the domain. What you can check locally is the **format**: no quotes needed, no spaces around `=`, no `#` inside the password (see row 4c).

### Step 3b — No File Manager edit access? Host-level env vars instead of `.env`

cPanel "Select a PHP Version" / MultiPHP INI Editor → "Environment variables" (availability varies by host): set `APP_DSN`, `APP_DB_USER`, `APP_DB_PASS`, `APP_ENV=production`, `APP_SESSION_SECURE=true` there. Real environment variables win over `.env` (CONFIG.md §2 precedence), so the app picks them up with no file on disk. If neither `.env` nor host env vars are possible, the deploy cannot proceed — the app fails closed in production by design (D6).

### Step 4 — Import the schema

phpMyAdmin (cPanel → Databases → phpMyAdmin) → select your database `<db-name>` in the left pane → Import → Choose File → upload `schema.sql` from the bundle → Go. Expected: green "has imported successfully", tables created (`users`, `cabang`, `sekolah`, `migrations`, etc.).

**First deploy to an EMPTY database:** import `schema.sql`. **Existing cPanel database already has data** (see D-RH2: the one behind the leaked config was schema-only): check phpMyAdmin → does `<db-name>` already contain the app tables? If yes and it holds the old (imported) rows, DO NOT import `schema.sql` again — instead run the importer: log in as superadmin → Settings → "Impor Data v4" (RH.F.3) with the v4 browser export, or ask the dev to run `server/bin/reconcile.php` procedures (OPERATIONS §3).

### Step 5 — Create `private/` outside the document root

cPanel → File Manager → navigate to `/home/<user>/` (one level **above** `public_html`) → New Folder → `private` → inside it create `uploads/`, `backups/`, `logs/`. Photos and backups are written here at runtime by the app (photoStore.php / backupRestore.php) — never inside `public_html` (D-RH5).

```text
/home/<user>/private/uploads
/home/<user>/private/backups
/home/<user>/private/logs
```

### Step 6 — Set PHP version ≥ 8.1 (the other common cause of the login 500)

The server code requires **PHP 8.1+** (`: never` return types in `server/bootstrap.php` + `auth/session.php`, `str_contains` across config files — see §4 root-cause table, row PHP<8.1). cPanel MultiPHP defaults can be 7.x or 8.0 depending on host age.

cPanel → **MultiPHP Manager** → select your domain → set **PHP 8.1** or newer (8.2/8.3 recommended). Then verify in cPanel → **Terminal** (or Upload a `phpinfo` file if no Terminal):

```bash
php -v
```

Must show ≥ 8.1. Also confirm the extensions are present (cPanel → Select a PHP Version → Extensions): **`pdo_mysql`**, `openssl`, `mbstring`, `fileinfo` (photo upload sniffing) — all standard on cPanel.

### Step 7 — Bootstrap the first superadmin

cPanel → Terminal (in the document root):

```bash
cd ~/public_html
php bin/create-superadmin.php --username=<name> --display-name=<name>
```

The password is read from a hidden prompt. The bootstrapper is CLI-only by design — the UI cannot create the first superadmin, and users are never written by hand (R-RH7). If the host provides no Terminal/SSH: enable it via cPanel (most hosts expose "Terminal" in the advanced section), or use cPanel's "Cron Jobs" once — add a cron running the command with output to a file, let it fire, then delete the cron. `--password=<temp>` is supported for that controlled automation path (OPERATIONS §1).

### Step 8 — Smoke checks (all must pass in order)

```text
1. GET  https://<domain>/api/users.php            (no session) → 401  (not 404, not 500)
2. GET  https://<domain>/api/auth/me.php          (no session) → 401  (not 404, not 500)
3. POST https://<domain>/api/auth/login.php       (superadmin)  → 200 {"user": {...}, "csrfToken": "..."}
4. GET  https://<domain>/api/auth/csrf.php       (after login) → 200 {"csrfToken": "..."}
```

All four green → deployed. Log in via the UI. Any red → §3 below.

## 3. Troubleshooting the 500 on login

The client shows `Permintaan gagal (500)` (`src/lib/api.js:65`) when the 500 body is **not** the app's structured JSON — i.e., a PHP-level fatal error. If the UI instead shows `Konfigurasi server belum tersedia`, it's the app's fail-closed config path (row 2). Diagnose in this order:

### 3.1 Read the actual error first

Always fetch the raw error before changing anything (don't guess):

```bash
curl.exe -i -X POST https://<domain>/api/auth/login.php -H "Content-Type: application/json" -d "{\"username\":\"x\",\"password\":\"y\"}"
```

- **HTML/empty body, status 500** → PHP fatal → rows 1–3 below (PHP version, extension, missing file).
- **JSON `{"error": "Konfigurasi server belum tersedia"}`** → row 4 (no `.env`/config, production fail-closed, D6).
- **JSON `{"error": "Konfigurasi database tidak lengkap"}`** → `.env` missing keys or malformed lines (row 5).
- The response headers also tell you the PHP version: `X-Powered-By: PHP/x.y` — if < 8.1, row 1 is your cause.
- cPanel → Errors / error_log in the document root shows the exact fatal line.

### 3.2 The 500 root-cause table

| # | Cause | How to confirm | Fix |
|---|---|---|---|
| 1 | **PHP < 8.1** — `: never` syntax is a parse fatal on 7.x/8.0 | `curl -i` → `X-Powered-By: PHP/7.4…` or error_log shows `Parse error: syntax error, unexpected token "never"` | MultiPHP Manager → PHP 8.1+ (Step 6) |
| 2 | **Missing pdo_mysql / fileinfo / openssl / mbstring** | error_log: `Class 'PDO' not found` / `could not find driver` | Select a PHP Version → Extensions → enable |
| 3 | **Upload incomplete — a mirrored dir missing** (e.g. `lib/`, `auth/`, `bootstrap.php`) | error_log: `Failed opening required '../lib/backupRestore.php'` | re-upload the full bundle (Step 2); verify `api/`, `auth/`, `bin/`, `lib/` dirs exist |
| 4 | **No `.env` — production fail-closed** (D6) | curl → `Konfigurasi server belum tersedia`; every API call 500s | create `.env` per Step 3 (this is the config "unchanged at all" symptom the teammate saw — bundle defaults intentionally do not point at any real DB in production) |
| 4b | Stray `<docroot>/config.php` hand-created from an old template | exists in docroot next to `.env` | delete it — `.env` is the only sanctioned config (RH.A.2); a stale `<docroot>/config.php` masks the `.env` flow and violates D7 |
| 4c | `.env` values wrong: DB name/user unprefixed, password with `#` or leading/trailing spaces, quotes inside | `POST login` → 500 `Konfigurasi database tidak lengkap`, or PDO `Access denied for user` in error_log | fix values; note `parseEnvFile` strips quotes and ` #` comments — a password containing ` #` gets truncated; regenerate the DB password without spaces/hash if needed |
| 5 | **Schema not imported / wrong database** | phpMyAdmin: `users` table missing in `<db-name>`; login SQL throws → PDO fatal wrapped as 500 | import `schema.sql` (Step 4) |
| 6 | `.env` not readable (permissions) | error_log: `is_readable` false / file mode | File Manager → `.env` → permissions → 600 |
| 7 | `private/` missing → backup/photo dirs fail (not login) | first login OK, later 500s on photo/backup ops | create per Step 5 |
| 8 | Old cached service worker serving a previous bundle | browser DevTools → Application → SW: an old `sw.js` is active | DevTools → Application → Service Workers → Unregister + hard refresh; PWA autoUpdate refreshes within a tab |
| 9 | `.htaccess` mod_rewrite/headers module disabled on host | 500 on every request incl. static | comment out `Options`/header lines in `.htaccess` one at a time in a copy — if the host rejects a directive, ask the host; the file is generated, report it back so the generator can be adjusted |

> ⚠️ Config-file disambiguation (row 4b) — tracked `server/config.php` must never be deleted and must never be edited on the server (fresh-clone login depends on it — see `docs/CONFIG.md` §4); only a hand-dropped stray `<docroot>/config.php` next to `.env` on the server is deleted.
>
> **DONE note (LP.A.1, 2026-09-12):** every bare config.php reference in this guide is now qualified per D-LP5 — `` `server/config.php` `` (tracked source, never delete) vs stray `` `<docroot>/config.php` `` (forbidden, delete if present) — and this callout is the row-4b warning. The `.env`-only sanction (RH.A.2) is unchanged.
> Verified: node probe -> zero bare occurrences outside the two qualified forms, warning callout present, `git diff --stat` shows only this guide for LP.A.1.

> #### LP.C.2 manual carry-overs — cPanel-side checklist (owner: teammate with cPanel access)
>
> These rows are inherently manual (taste #19): no repo command can prove off-repo server state. Run them **after** all automated VERIFYs above pass (destructive/server cleanup last, taste #55), and paste the evidence into the release record.
>
> | # | Check (on the server) | Evidence slot |
> |---|---|---|
> | M1 | One-time bootstrap Cron removed: cPanel → Cron Jobs shows **no** `create-superadmin` entry (the Step-7 cron-once path was deleted after it fired) | Cron Jobs screenshot: ____ |
> | M2 | Document root holds **no** `deploy-upload.zip` and **no** `login.json` (repo ignores both since LP.C.1: root `.gitignore` lines 20-21; `git check-ignore -v` covers both names) | File Manager listing screenshot: ____ |
> | M3 | Document root holds **no** stray `<docroot>/config.php` next to `.env` (row 4b above; tracked `server/config.php` in the repo is a different file and is never touched) | File Manager listing screenshot: ____ |
>
> Unverified from the repo (by construction): M1-M3 above. Next: the teammate pastes the two screenshots into the release record and signs the date.

### 3.3 The exact scenario reported (2026-09-11): "code unchanged, default config, 500 on login"

Given "config is unchanged at all" — bundle deployed with **no `.env`** created. In production (`APP_ENV` unset → defaults to `production` in `serverConfig()`'s fallback logic — `session.php:15`), the app **refuses** the built-in defaults (they point at a local test DB; using them in production is exactly what D6 forbids) and returns `500 Konfigurasi server belum tersedia` on *every* API call including login. The UI's generic wrap (`api.js:65`) turns it into `Permintaan gagal (500)` when the body isn't JSON (or shows the Indonesian config message directly if it is).

**Fix:** Step 3 — create `.env` with the cPanel DB credentials (newly rotated), then Step 4 (schema into that DB if empty), Step 8 smoke checks. No code change is needed anywhere; that is by design.

## 4. Post-deploy checklist (link out)

| # | Check | Where |
|---|---|---|
| DB credentials working | `POST login` → 200 | §2 step 8 |
| Schema present | phpMyAdmin tables list | §2 step 4 |
| Superadmin exists | `users` table has exactly 1 superadmin row | §2 step 7 |
| `.env` blocked over HTTP | `GET /.env` → denied | §2 step 3 |
| HSTS present | `curl -I https://<domain>/api/users.php` → `Strict-Transport-Security` header (sent because `APP_SESSION_SECURE=true`) | RH.C.1 |
| Private dirs outside docroot | `/home/<user>/private/{uploads,backups,logs}` | §2 step 5 |
| Audit trail live | after first login: `audit_log` has `login_succeeded` | OPERATIONS §6 |
| PWA up to date | SW active version = current build | row 8 above |

## 5. Verification (this guide)

| # | Check | Pass condition |
|---|---|---|
| 1 | Commands real | every endpoint/path named exists in the repo (`bin/create-superadmin.php`, `.env.example`, `schema.sql`, `api/`, `lib/`) |
| 2 | Error strings match code | `Konfigurasi server belum tersedia` (session.php:26), `Konfigurasi database tidak lengkap` (bootstrap.php database()), `Permintaan gagal` (api.js:65) — all verified against source |
| 3 | PHP floor accurate | 11 `: never` signatures in server code → 8.1+ requirement |
| 8 | Decision set honored | D6 fail-closed production default, D-RH1 rotate-only, D-RH5 outside-docroot private/, R-RH1 no secrets in git |

## Cross-references

- `docs/OPERATIONS.md` — full runbook: backup/restore, credential rotation, disable users, incident, rollback, logs.
- `docs/DEPLOY_BUNDLE.md` — what's in the bundle and why `<docroot>/config.php`/`.env` never ship.
- `docs/CONFIG.md` — env-var contract, precedence, D6 fail-closed rationale.
- `docs/RELEASE_HYGIENE_PLAN.md` — D-RH1 (rotation), D-RH5 (photo storage), F-RH1 (credential incident).
- `server/auth/session.php` (serverConfig fallback), `server/bootstrap.php` (env loader, database()), `src/lib/api.js` (Permintaan gagal wrap).
