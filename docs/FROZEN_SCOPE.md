# Frozen Scope — Jadwal / Kalender / Notif / Bell

Goal: Jadwal/Kalender/Notif/Bell are sufficient as-is per 2026-10-05 approval; polish is frozen.

This registry consumes `docs/UNIVERSAL.md` Scope and Roadmap Gate and adds nothing normative beyond it. It acts as the scope guard for all future work touching these areas.

| Area | Status | Since | Change gate |
| --- | --- | --- | --- |
| Jadwal Harian/Mingguan + CSV export | Frozen | 2026-10-05 | Change gate below |
| Kalender view + navbar shortcut | Frozen | 2026-10-05 | Change gate below |
| Notif bell (Notification Bell) H-1/H-day + deep-links | Frozen | 2026-10-05 | Change gate below |
| Reminders derivation | Frozen | 2026-10-05 | Change gate below |

## Change gate

A Frozen area changes only with a plausible/sufficient reason plus a plan-doc update before code:

1. Reason (one of): client request, or falsifiable bug with VERIFY (failing check + observed output).
2. Plan-doc update first: record the reason in the active plan doc before touching code.
3. Otherwise: no change; keep polish frozen.

## Non-goals

- No UI removal.
- No behavior change.
