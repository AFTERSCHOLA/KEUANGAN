# Server Config (`server/config.php`)

**Status:** Implemented — env-driven, tracked, safe to commit.

**Purpose:** One tracked `config.php` works on every machine (local dev, CI, cPanel) with zero per-device edits. The historical cause of the misleading 500 "Konfigurasi server belum tersedia" on a fresh clone was that `server/config.php` was a per-device, hand-edited file — gone now.

> **Important:** the *file* is shared, the *database* is not. Each teammate's `127.0.0.1` points at their own local MySQL. The default DSN (`afterschola_t3_test`) is a **per-machine** test database — `npm run db:reset` provisions it locally on whoever's running it. Two teammates running `npm run setup` end up with two physically separate databases that happen to share a name and a schema, not a shared database. If you need a shared dev DB, override `APP_DSN` to point at it.

---

## 1. Decision Set

| # | Decision | Status |
|---|---|---|
| D1 | `server/config.php` is **env-driven** with safe defaults, and is **tracked in git** | Locked |
| D2 | Precedence: `getenv()` value → built-in default. Env wins, so a CI/cPanel host can override anything without touching the file | Locked |
| D3 | Default environment is `development` so a fresh clone on the canonical XAMPP setup (root user, no password, test DB `afterschola_t3_test`) just works | Locked |
| D4 | The tracked file contains **no real credentials** — the default `root` / empty password is the documented XAMPP convention, not a production secret. Production overrides via `APP_DSN` / `APP_DB_USER` / `APP_DB_PASS` env vars | Locked |
| D5 | If `server/config.php` is somehow missing on disk, `serverConfig()` falls back to `server/config.example.php` for CLI + non-production, and still returns a structured array | Locked |
| D6 | Production safety net: if `config.php` is missing AND `APP_ENV=production`, the server still returns the original 500 "Konfigurasi server belum tersedia" — fallback only happens off-production | Locked |
| D7 | No credentials are ever written to a tracked file. The defaults are public XAMPP conventions; the env-var contract is the only sanctioned way to point at a real production database | Locked |

---

## 2. The env-var contract

| Env var | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | Switches `session_secure` and a few feature gates |
| `APP_DSN` | `mysql:host=127.0.0.1;dbname=afterschola_t3_test;charset=utf8mb4` | Full PDO DSN; `charset=utf8mb4` is appended if absent |
| `APP_DB_USER` | `root` | DB user |
| `APP_DB_PASS` | _(empty)_ | DB password |
| `APP_SESSION` | `afterschola_session` | Session cookie name |
| `APP_SESSION_SECURE` | `false` | Set to `true` on HTTPS-only hosts |

Anything unset → default. Anything set → that value. No `?` precedence surprises.

---

## 3. Usage

### Local dev (fresh clone, XAMPP defaults)

```text
npm install
npm run dev                       # Vite on :5173
scripts\start-php-server.bat      # PHP built-in on :8000
```

`server/config.php` already exists in the clone (it is tracked) and points at the canonical XAMPP test DB. **No file edits required.**

### Local dev (non-XAMPP, e.g. Docker / MAMP / native MySQL)

```text
# PowerShell
$env:APP_DSN     = 'mysql:host=127.0.0.1;port=3307;dbname=afterschola;charset=utf8mb4'
$env:APP_DB_USER = 'dev'
$env:APP_DB_PASS = 'dev'
```

Same `server/config.php`, no file edit. Re-run `scripts\start-php-server.bat`.

### Production (cPanel / CI)

```text
APP_ENV=production
APP_DSN=mysql:host=127.0.0.1;dbname=afterschola_prod;charset=utf8mb4
APP_DB_USER=<cpanel_db_user>
APP_DB_PASS=<cpanel_db_password>
APP_SESSION_SECURE=true
```

Set these in the host's environment manager (cPanel "MultiPHP INI Editor" / "Environment Variables", GitHub Actions `env:`, etc.). **Do not write them into a tracked file** — per taste #41, no credentials land in git.

---

## 4. Why this fixes the original symptom

Pre-change flow on a teammate's fresh clone:

1. `git clone` → `server/config.php` absent (was untracked / hand-edited).
2. `scripts\start-php-server.bat` → PHP starts fine.
3. `POST /api/auth/login` → `serverConfig()` → `is_file('config.php')` returns `false` → `jsonResponse(['error' => 'Konfigurasi server belum tersedia'], 500)`.

The teammate sees a 500 with a message that points at the server config, not at the actual missing setup step. Worse, if they were going through the Vite proxy, the empty body from the proxy turned that 500 into "something is broken, no idea what."

Post-change flow:

1. `git clone` → `server/config.php` already present (env-driven, tracked).
2. `scripts\start-php-server.bat` → PHP starts.
3. `POST /api/auth/login` → returns 200 with `role: superadmin` using the seeded `superadmin@test.local` / `SuperTest123!X` (per `docs/LOCAL_SETUP.md` D3).
4. If the teammate's MySQL is at a different host/port/user, they set `APP_DSN` / `APP_DB_USER` / `APP_DB_PASS` env vars — same file, no edit.

---

## 5. Verification

| # | Check | Pass condition |
|---|---|---|
| 1 | File is valid PHP | `php -l server/config.php` → "No syntax errors detected" |
| 2 | Returns valid array with no env set | `php -r "print_r(require 'server/config.php');"` → 6 keys, defaults match table in §2 |
| 3 | Env vars override | With `$env:APP_DSN='mysql:host=remote;dbname=prod;charset=utf8mb4'`, `serverConfig()` returns the overridden DSN |
| 4 | Fresh-clone fallback | With `server/config.php` deleted, `php -r "require 'server/auth/session.php'; var_export(serverConfig());"` returns the `config.example.php` array (in non-production) |
| 5 | Production safety net still fires | With `server/config.php` deleted and `APP_ENV=production`, the 500 "Konfigurasi server belum tersedia" still returns |
| 6 | End-to-end login works | `POST http://localhost:8000/api/auth/login.php` with `superadmin@test.local` / `SuperTest123!X` returns 200 and `user.role === 'superadmin'` |
| 7 | No new tracked credentials | `git diff server/config.php` shows only env-var plumbing; no plaintext passwords were introduced |

---

## 6. Why a single file, not a checklist

Taste #36 — soft-login local should be paired with a production-ready path. The same env-var contract is the seam that makes both work without forking the codebase. The "fresh clone works" guarantee is now a property of the tracked file, not a checklist item teammates have to discover by trial-and-error.

`docs/LOCAL_SETUP.md` already documents the test-DB / superadmin bootstrap; this file documents the **server config** half of the same one-command setup. The two together are the complete "go from `git clone` to a logged-in browser" contract.
