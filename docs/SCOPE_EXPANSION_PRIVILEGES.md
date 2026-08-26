# Afterschola — Role Privilege Matrix

**Companion to `SCOPE_EXPANSION_PLAN.md` — Part 6.**  
This document is the executable permission spec for the multi-branch cPanel phase. Each row maps to a server-side validation rule.

---

## Design Principle

> **A role may only write what it is answerable for.**
>
> - The **branch** is answerable for *operations* (who attended, who's enrolled, when money physically arrived).
> - The **head office (pusat)** is answerable for *money* (what was billed, what was paid out, whether anyone profited).
>
> Write flows **downhill only**: pusat defines the structure (sekolah, trainer roster, tarif), cabang fills in events (absensi, enrollment) inside that structure. Nobody edits sideways into another branch.

---

## Role Hierarchy

```
Superadmin (Pusat)
  └── Admin Cabang (per-branch)
        └── Trainer (sub-branch, own sessions only)
```

| Role | Scope | Data Access |
|------|-------|-------------|
| **Superadmin** | All branches | Full read/write everywhere; cross-branch aggregation |
| **Admin Cabang** | Single assigned branch | Full read/write own branch; read-only nothing else |
| **Trainer** | Own sessions + own students | Write own attendance; read-only everything else |

---

## Privilege Matrix

### Legend
- ✅ **Full access** — create, read, update, delete
- 🟡 **Constrained** — conditional or derived access
- 🔍 **Read-only** — view only, no modifications
- ❌ **No access** — hidden or blocked

---

### STRUCTURE & CONFIGURATION

| Scope | Superadmin | Admin Cabang | Trainer | Server Rule |
|-------|------------|--------------|---------|-------------|
| **Cabang management** (create, edit, disable) | ✅ | ❌ | ❌ | `role !== 'superadmin' → reject` |
| **Global settings** (logo, title, branch list) | ✅ | ❌ | ❌ | `role !== 'superadmin' → reject` |
| **Honor tarif & contract terms** (`trainer.honor`, `sekolah.spp`, `sppOverride`) | ✅ | ❌ | ❌ | `cabangId !== token.cabangId → reject` (superadmin bypass) |

### OPERATIONAL DATA

| Scope | Superadmin | Admin Cabang | Trainer | Server Rule |
|-------|------------|--------------|---------|-------------|
| **Data Sekolah** | ✅ Write pusat only; 🔍 Read all | 🔍 Read own | 🔍 Read assigned | Write requires `cabangId = 'pusat'`; read filtered by token.cabangId |
| **Data Trainer** | ✅ Full everywhere | 🟡 Propose only | 🔍 Read own | Write requires pusat role; read filtered by assignment |
| **Data Siswa** | ✅ Full (audit trail) | ✅ Full own branch | 🔍 Read-only view | Write filtered by `cabangId`; trainer gets view-only component |
| **Absensi entry** | 🔍 Read + ✅ Verify | ✅ Write own branch | ✅ Write own sessions | Write requires matching `trainerId = token.trainerId` OR cabang role; verify requires elevated role |
| **Absensi verification** | ✅ Verify all (exception queue: flags + random sample) | ✅ Verify own (before pusat lock; same exception queue, branch-scoped) | ✅ Self-certify own weekly records (`konfirmasiTrainer` stamp) | Verify flag writable only by `role IN ('superadmin', 'admin')` or higher; certification stamp writable only by `trainerId = token.trainerId` |

### FINANCIAL DATA

| Scope | Superadmin | Admin Cabang | Trainer | Server Rule |
|-------|------------|--------------|---------|-------------|
| **Payment collection** (`sppPayments`) | ✅ Full all | ✅ Record own; ✅ flag `sudahDisetor` | ❌ | Create filtered by `cabangId`; `diterimaOleh` required |
| **Honor payments** (`honorPayments`) | ✅ Full — only role that pays | 🔍 Read own trainers | ❌ | `role !== 'superadmin' → reject` on all write operations |
| **Laporan Keuangan** (Laba/Rugi) | ✅ Everything | 🟡 Own branch redacted | ❌ | Admin sees Pemasukan/Beban/Sisa; superadmin-only sees cross-branch Laba/Rugi |
| **Tunggakan & WA reminders** | ✅ All | ✅ Own branch; template from pusat | ❌ | WA template content writable only by pusat |
| **Invoicing & slips** | ✅ Generate all | 🔍 View/print own branch | ❌ | Generate requires matching `cabangId` or superadmin |
| **Slip Honor** | ✅ Generate all | 🔍 View own branch | ❌ | Same as invoice |

### SAFETY & RECOVERY

| Scope | Superadmin | Admin Cabang | Trainer | Server Rule |
|-------|------------|--------------|---------|-------------|
| **Backup** | ✅ Any branch / all | ✅ Own branch only | ❌ | Export filtered by token.cabangId unless superadmin |
| **Restore** | ✅ All (with confirm) | ❌ Never | ❌ Never | `role !== 'superadmin' → reject` |
| **Audit log** | ✅ Full | 🔍 Own branch | ❌ | Read filtered by `cabangId` |

---

## Server-Side Validation Pseudocode

Every API endpoint implements this pattern:

```php
function authorize($action, $resource, $data = null) {
    global $token; // from .htaccess session or JWT

    // Superadmin bypasses branch scoping
    if ($token->role === 'superadmin') {
        return true;
    }

    // Destructive/payout actions require superadmin
    if (in_array($action, ['restore', 'delete_payment', 'settle_honor', 'edit_tarif'])) {
        return $token->role === 'superadmin';
    }

    // Branch scoping for Admin Cabang
    if ($token->role === 'admin_cabang') {
        $targetCabang = $data['cabangId'] ?? $resource['cabangId'] ?? null;
        return $targetCabang === $token->cabangId;
    }

    // Trainer only writes own attendance
    if ($token->role === 'trainer' && $action === 'write_absensi') {
        return $data['trainerId'] === $token->trainerId;
    }

    return false;
}
```

---

## UI vs. Server Enforcement

| Layer | Purpose | Example |
|-------|---------|---------|
| **UI (React)** | Convenience — hide buttons, disable forms, filter lists | Trainer doesn't see "Lunaskan" button |
| **Server (PHP)** | Enforcement — reject unauthorized writes with 403 | Trainer's POST to `/api/honorPayments.php` returns 403 even if they craft it manually |

> **Critical:** The UI is a *mirror* of the matrix, not the guard. All rules must be enforceable server-side even if the React app is bypassed.

---

## Escalation Paths

| Scenario | Path |
|----------|------|
| Admin Cabang needs to correct a verified absensi | Request pusat un-verify → correct → re-verify |
| Trainer disputes honor calculation | Submit correction request → Admin Cabang reviews → pusat approves adjustment |
| Admin Cabang wants to change school SPP rate | Propose to pusat → pusat updates `sekolah.spp` → branch sees change |
| Missing payment record | Admin Cabang re-enters with note "koreksi: [reason]" → timestamped |

---

## Implementation Checklist

- [ ] Add `role` and `cabangId` to JWT/session payload
- [ ] Add `cabangId` column to all tables (`sekolah`, `siswa`, `trainer`, `absensi`, `honorPayments`, `sppPayments`)
- [ ] Create middleware function `checkScope($resource, $action)`
- [ ] Implement `authorize()` per endpoint
- [ ] Add UI role filter to `store.js` (`read()` filters by context)
- [ ] Test cross-branch write attempt → expect 403
- [ ] Test trainer write to another trainer's absensi → expect 403
- [ ] Test restore as Admin Cabang → expect 403

---

**End of Privilege Matrix**
