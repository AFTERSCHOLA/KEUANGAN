# Local Setup (`npm run setup`)

**Status:** Implemented — see `scripts/setup-local.mjs`. Run once on a fresh clone (or any time you want to restore the test database + superadmin from scratch).

**Purpose:** Single, cross-machine command that takes a fresh checkout from "Node + npm installed" to "dependencies installed, test database provisioned, superadmin account ready to log in."

---

## 1. Decision Set

| # | Decision | Status |
|---|---|---|
| D1 | One command (`npm run setup`) does install + DB reset + superadmin bootstrap, in that order | Locked |
| D2 | Target DB is the test database already named in `server/config.php` (`afterschola_t3_test`); the script refuses to touch a non-test DB | Locked |
| D3 | Superadmin credential of record is the seeded test user (`superadmin@test.local` / `SuperTest123!X`) restored by `npm run db:reset` | Locked |
| D4 | Only if no superadmin exists at all does the script call `server/bin/create-superadmin.php` with an auto-generated password | Locked |
| D5 | Pure Node script (`.mjs`) — no `.ps1`/`.bat` lock-in. The existing `scripts/start-php-server.bat` is a convenience for humans, not a prerequisite | Locked |
| D6 | PHP / MySQL binaries are found by an explicit fallback chain (XAMPP default path → `C:\xampp` → PATH) so the script works on this dev box and on a clean machine | Locked |
| D7 | MySQL auto-start is best-effort: probes first, tries the XAMPP start scripts if reachable, otherwise fails with a clear message. Never silently lies about a green check | Locked |
| D8 | Script never fabricates a "superadmin created" claim — it reads the DB back and either reports the seeded credential or runs the authoritative bootstrap | Locked |

---

## 2. Usage

```text
npm run setup
```

Expected output (last block):

```text
========== setup OK ==========
Project root:    D:\Games and Apps\Coding\AdminDashboard
PHP binary:      D:\Games and Apps\xampp\php\php.exe
MySQL client:    D:\Games and Apps\xampp\mysql\bin\mysql.exe
Test database:   afterschola_t3_test  (from server/config.php)
Superadmin user: superadmin@test.local
Superadmin pass: SuperTest123!X
Next steps:
  1. Start the API + UI:
       npm run dev                       (Vite, port 5173)
       scripts\start-php-server.bat      (PHP built-in, port 8000)
  2. Visit http://localhost:5173 and log in with the superadmin above.
  3. To re-run from a clean slate: `npm run db:reset`.
================================
```

---

## 3. What the script does (in order)

1. **Probe Node + npm.** Requires Node ≥ 18 (matches the `vite ^6.2.0` baseline in `package.json`). npm is invoked as `npm` from PATH; the script does not assume a specific install location.
2. **Probe PHP.** Looks in this order: `$PHP_BIN` env var → `D:\Games and Apps\xampp\php\php.exe` → `D:\xampp\php\php.exe` → `C:\xampp\php\php.exe` → `php` on PATH. Then verifies `pdo_mysql`, `mbstring`, and `json` extensions are loaded — these are the PHP modules `server/bootstrap.php` and `server/bin/create-superadmin.php` need.
3. **Probe MySQL client.** Same XAMPP-then-PATH fallback chain. The client is required even if the server is already running, because `npm run db:reset` shells out to `mysql.exe`.
4. **Probe MySQL server.** Tries `mysql -h 127.0.0.1 -u root -e 'SELECT 1'`. If it fails, looks for `xampp_start.exe` / `mysql_start.bat` in the XAMPP install dir and runs one, then re-probes. If neither is available, **fails with an explicit message** (no silent skip).
5. **`npm ci` (or `npm install` if `package-lock.json` is missing).** Exits non-zero on failure — the rest of the script requires `node_modules`.
6. **Read `server/config.php`.** Extracts `dsn` / `username` / `password` and the database name. If the DB name does not contain the substring `test`, the script **refuses to continue** — a one-line safeguard against accidentally dropping a real database.
7. **`npm run db:reset`.** Drops + recreates the test database from `server/schema.sql` and re-seeds the four canonical test users, including the superadmin `superadmin@test.local` with password `SuperTest123!X`. This step is the source of truth for the superadmin (per D3).
8. **Verify the seeded superadmin.** Connects to the DB via PDO and confirms the row exists, the role is `superadmin`, and `password_verify('SuperTest123!X', $hash)` succeeds. If the row is missing OR the hash does not match, the script fails with an explicit message rather than silently re-bootstrapping.
9. **Fallback bootstrap (only if no superadmin exists).** Calls `server/bin/create-superadmin.php --username=... --display-name=... --password=...` with an auto-generated 16-character password. This path is hit only when `npm run db:reset` was skipped or the seed step was customized.
10. **Print the final report block** with the superadmin credentials and next steps.

---

## 4. Cross-platform notes

- **Windows (primary dev platform per `package.json` + the `xampp_start.exe` precedent).** The script handles path separators and `.exe` extensions. The XAMPP default path `D:\Games and Apps\xampp` matches this box; the additional candidates `D:\xampp` and `C:\xampp` cover a fresh install at the conventional location.
- **macOS / Linux.** XAMPP candidates become `/opt/lampp` and `/Applications/XAMPP`; PATH-resolved `php` / `mysql` / `mysqld` cover the more common `apt install php mariadb-client` setup. MySQL auto-start is best-effort and may not apply on Linux (where the user is more likely to run `sudo systemctl start mysql` themselves); the failure message is explicit about this.
- **CI / non-interactive shells.** `server/bin/create-superadmin.php` uses `stty -echo` for the interactive password prompt, which is not portable. The fallback path always passes `--password=...` explicitly to avoid that prompt.

---

## 5. Why a single command, not a checklist

Taste #14 / #18 (run the verification check immediately, do not stack unverified changes) and taste #44 (map the codebase before touching it — the canonical way to "run this locally" is to follow the same path the tests and the developer both use). The test fixtures already establish `afterschola_t3_test` + 4 seeded users as the local "known-good" state (`server/tests/db-reset.php:24-26`), so the setup script is just an automation of that contract for human use.

A manual checklist ("install XAMPP → start MySQL → run db:reset → run create-superadmin → log in") is kept in commit messages and in `docs/DEPLOY_BUNDLE.md` §4 for the cPanel operator; for a fresh local clone, `npm run setup` is the single source of truth.

---

## 6. Verification

| # | Check | Pass condition |
|---|---|---|
| 1 | Script exits 0 | `npm run setup` final line is `================================` (closing the `setup OK` block) and `$?` is `0` |
| 2 | Dependencies installed | `node_modules/` exists with `vite` and `@playwright/test` resolved |
| 3 | Test DB provisioned | `npm run db:reset` prints `db:reset OK in <s>s` and reports 4 `*.test.local` users + 1 `cbg-test-pusat` branch |
| 4 | Superadmin account works | `POST /api/auth/login` with `superadmin@test.local` / `SuperTest123!X` returns 200 and a `user.role === 'superadmin'` body (requires `scripts\start-php-server.bat` running first) |
| 5 | Re-run is idempotent | Running `npm run setup` a second time still exits 0 and reports the same superadmin credentials (no "superadmin already exists" error) |
| 6 | Refuses non-test DB | Temporarily editing `server/config.php` to point at a DB whose name does not contain `test` causes the script to exit 1 with a `Refusing to reset DB` message |
| 7 | MySQL-not-running path | With MySQL stopped, the script auto-starts XAMPP's MySQL and continues, or fails with an actionable message about `net start mysql` / XAMPP control panel |

---

## 7. Open / Parked Questions

- **Should the script also run `npm run build` to verify a production build?** — Out of scope for "local setup." The existing `npm run hygiene:verify` already covers that path and runs on demand.
- **Should it write the superadmin password to a file (e.g. `.env.local`)?** — Rejected. Per taste #41 ("preserve the no-credentials-in-git rule"), passwords never land in tracked files. The terminal report is the only artifact.
- **Should it install Playwright browsers?** — Out of scope. The `hygiene:verify` script runs the full suite; `npm run setup` stops at "you can log in."
