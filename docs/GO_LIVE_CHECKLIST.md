# Go-Live Checklist — announcement + standby rota (Excel rows #37/#38)

**Goal:** one page the team executes on release day. Templates are fill-in-the-blank; the release record holds the filled copy.
**Falsifiable check:** every box below is ticked with a name + timestamp before traffic is announced.

## Pre-go-live gates (all must be green, in order)

- [ ] `npm run build` green on the release commit.
- [ ] Smoke test per `OPERATIONS.md` §1.6 + `PRODUCTION_MILESTONES.md` M6.3.
- [ ] Rollback kit retained: previous `deploy/` artifact zipped + last verified backup off-host (`OPERATIONS.md` §5, D8.1 rule — no deployment without a backup).
- [ ] `.env` production values confirmed (`APP_ENV=production`, `APP_SESSION_SECURE=true`); `private/` outside docroot.
- [ ] First superadmin reachable; `mustChangePassword` cleared for operators.

## Announcement template (fill + send to all users/stakeholders)

```text
Subjek: [Go-Live] AdminDashboard v<N> — <tanggal> <jam> WIB

Kepada seluruh pengguna,
Mulai <jam> WIB hari ini sistem AdminDashboard (<domain>) resmi digunakan.
- Login dengan akun masing-masing; hubungi <nama standby> (<kontak>) bila terkendala.
- Panduan singkat: <tautan/manual>.
- Gangguan hari pertama ditangani tim standby hingga <jam> WIB (lihat rota di bawah).

— <nama rilis>, <tanggal>
```

Recipients list (fill): `<cabang / peran / kontak>`.

## Standby rota (go-live week)

| Day | Primary (name + contact) | Backup | Hours (WIB) |
|-----|--------------------------|--------|-------------|
| H (go-live) | | | 08:00–20:00 |
| H+1 | | | 08:00–17:00 |
| H+2 | | | 08:00–17:00 |

Standby duties: watch error log (`OPERATIONS.md` §6), triage incident reports (§4), own rollback decision if smoke checks fail post-release (§5). Every action audited; close the rota with a one-paragraph outcome note in the release record.

## Post-go-live watch (first 7 days)

- Daily error-log glance (moves to `OPERATIONS.md` §7 cadence after week 1).
- Backup freshness confirmed at day 7 (`backup-list.php`).
- Collect user feedback into `TEAM_FEEDBACK_PLAN.md` / `EVALUATION_LOG.md` channel (row #40).
