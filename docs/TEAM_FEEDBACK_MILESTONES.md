# Team Feedback — Microtask Chains (G1–G5)

**Companion to `docs/TEAM_FEEDBACK_PLAN.md`.** Implements plan sections 5–9 in strictly-ordered gates: **G1 dialog → G2 thumbnail → G3 jadwal → G4 trainer → G5 finance** (rationale: plan section 10). Each microtask must VERIFY before the next begins. A failing check becomes the next microtask's own EDIT — never a concurrent second edit.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-IDs from the PLAN>
  RULES:   <R-IDs from the PLAN + taste codes>
  DEPENDS: <prior microtask>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

R-codes quick reference (PLAN section 4): R1 ledger trust · R2 mirror idiom · R3 smallest slice + verify · R4 no new dep · R5 no new PII · R6 idempotent migration · R7 privilege unchanged. Taste codes: taste #11 mirror idiom · #15 dead-code gate · #16 Indonesian copy · #18 Rupiah display-vs-storage · #20 no console.log hygiene.

---

## Gate G1 — Payment dialogs (D4; FINDS F4, F5)

**Entry gate:** PLAN sections 3–5 agreed (done 2026-09-18). **Exit gate:** E1 green (honor confirm closes; SPP orphan gone).

### G1.1 Close honor confirm on confirm

```text
MICROTASK: Close honor delete dialog
  EDIT:    src/features/payments/PaymentTable.jsx (ConfirmDialog onConfirm only)
  FINDS:   F4
  RULES:   R2, R3, taste #11 (mirror InvoiceModal.jsx:134 close idiom), taste #16 (keep 'Batal / Lanjutkan')
  DEPENDS: none
  OUTCOME: clicking Lanjutkan deletes the honor entry and closes the dialog, while Batal closes with no write
  VERIFY:  Playwright: seed one honor payment, open Riwayat, delete, click Lanjutkan, dialog gone and entry gone after refresh; reopen, delete, click Batal, entry still present
  DONE-IF: verify passes; only PaymentTable.jsx changed
```

### G1.2 Delete SPP orphan helper

```text
MICROTASK: Remove unreachable SPP delete
  EDIT:    src/lib/sppPayments.js (deleteSppPayment removal only)
  FINDS:   F5
  RULES:   R1, R3, taste #15 (dead-code gate: no orphan ledger writer)
  DEPENDS: G1.1
  OUTCOME: the unreachable SPP delete path no longer exists and SPP corrections stay append-only new rows
  VERIFY:  node -e check: rg deleteSppPayment src returns empty and npm test passes on touched libs
  DONE-IF: verify passes; only sppPayments.js changed
```

---

## Gate G2 — Thumbnail uniformity (D1; FINDS F1)

**Entry gate:** G1 exit green. **Exit gate:** E2 green.

### G2.1 Center crop-fill thumbnails

```text
MICROTASK: Center school thumbnails
  EDIT:    src/features/schools/SchoolList.jsx (SchoolThumbnail img class + Foto hint line only)
  FINDS:   F1
  RULES:   R2, R3, R5, taste #11 (keep h-44 object-cover card idiom; only add object-center)
  DEPENDS: G1.2
  OUTCOME: school cards keep a uniform h-44 rhythm with centered crops and a landscape upload hint under the Foto input
  VERIFY:  Playwright: Data Sekolah with portrait + landscape + fallback cards shows three equal-height image boxes and the hint text 'Disarankan foto landscape 16:9 agar terpotong rapi.'
  DONE-IF: verify passes; only SchoolList.jsx changed
```

---

## Gate G3 — Jadwal start + end (D2; FINDS F2)

**Entry gate:** G2 exit green. **Exit gate:** E3 green (range saves, re-hydrates, guards).

### G3.1 Add endTime schema and formatter

```text
MICROTASK: Add jadwal endTime shape
  EDIT:    src/lib/constants.js (newSekolah default only) + src/lib/format.js (formatJadwalList only) + src/lib/__tests__/jadwal-range.test.js (new)
  FINDS:   F2
  RULES:   R3, R6, taste #35 (legacy {day,time} renders time+60min, no bulk rewrite)
  DEPENDS: G2.1
  OUTCOME: new schools default to Senin 14:00-15:00 and legacy entries without endTime display as a one-hour range
  VERIFY:  npm test: new entry formats 'Senin 14:00–15:00' and legacy {dayOfWeek:'Senin', time:'14:00'} formats 'Senin 14:00–15:00'
  DONE-IF: verify passes; only the three files changed
```

### G3.2 Add end-time inputs and guard

```text
MICROTASK: Add end-time form inputs
  EDIT:    src/features/schools/SchoolList.jsx (SchoolForm jadwal rows only)
  FINDS:   F2
  RULES:   R2, R3, taste #11 (second time input mirrors the existing row styling), taste #16 (guard copy 'Jam selesai harus setelah jam mulai')
  DEPENDS: G3.1
  OUTCOME: each jadwal row shows start + end time inputs and saving with end <= start is blocked with the pinned message
  VERIFY:  Playwright: Edit Sekolah, set Senin 14:00-15:00, save, refresh, row re-hydrates 14:00-15:00 and card + Rekap Saya show 'Senin 14:00–15:00'; set end 13:00, save blocked with 'Jam selesai harus setelah jam mulai'
  DONE-IF: verify passes; only SchoolList.jsx changed
```

---

## Gate G4 — Trainer derived schedule (D3; FINDS F3)

**Entry gate:** G3 exit green (endTime shape exists to derive). **Exit gate:** E4 green.

### G4.1 Derive trainer jadwal display

```text
MICROTASK: Derive trainer schedule text
  EDIT:    src/features/trainers/TrainerList.jsx (TrainerForm jadwal block + card Jadwal Mengajar row + save payload only)
  FINDS:   F3
  RULES:   R2, R3, R6, R7, taste #11 (read-only text reuses formatJadwalList, no second formatter), taste #16 ('Belum diatur')
  DEPENDS: G3.2
  OUTCOME: trainer jadwal renders as read-only joined school ranges with no editable input and unassigned trainers show Belum diatur
  VERIFY:  Playwright: create trainer assigned to a school with Senin 14:00–15:00, form shows the range read-only with no jadwal textbox, card shows the same range; unassigned trainer shows 'Belum diatur'
  DONE-IF: verify passes; only TrainerList.jsx changed
```

---

## Gate G5 — Finance overpay guards (D5; FINDS F6)

**Entry gate:** G4 exit green. **Exit gate:** E5 green (whole-round gates).

### G5.1 Floor engine negatives with credit

```text
MICROTASK: Floor finance negatives
  EDIT:    src/lib/finance.js (belumTertagih/sisaHonor/sisaKewajiban floors + lebihBayar fields only) + src/lib/__tests__/finance-overpay.test.js (new)
  FINDS:   F6
  RULES:   R1, R3 (labaRugi formula untouched per D1)
  DEPENDS: G4.1
  OUTCOME: overpaid periodes report zero balances with the excess exposed as Lebih Bayar credit while Laba/Rugi math is unchanged
  VERIFY:  npm test: potensi 1jt with pemasukan 1,2jt yields belumTertagih 0 plus lebihBayarSpp 200rb; beban 500rb with dibayar 600rb yields sisaHonor 0 plus lebihBayarHonor 100rb; exact-pay and underpay cases unchanged
  DONE-IF: verify passes; only finance.js + the new test changed
```

### G5.2 Render credit line in report

```text
MICROTASK: Render Lebih Bayar row
  EDIT:    src/features/reports/FinanceReport.jsx (tunggal hero + comparison rows only)
  FINDS:   F6
  RULES:   R1, R2, taste #11 (credit row mirrors existing memo/Kas tag idiom), taste #16 ('Lebih Bayar'), taste #18 (all values via formatRupiah)
  DEPENDS: G5.1
  OUTCOME: the finance report shows Lebih Bayar credit wherever a floored zero appears and never renders a negative for these cells
  VERIFY:  Playwright: seeded overpaid periode shows 'Rp 0' for Belum Tertagih/Sisa plus a 'Lebih Bayar' value of the excess and no minus sign in those cells
  DONE-IF: verify passes; only FinanceReport.jsx changed
```

---

## Microtask Verification Standards

Each microtask above must satisfy:

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-IDs>
  RULES:   <R-IDs + taste codes>
  DEPENDS: <prior microtask>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

Plus the whole-round gates E1–E5 in `docs/TEAM_FEEDBACK_PLAN.md` section 12: `npm test` green on touched libs, clean production build, no `console.log` in `src/`, `git status` shows only intended files. Server-side `jadwalList.endTime` column work and F7 rate snapshotting are explicitly out of this chain — any gap found is documented for follow-up, not patched mid-chain (taste #13).

---

**End of Microtask Chains**
