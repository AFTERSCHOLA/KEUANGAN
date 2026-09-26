# Eval Finance Plan — Honor Payable vs Payment + Generator Upgrade + Dashboard-Last Switch

**Status:** DRAFT 2026-09-26 — Gates EF.A–EF.D open (no Verified lines yet; see `docs/EVAL_FINANCE_MILESTONES.md`).
**Position:** Temporary scope-expansion chain per taste #40. It does **not** replace `IMPLEMENTATION_PLAN.md`, `SCOPE_EXPANSION_PLAN.md`, `SCOPE_EXPANSION_PRIVILEGES.md`, `SPP_BILLING_PLAN.md` / `SPP_BILLING_MILESTONES.md` (SB-C closed 2026-09-17), `COVER_SLOT_PLAN.md` / `COVER_SLOT_MILESTONES.md` (DRAFT, gates open), `TRAINER_ATTENDANCE_PLAN.md`, `PENUGASAN_SLOT_PLAN.md`, or `AUTO_PENUGASAN_PLAN.md`. It explicitly **does not re-plan** anything COVER_SLOT owns (slot-pick, cover link, per-session role, externals, role-first honor math) — those are deferred with owners (§10), never duplicated here (taste #53). It **does** take ownership of one unowned item via re-plan, not silent patch: the per-meeting invoice-generator upgrade (SB built the standalone calculator + consolidated the path, but the generator still bills flat — see F-EF4). When Gate EF.D closes, §11 records completion back on the source docs.
**Contract order:** `docs/UNIVERSAL.md` (primary contract, read first) → `docs/IMPLEMENTATION_PLAN.md` Part 2 → `docs/SCOPE_EXPANSION_PLAN.md` + `docs/SCOPE_EXPANSION_PRIVILEGES.md` (scope-expansion first-reads) → `docs/SPP_BILLING_PLAN.md` §4 (D-SB8/D-SB9/D-SB10/D-SB11/D-SB13, R-SB1/R-SB2/R-SB3/R-SB6) + `SPP_BILLING_MILESTONES.md` (SB-C closed) → `docs/COVER_SLOT_PLAN.md` §4 (D-CS3/D-CS5/D-CS6/D-CS7) + `COVER_SLOT_MILESTONES.md` (entry assumption) → `docs/EXEMPLAR_MIGRATION.md` (G5, D2, D8, F15) → `docs/EVALUATION_LOG.md` (Q1–Q8 finals + finance concept Stages 1–7) → this file.
**Locked inputs (not re-decided here):** Q1(a) bill school + pay substitute (`EVALUATION_LOG.md` Final Policy Confirmation); Q2 dashboard follows the invoice pipeline, canonical = `server/lib/invoiceGenerator.php` (D-SB10); Q3 Frozen roster = SMPN 18 only; Q4 semester schools bill actuals (rate × sessions held, holiday = not billed); Q5 trainer-basis schools stay rate × trainer sessions; Q6 SMP Sains follows the SD roster (single record, two slots) until SMP pupils are registered separately; Q7 status determines honor, remarks are free text and never parsed; Q8 installments/carry-over/honor-payouts accepted Unverified (no exemplar coverage); D2 tiers Inti Senior 100k / Inti Newbie 75k / Asisten 50k whoever fills the slot; D1 cash basis (labaRugi = pemasukan − honor dibayar; beban/sisa are memo only).

---

## 1. Context and inputs

- Exemplar ground truth (G5): flat Potensi 53,535,011 (`siswaBilling.length × sch.spp`, `src/lib/finance.js:89-94`) vs per-meeting tariff-only ≈73.45M (`billingForSekolah`, `finance.js:201-223`). App honor 6,125,000 vs expected 6,975,000 (delta −850k = F9 650k + F13 200k). Both paths recompute HIT independently (Addendum I1) — the defect is architectural (two answers), not arithmetic.
- The canonical generator still bills flat: `server/lib/invoiceGenerator.php:106-135` groups active pupils by `spp`/`sppOverride` and never reads `metodePembayaran`, `pertemuanAktual`, or `billingForSekolah` (`Verified: grep server/ for tarifPerPertemuan -> 0 hits`). SB.A.2 built the per-meeting calculator standalone, SB.C.2 consolidated the creation path (D-SB10), but no microtask ever wired per-meeting semantics into the generator. COVER_SLOT F-CS6/D-CS7 guards the order (dashboard-last) and defers the build to SPP_BILLING — whose SB-C is closed. The upgrade is therefore unowned; this chain owns it explicitly (§4 D-EF5).
- Honor today is single-stage: `pengajarHonorStats` counts Hadir rows × per-person `trainer.honor` (`finance.js:55-69,111-114`); `honorPayments` is an append-only ledger (`server/schema.sql:96-107`, `validateHonorPayment` in `server/validation/entities.php:387-394`); settlement helpers (`sisaHonor` floored, `lebihBayarHonor` credit, `labaRugi = pemasukanSpp − totalHonorDibayar`) live in `financialData()` (`finance.js:130-165`). There is no Payable-vs-Payment split: nothing records "earned in full at attendance time, paid later in installments, deferral never reduces what is owed."
- Small locked confirmations need code-proof, not discussion: Q7 (remarks never parsed — current trainer-attendance inputs are already text: `TrainerAttendanceAdmin.jsx:235-236`, `TrainerAttendanceForm.jsx:157`); F15 fractional `spp` legacy (141666.67 → Potensi fractions 2,450,007 / 1,700,004); Q3–Q6 category roster (D8 map: 20 schools, SMPN 18 `metode=null`, Sains SD+SMP one record two slots).
- Existing idioms to reuse, not invent: derived-not-stored settlement (`invoiceSettlement` in `src/lib/invoices.js:221-235`, status Lunas iff sisa ≤ 0); append-only corrections via `correctionOf` + latest-wins (`trainerAttendance.js:14-19`); frozen-at-Terbit + carry-over lines (`invoices.js:237-250`, D-SB11); invoice-level `sppPayments` with R-SB6 same-school check (`entities.php:396-429`); Indonesian pinned copy (§7).

## 2. Goals and non-goals

**Goals**

1. Category locks Q3–Q6 are encoded as data + labels (Frozen = `metodePembayaran null`, Tarif = set), with the SchoolForm toggle labeled accordingly plus an effective-bill preview — no schema change.
2. Q7 is proven in code: a grep gate + unit test pins that no honor/billing path reads `keterangan` content; fractional rupiah is rounded once at the flat derivation (F15).
3. Honor Payable is derived per trainer per period from attendance + session role (I → owner's tier, A → flat 50k), memo-only, history byte-identical for rows without `peran` — labaRugi untouched (D1).
4. Honor Payment stays on the existing append-only ledger with derived Unpaid / Partially Paid / Paid statuses (Payable − paid); cash-flow deferral is display/scheduling only and never reduces Payable.
5. The generator bills per-meeting for Tarif schools and flat for Frozen schools, frozen at Terbit; the dashboard switches to the invoice pipeline only after the generator upgrade is green (dashboard-last).

**Non-goals (stay out of this chain)**

- Slot-pick auto-create, cover link, per-session role storage, externals + recorder, role-first honor math — owned by COVER_SLOT (D-CS1–D-CS6); this chain only consumes `peran` as an entry assumption (§8).
- Invoice-level SPP payments, carry-over/credit economics — owned by SPP_BILLING (D-SB8/R-SB6, SB.B.4); this chain only reads `invoiceSettlement`/`matchedPaymentsForInvoice`.
- Special handling for trainers who leave with unpaid honor or students who transfer with credit — explicitly out of scope in EVALUATION_LOG (manual admin handling until a genuine case appears).
- New tables, new login/account types, audit-log viewer UI, slot-scoped honor weighting beyond role-first.
- Back-billing Q8 with real samples — accepted Unverified; this chain ships synthetic fixtures + a manual runbook, not a forced decision.

## 3. Findings registry (F-EF)

| ID | Finding | Evidence |
|---|---|---|
| F-EF1 | **Frozen/Tarif category has no labeled switch.** `metodePembayaran null` vs set is the de-facto category (D8, I2), but the SchoolForm toggle (`SchoolList.jsx:668`) carries no Frozen/Tarif labels and no effective-bill preview, so Q3 is unenforceable in UI. | `SchoolList.jsx:668-694`; `constants.js:56` (default null); `EXEMPLAR_MIGRATION.md` D8/G2 table; `EVALUATION_LOG.md` Q3 |
| F-EF2 | **Remarks no-parse is asserted, never pinned.** Q7 claims no logic parses `keterangan`, but no test fails if someone adds `keterangan.includes('EXPO')` tomorrow. | `finance.js:55-69,111-114` (reads `status` only); `TrainerAttendanceAdmin.jsx:235-236`, `TrainerAttendanceForm.jsx:157` (text inputs); no `keterangan.includes` hits in `src/` |
| F-EF3 | **Fractional rupiah leaks into flat totals.** Semester/6 normalization yields non-integer `spp` (141666.67), and `targetSpp = length × spp` propagates fractions into Potensi. | `finance.js:89-94`; `EXEMPLAR_MIGRATION.md` F15/I5 (2,450,007 / 1,700,004 / 53,535,011) |
| F-EF4 | **Generator upgrade is unowned.** The canonical path (D-SB10) still bills flat; SB-C is closed, COVER_SLOT only guards the order. Until someone owns the upgrade, Q2/P2 cannot ship. | `invoiceGenerator.php:106-135` (flat groups, no `metodePembayaran` read); `SPP_BILLING_PLAN.md` §10 (SB-C closed); `COVER_SLOT_PLAN.md` D-CS7/F-CS6 |
| F-EF5 | **No Payable-vs-Payment split.** Payable (earned at attendance) and Payment (cash-dependent settlement) share one number path; deferral has nowhere to live except by shrinking what is owed — violating the EVALUATION_LOG cash-flow policy. | `finance.js:130-165` (single `bebanHonor`/`dibayar`/`sisaHonor` path); `schema.sql:96-107` (`honor_payments` ledger exists, no payable derivation); `EVALUATION_LOG.md` Stages 5–6 |
| F-EF6 | **Dashboard switch would move the two-answers problem today.** Switching Potensi to the invoice pipeline while the generator is flat reproduces flat under a new name. | `finance.js:89-94` vs `billingForSekolah`; `invoiceGenerator.php:106-135`; `EXEMPLAR_MIGRATION.md` P1–P2/F7; `COVER_SLOT_PLAN.md` F-CS6 |

## 4. Decision set (D-EF)

| # | Decision | Status |
|---|---|---|
| D-EF1 | **Category labels (concrete pick).** `metodePembayaran null` = **SPP Flat / Frozen (Beku)**; set = **SPP Tarif per Pertemuan**. The SchoolForm toggle (`SchoolList.jsx:668`) becomes the category switch with these labels + an effective-bill preview (Tarif → `tarif × 1 pertemuan × basis-count` sample; Frozen → `spp × pupils`). No schema change. Frozen roster is an explicit dated decision, default only SMPN 18 (Q3); adding a school never rewrites past invoices (frozen at Terbit, D-SB11). | Locked |
| D-EF2 | **Remarks never parsed (concrete pick).** Honor and billing read `status` only (`Hadir` → full per role; Izin/Alpa → 0). No code may branch on `keterangan`/remarks text content. A grep gate + unit test pins this; EXPO-not-billed stays structural (no `absensi` rows), never textual. | Locked |
| D-EF3 | **Rounding rule (concrete pick).** All flat-derivation rupiah outputs (`targetSpp`, Potensi, legacy displays) are `Math.round`ed to whole rupiah once at derivation. The per-meeting path uses `tarifPerPertemuan` directly and needs no rounding. Historical figures stay byte-identical except fraction→integer cleanup on the two semester-legacy schools. | Locked |
| D-EF4 | **Payable derivation (concrete pick).** New pure function `honorPayable({ absensiPengajar, trainer, periode })` → per-trainer `{ hadirI, hadirA, payable }` where `A → 50k` (D2, whoever fills the slot incl. externals) and `I → owner's trainer.honor` (R-TA3 tiers, no hardcode). Rows without `peran` use the legacy per-person path byte-identically. Payable is memo-only: it never enters `labaRugi` (D1) and never overwrites Payment state. Entry assumption: COVER_SLOT CS.C.1 makes `peran` available; without it, Payable prices legacy rows only. | Locked |
| D-EF5 | **Generator upgrade owner (concrete pick, re-plan).** This chain owns wiring per-meeting semantics into `server/lib/invoiceGenerator.php`: Tarif schools → `tarif × pertemuanAktual (× pupils iff basis siswa)` with `pertemuanAktual = COUNT(absensi WHERE sekolahId + periode + trainerStatus Hadir)` (same predicate as `billingForSekolah`, D-SB13: Izin/Alpa = 0, cover = new Hadir row); Frozen (`metode null`, default SMPN 18) → legacy `spp × active pupils` byte-identical (R-SB3). Q4 semester = actuals (holiday = no row = not billed); Q5 trainer-basis = `tarif × sessions` (no pupil multiplier); Q6 SMP Sains = single record billed × SD roster. Freeze at Terbit + carry-over unchanged (D-SB11/R-SB6). | Locked |
| D-EF6 | **Payment statuses + deferral (concrete pick).** Per trainer per period from the existing `honor_payments` ledger: `Unpaid` (paid = 0 < payable), `Partially Paid` (0 < paid < payable), `Paid` (paid ≥ payable); `sisa = max(0, payable − paid)`; excess surfaces as credit (existing `lebihBayarHonor` pattern). Deferral ("Menunggu kas") is a display/scheduling note for unpaid/partial rows when tuition cash is short — it never reduces Payable and never blocks its derivation. No new tables; ledger stays append-only (R-SB1 analog). | Locked |
| D-EF7 | **Dashboard-last switch (concrete pick, restates D-CS7 as gate).** Potensi per school = invoice-pipeline figure when Tarif, `spp × pupils` when Frozen — only after EF.C (generator upgrade) is green. Until then the dashboard keeps the flat source and the regression pins (53,535,011 + ≈73.45M) fail loudly on premature switches. | Locked |

## 5. Data model (extensions, additive only)

```text
honorPayable (derived, never stored — R-SB2 analog):
{ trainerId, periode, hadirI, hadirA, payable }
payable = hadirI × trainer.honor + hadirA × 50000
rows without peran → hadirI = Hadir count, hadirA = 0 (legacy path, byte-identical)

honorSettlement (derived per trainer per period, reads honor_payments ledger):
{ trainerId, periode, payable, dibayar, sisa, credit, status: Unpaid|Partially Paid|Paid,
  deferral: null | { note: 'Menunggu kas', since } }   // display only, never alters payable

invoiceGenerator.php addition (D-EF5, Tarif branch only; Frozen branch unchanged):
pertemuanAktual = COUNT(absensi WHERE sekolahId=X AND periode=P AND trainerStatus='Hadir')
basis 'siswa'   → tarifPerPertemuan × pertemuanAktual × active-non-Trial pupils
basis 'trainer' → tarifPerPertemuan × pertemuanAktual
metode null     → spp × active pupils (legacy, byte-identical per R-SB3)
```

Invariants: Payable derivation never writes to any ledger; Payment rows never alter Payable; `labaRugi` still reads only `pemasukanSpp − totalHonorDibayar` (D1); generator Frozen branch output is byte-identical to today; Terbit freeze + same-school carry-over (D-SB11/R-SB6) untouched; Q8 rows without real samples stay `Unverified` with owner, never forced green.

## 6. Rules (R-EF)

- **R-EF1** One concern per edit (IMPLEMENTATION R1 / R-SB4): labels, remarks-pin, rounding, payable, payment-status, generator, dashboard-switch are separate microtasks; never restyle while fixing logic; classNames move verbatim.
- **R-EF2** Mirror, don't invent (taste #11): compose `invoiceSettlement` derivation shape, `correctionOf` latest-wins, `Modal`/`AlertDialog` idioms, RupiahInput/select form idioms, and Style source D-PG8.
- **R-EF3** Indonesian copy pinned (§7); tests select buttons by these exact names.
- **R-EF4** Derivations additive only: missing keys (`peran`, `metodePembayaran`, `deferral`) read as legacy behavior; silently writing unbilled scope/role/status is a defect.
- **R-EF5** Server is authoritative (taste #33/#61): generator math + ledger validation gate in PHP (`invoiceGenerator.php`, `entities.php`); UI mirrors, never guards alone; privilege matrix unchanged (AP.D.1 admin_cabang own-branch honor append/correct stays as-is; no role broadened).
- **R-EF6** Verification language `Verified: <command> -> <result>` / `Unverified:` (UNIVERSAL); every microtask has one OUTCOME + one falsifiable VERIFY (taste #2); narrowest check runs immediately after the first edit (taste #4); source hygiene gate: no `console.log` in `src/`, no build artifacts in `git status` (taste #20); `deploy/` only via `npm run build:deploy` (taste #71, HARD parity gate #72); full loop + pre-existing-failure triage + acceptance re-run before done (taste #9/#10).

## 7. UI concept (pinned copy)

Category switch on the school form: `Metode penagihan: [Flat / Beku] atau [Tarif per Pertemuan]` with preview `Estimasi tagihan: …` and Frozen hint `Hanya SMPN 18 untuk saat ini (keputusan bertanggal …)`. Honor memo block: `Honor payable (memo): …` with per-trainer `Unpaid / Partially Paid / Paid` badges and deferral line `Menunggu kas — payable tetap tercatat penuh.` Invoice warning unchanged (D-SB11): `Invoice periode ini sudah Terbit — perubahan masuk ke invoice berikutnya.` Status copy follows existing `Lunas / Belum Lunas` derivation; empty states unchanged (`Belum ada penugasan.`, `Tidak ditugaskan`).

## 8. Alignment table — verify-the-verification gate (taste #68)

| Finding | Confirmed by docs (file/section) | Not documented / implied | Disposition in this chain |
|---|---|---|---|
| F-EF1 category switch unlabeled | `EXEMPLAR_MIGRATION.md` D8/G2 (20-school map, SMPN 18 null); `EVALUATION_LOG.md` Q3/I2; `SchoolList.jsx:668` toggle exists | Frozen-vs-Tarif labels + preview never specified | New build D-EF1 (EF.A.1) |
| F-EF2 remarks no-parse unpinned | `EVALUATION_LOG.md` Q7 (agreed); `finance.js:55-69` (status-only); text inputs `TrainerAttendanceAdmin.jsx:235-236` | Pinning test/gate never written | New pin D-EF2 (EF.A.2, no app change) |
| F-EF3 fractional rupiah | `EXEMPLAR_MIGRATION.md` F15/I5; `finance.js:89-94` | Rounding rule never picked | New rule D-EF3 (EF.A.3) |
| F-EF4 generator still flat, upgrade unowned | `invoiceGenerator.php:106-135`; `SPP_BILLING_PLAN.md` §10 (SB-C closed); `COVER_SLOT_PLAN.md` D-CS7 (guard only) | Per-meeting generator build never assigned | New owner D-EF5 (EF.C) via re-plan |
| F-EF5 no Payable/Payment split | `finance.js:130-165`; `schema.sql:96-107`; `EVALUATION_LOG.md` Stages 5–6 | Split design only in EVALUATION_LOG prose, no microtasks | New build D-EF4/D-EF6 (EF.B.1–B.2) |
| F-EF6 premature dashboard switch | `EXEMPLAR_MIGRATION.md` P1–P2/F7; `COVER_SLOT_PLAN.md` F-CS6 | Switch mechanics after upgrade never assigned | New gate D-EF7 (EF.D, after EF.C) |
| Slot-pick / cover link / peran storage / externals / role-first math | `COVER_SLOT_PLAN.md` D-CS1–D-CS6; `COVER_SLOT_MILESTONES.md` CS.A–CS.C | — (fully owned elsewhere) | Deferred to COVER_SLOT (§10), consumed as entry assumption only |
| Invoice-level SPP / carry-over / credit | `SPP_BILLING_PLAN.md` D-SB8/R-SB6; `invoices.js:180-250`; `entities.php:396-429` | — (closed, SB.B.4/SB.C.2) | Deferred to SPP_BILLING (§10), read-only here |

## 9. Access model (explicit, no broadening)

| Action | Superadmin | Admin Cabang | Trainer |
|---|---|---|---|
| Set school category (Frozen/Tarif) + preview | ✅ all branches | 🔍 read (propose to pusat per PRIVILEGES escalation) | ❌ no access |
| Record honor payment / deferral note | ✅ full (only payer) | 🟡 append/correct own branch (AP.D.1, trailed via insertLedger) | ❌ never |
| Read Payable / settlement / invoice pipeline figures | ✅ everything | 🟡 own branch (redacted cross-branch Laba/Rugi per matrix) | 🟡 own rows only |
| Server rule | bypass | `recordOwnsBranch` + existing `validateHonorPayment`/`validateSppPayment`; no new write paths | ownership + assignment scope; no `correct` path (TA.B.4) |

## 10. Deferred with owners

| Item | Owner / venue | Why deferred |
|---|---|---|
| Slot-pick auto-create, cover `coverOf` link, per-session `peran`, multi-assistant, externals + `dicatatOleh`, role-first honor math | COVER_SLOT chain CS.A–CS.C (D-CS1–D-CS6) | Fully owned there; this chain consumes `peran` only (taste #53, no duplication) |
| Invoice-level SPP payments, carry-over/credit rollover, Terbit freeze mechanics | SPP_BILLING chain SB.B.4/SB.C.2 (D-SB8/D-SB11/R-SB6) | Closed and owned; read-only here |
| Trainer inline creation of externals | Future amendment + abuse review (COVER_SLOT §10) | Would broaden trainer write (taste #33) |
| Leavers / transfers with outstanding payable/credit | Manual admin handling (EVALUATION_LOG out-of-scope) | No genuine case yet; no forced design |
| Q8 real samples (installments, carry-over, payouts) | Team-supplied data or accepted Unverified | Cannot HIT without ground truth (I4) |

## 11. Write-back contract (taste #32/#43, on EF.D close)

Record `Verified:` lines per microtask in `EVAL_FINANCE_MILESTONES.md`; mark Gates EF.A–EF.D; append one closure row to `SCOPE_EXPANSION_MILESTONES.md` (no renumbering of the existing chain — this pair is the temporary gate doc per taste #40/#74); append one upgrade note to `SPP_BILLING_PLAN.md` §10 (generator now per-meeting; SB history otherwise intact); link Q2 switched + Q3–Q7 pinned + Q8 still Unverified in `EVALUATION_LOG.md`/`EXEMPLAR_MIGRATION.md` addendum without expanding the long-term plan.

## 12. Cross-references

- `docs/UNIVERSAL.md`, `docs/IMPLEMENTATION_PLAN.md` (Part 2 contract, Part 5 file map), `docs/SCOPE_EXPANSION_PLAN.md`, `docs/SCOPE_EXPANSION_PRIVILEGES.md`, `docs/SPP_BILLING_PLAN.md`, `docs/SPP_BILLING_MILESTONES.md`, `docs/COVER_SLOT_PLAN.md`, `docs/COVER_SLOT_MILESTONES.md`, `docs/EXEMPLAR_MIGRATION.md`, `docs/EVALUATION_LOG.md`, `docs/TRAINER_ATTENDANCE_PLAN.md`
- `src/lib/finance.js`, `src/lib/invoices.js`, `src/lib/constants.js`, `src/lib/trainerAttendance.js`, `src/features/schools/SchoolList.jsx`, `src/features/reports/FinanceReport.jsx`, `src/features/reports/OverviewCards.jsx`, `src/features/payments/PaymentTable.jsx`
- `server/lib/invoiceGenerator.php`, `server/validation/entities.php`, `server/auth/authorize.php`, `server/schema.sql`, `server/tests/reconcile.check.php`, `server/tests/entity.validation.php`, `server/tests/endpoint.protection.php`
