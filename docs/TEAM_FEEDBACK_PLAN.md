# Team Feedback Round — Thumbnails, Jadwal, Trainer Schedule, Payment Dialogs & Finance Guards Plan

**Status:** Agreed 2026-09-18 session (user confirmed all five Recommended picks via clarification round). This document is the durable record of that agreement and the build contract for the milestone chain in `docs/TEAM_FEEDBACK_MILESTONES.md`. If the two disagree, this file wins on *intent*; the milestones file wins on *execution order*.

**Authoritative foundation (read first, per taste):** `docs/UNIVERSAL.md` + `docs/IMPLEMENTATION_PLAN.md` (D1 cash basis, D3 ledger, D4 academic year, R1–R8) + `docs/SCOPE_EXPANSION_PLAN.md` (wins on scope-expansion intent) + `docs/SCOPE_EXPANSION_PRIVILEGES.md` (server-side privilege matrix). Nothing here broadens a role's authority as a shortcut (taste #33); all privilege behavior stays inside the matrix.

Cross-reference: `docs/TEAM_FEEDBACK_MILESTONES.md` owns the ordered MICROTASK chain that implements sections 5–9 below.

---

## 1. Scope and boundary

This plan covers exactly the five agreed items, in this build order (rationale in section 10):

1. **Honor delete dialog close bug + SPP orphan** — `PaymentTable` confirm stays open; `deleteSppPayment` unreachable.
2. **School card thumbnail uniformity** — fixed `h-44` crop-fill, centered, with upload guidance.
3. **Jadwal start + end** — `{dayOfWeek, time, endTime}` display-only; billing untouched.
4. **Trainer jadwal derived from Sekolah** — read-only join; manual free-text removed.
5. **Finance overpay guards** — floor `Belum Tertagih`/`Sisa` at 0, surface `Lebih Bayar` credit line.

Deliberately excluded (not open scope unless a linked microtask says so):

- Honor rate snapshotting per session (F7 — recorded for follow-up, would rewrite history semantics; cut per taste #8).
- Server-side `jadwalList.endTime` validation/columns (client mirrors first; any 422/column gap is documented for follow-up, not patched mid-chain per taste #13).
- New export hub, PDF server rendering, honor-per-branch matrix (stay deferred per `SCOPE_EXPANSION_PLAN.md` Part 4 item 7).
- F1–F24 (`AUDIT_MILESTONES.md`), AF1–AF16 (`AUDIT_FOLLOWUP_PLAN.md`), SB chain (`SPP_BILLING_*`). Where this plan restates one, it is only to record the current-source check.

---

## 2. Findings (stable IDs; verified against current source 2026-09-18)

| ID | Finding | Evidence |
|----|---------|----------|
| F1 | School card image container is fixed `h-44` with `object-cover`, so mixed-aspect uploads crop and read as "tidak fit". Trainer cards have no photo (initial avatar); siswa photos intentionally purged. | `src/features/schools/SchoolList.jsx:301`, `:804-810`; `src/features/trainers/TrainerList.jsx:301-303`; `src/lib/store.js:252-286` |
| F2 | Jadwal entry is a single `{dayOfWeek, time}` with one `<input type="time">`; formatter renders `Senin 14:00`; dashboard matches day only. No end-time anywhere. | `src/features/schools/SchoolList.jsx:474-515`; `src/lib/constants.js:43`; `src/lib/format.js:28-30`; `src/features/auth/TrainerDashboard.jsx:9-10` |
| F3 | Trainer form carries free-text `jadwal` duplicated against Sekolah `jadwalList`; `trainer.jadwal` is never read by finance, tunggakan, or dashboard. Two sources of truth for one schedule. | `src/features/trainers/TrainerList.jsx:443-444`; `src/features/schools/SchoolList.jsx:474+`; `src/lib/finance.js`; `src/lib/tunggakan.js`; `src/features/auth/TrainerDashboard.jsx:9-12` |
| F4 | Honor `Hapus entri pembayaran` confirm never closes on `Lanjutkan` (stays open over an already-applied write); `Batal` closes. `InvoiceModal` closes correctly — idiom broken only here. | `src/features/payments/PaymentTable.jsx:87-95`, `:234`; vs `src/features/reports/InvoiceModal.jsx:134`; `src/components/ConfirmDialog.jsx:31-37`; `src/components/AppModal.jsx:78-81` (`disableBackdropClose`) |
| F5 | `deleteSppPayment` helper exists but has zero call sites; no SPP-delete UI exists anywhere. Only `Hapus entri pembayaran` string in the app is the honor one (F4). | `src/lib/sppPayments.js:59-66`; `rg "Hapus entri pembayaran" src` → `PaymentTable.jsx:88` only |
| F6 | `Belum Tertagih = potensi − pemasukan` and `Sisa = beban − dibayar` can go negative on overpay; `pemasukan` sums raw nominal uncapped with no credit line. No error thrown. | `src/lib/finance.js:59-61`, `:119-120`, `:123` |
| F7 | `Beban Honor` multiplies live `trainer.honor` over all `Hadir` sessions, so a mid-period tarif change rewrites history; common payroll snapshots the rate per session. | `src/lib/finance.js:75-78`, `:94-97` |

---

## 3. Decisions (stable IDs; locked 2026-09-18)

| ID | Decision | Concrete pick |
|----|----------|---------------|
| D1 | Thumbnails stay crop-fill uniform. | Keep fixed `h-44` + `w-full h-full object-cover object-center` on the existing `bg-slate-200` container; add one-line upload hint `Disarankan foto landscape 16:9`. No `object-contain` letterbox, no card-size change. |
| D2 | Jadwal end-time is display + validation only. | Entry shape `{dayOfWeek, time, endTime}`; form shows a second `<input type="time">` beside the current one; default new entry `Senin 14:00–15:00` (start + 60 min); guard `end > start` with pinned copy `Jam selesai harus setelah jam mulai`; formatter renders `Senin 14:00–15:00`; billing still counts `Hadir` sessions only. |
| D3 | Trainer jadwal is fully derived, no manual field. | `Jadwal Mengajar` becomes read-only text = `formatJadwalList` joined over assigned `sekolah.jadwalList`; unassigned shows `Belum diatur`; the free-text `<input>` is removed from `TrainerForm`; `trainer.jadwal` stops being written on save (legacy values left untouched in stored records, never rendered). |
| D4 | SPP stays append-only; only the honor dialog is fixed. | No SPP delete UI (R-SB1 holds); G1 closes the honor dialog on confirm and deletes the orphan `deleteSppPayment` helper so the dead-code gate passes; SPP corrections remain new ledger rows. |
| D5 | Overpay floors at zero with a visible credit line. | Engine returns `belumTertagih = max(0, potensi − pemasukan)`, `sisaHonor/sisaKewajiban = max(0, beban − dibayar)`, plus `lebihBayarSpp` / `lebihBayarHonor` credit values; cash `labaRugi = pemasukan − dibayar` unchanged (D1); UI renders `Lebih Bayar` instead of negatives. |

---

## 4. Rules (stable IDs; bind every microtask)

| ID | Rule |
|----|------|
| R1 | **Ledger trust.** `potensi/pemasukan`, honor aggregates, `sppLunas` derive from stored ledgers inside `finance.js` / `sppPayments.js` only; UI renders. SPP stays append-only (R-SB1); honor delete is the single correction path for its ledger. |
| R2 | **Mirror existing idiom, do not invent** (taste #11). Dialogs reuse `ConfirmDialog`/`AlertDialog` with pinned Indonesian copy (`Batal / Lanjutkan / Hapus / Simpan`, `Jam selesai harus setelah jam mulai`, `Belum diatur`, `Lebih Bayar`); money inputs reuse `RupiahInput` (type `150000` → display `150.000`, store plain number); thumbnails keep the `h-44 object-cover` card idiom. |
| R3 | **Smallest slice, one concern per edit, verify immediately** (taste #3–#6). One MICROTASK = one behavior; run its VERIFY before the next begins; on a bug state the violated invariant as one hypothesis before editing. |
| R4 | **No new dependency.** CSS + existing `formatJadwalList`/`RupiahInput`/`ConfirmDialog` only (UNIVERSAL scope gate). |
| R5 | **No new PII.** No student/trainer photos added back; `siswa.foto` purge stays (taste #50). Override/uraian text stays operational only. |
| R6 | **Idempotent migration.** Legacy `jadwalList` entries without `endTime` read as `time + 60 min` on display and upgrade on first save; no bulk rewrite (taste #35). Legacy `trainer.jadwal` values are ignored by render, never backfilled. |
| R7 | **Privilege unchanged** (taste #33). No role gains write access; trainer form stays within `SCOPE_EXPANSION_PRIVILEGES.md` Trainer row (read own, write own sessions only). |

---

## 5. Dialog spec (D4; surfaces F4, F5)

- Honor delete keeps its current copy: title `Konfirmasi`, body `Hapus entri pembayaran ini? Sisa kewajiban akan dihitung ulang.`, buttons `Batal / Lanjutkan` (`PaymentTable.jsx:88,234`).
- Fix is one line of intent: `onConfirm` must run the stored action **and** close (`setConfirmOpen(false)` + clear), mirroring `InvoiceModal.jsx:134`.
- Violated invariant (taste #6, recorded before any edit): *confirm must close the dialog; it doesn't because the close call is missing on the confirm path.*
- SPP: no UI added. `deleteSppPayment` (`sppPayments.js:59-66`) is deleted; a `rg deleteSppPayment src` VERIFY proves zero references (dead-code gate, taste #15).

---

## 6. Thumbnail spec (D1; surfaces F1)

- Container unchanged: `h-44 relative bg-slate-200` (`SchoolList.jsx:301`).
- Image: `w-full h-full object-cover object-center` (adds `object-center`; the single class addition that stops off-center crops reading as "tidak fit").
- Fallback chain unchanged: `idbUrl || sch.foto || fallback`.
- One hint line under the Foto input in `SchoolForm`: `Disarankan foto landscape 16:9 agar terpotong rapi.`
- Trainer avatar (initial circle) and siswa no-photo state explicitly untouched (R5).

---

## 7. Jadwal spec (D2; surfaces F2)

```js
jadwalList: [{ dayOfWeek: 'Senin', time: '14:00', endTime: '15:00' }]
```

- `constants.js`: new-entry factory defaults to `{dayOfWeek:'Senin', time:'14:00', endTime:'15:00'}`.
- `format.js`: `formatJadwalList` renders `Senin 14:00–15:00`; legacy `{day,time}` without `endTime` renders `time + 60 min` (R6, no crash on old records).
- `SchoolForm`: second `<input type="time" aria-label="Jam selesai">` beside the existing start input (same row styling, taste #11); save blocked with `Jam selesai harus setelah jam mulai` when `endTime <= time`.
- Billing (`finance.js`, `billingForSekolah`) untouched — session count only.
- CSV keeps writing the formatted string (no column change).

---

## 8. Trainer schedule spec (D3; surfaces F3)

- `TrainerForm`: remove the `Jadwal` free-text `<input>` (`TrainerList.jsx:443-444`); show read-only `Jadwal Mengajar` = derived string for the currently checked `sekolahIds` (live preview as boxes tick), `Belum diatur` when none assigned.
- Card row `Jadwal Mengajar` (`TrainerList.jsx:335-336`) renders the same derived helper (one shared function, no second implementation).
- Save payload stops sending `jadwal` (both `users.create` trainerPayload and `trainer` direct paths); server needs no change because `jadwal` was never a validated column — any server gap is documented, not patched (taste #13).
- Multi-school trainers: entries joined with `, ` in `jadwalList` order (existing `formatJadwalList` order, no re-sort).

---

## 9. Finance guard spec (D5; surfaces F6; notes F7)

- Engine (`finance.js` only): `belumTertagih = max(0, potensiSpp − pemasukanSpp)`; per-trainer `sisaHonor = max(0, beban − dibayar)`; `sisaKewajiban = Σ sisaHonor`; new `lebihBayarSpp = max(0, pemasukan − potensi)`, `lebihBayarHonor = max(0, dibayar − beban)`; `labaRugi` formula unchanged.
- `FinanceReport.jsx` only: `Lebih Bayar` line rendered where the floored values appear (tunggal hero + comparison rows); never shows a negative Rupiah for these three cells.
- F7 (rate snapshot) is **not** built here — recorded as follow-up (section 11). This round must not change `bebanHonor` math beyond the floor.

---

## 10. Sequencing (why dialog → thumbnail → jadwal → trainer → finance)

`G1` dialog/orphan is the lone functional bug (severity first, taste #45) and touches nothing else — lands first. `G2` thumbnail is isolated CSS — second. `G3` jadwal schema must exist before `G4` trainer derivation can read `endTime` — strict dependency. `G5` finance guards sit on `finance.js`, the single money engine (R1) — last so no earlier gate perturbs its VERIFY numbers. Gates: no later gate starts until the earlier gate's exit VERIFY passes.

---

## 11. Triage vs planning docs (taste #30, #31, #68)

| ID | Already planned? | Where | Disposition here |
|----|------------------|-------|------------------|
| F1 (thumbnail crop) | Not documented (no doc pins card image shape) | — | Built as G2 (D1) |
| F2 (single-time jadwal) | Confirmed shape `{dayOfWeek,time}` | `SCOPE_EXPANSION_MILESTONES.md` A2.5-JADWAL-1 | Extended as G3 (D2); end-time is new, needs this plan |
| F3 (trainer free-text jadwal) | Schema lists both fields, derivation implied only | `IMPLEMENTATION_PLAN.md:32-33` | Built as G4 (D3) |
| F4 (honor dialog never closes) | Confirm idiom specified | `CLIENT_ROUND_PLAN.md:62` R2 + `InvoiceModal.jsx:134` | Built as G1 (D4) |
| F5 (SPP orphan, no delete UI) | Append-only specified | `SPP_BILLING_PLAN.md:71` R-SB1 | Kept append-only; orphan deleted in G1 (D4) |
| F6 (negative memo math) | Cash basis + memo specified, floor not specified | `IMPLEMENTATION_PLAN.md:15` D1 | Built as G5 (D5) |
| F7 (live-rate beban) | Not specified as snapshot | — | Deferred follow-up, not built (cut per taste #8) |

---

## 12. Exit gates (whole round)

- E1: Honor delete `Lanjutkan` applies the write **and** closes; `Batal` closes with no write; `rg deleteSppPayment src` is empty.
- E2: School cards keep uniform `h-44` rhythm across mixed-aspect uploads; hint line present.
- E3: A school with `Senin 14:00–15:00` saves, refreshes, re-hydrates, and trainer Rekap shows the same range; `end <= start` blocked with the pinned copy.
- E4: Trainer with assigned schools shows the joined school schedule with no editable jadwal input; unassigned shows `Belum diatur`.
- E5: Overpaid periode shows `Rp 0` + `Lebih Bayar` credit, never a negative; `npm test` green on touched libs, clean production build, no `console.log` in `src/`, `git status` shows only intended files.

---

**End of Team Feedback Plan**
