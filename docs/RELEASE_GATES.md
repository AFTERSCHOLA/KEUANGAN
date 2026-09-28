# Go-Live Gates — What Stands Between Pilot and Production

**Status:** OPEN 2026-09-27 — Gates G0–G5 open (no gate closes without its acceptance line filled).
**Position:** Temporary release-readiness doc per taste #40. It does **not** replace `IMPLEMENTATION_PLAN.md`, `SCOPE_EXPANSION_PLAN.md`, `PRODUCTION_PLAN.md` / `PRODUCTION_MILESTONES.md`, `COVER_SLOT_*`, `EVAL_FINANCE_*`, `DRIFT_CLOSE_*`, or `EXEMPLAR_MIGRATION.md` (ground truth). Each gate below names the problem in detail, its root cause, what we are lacking, what we need, an example, the owner, and the exact acceptance. Client-facing questions are collected once more in §8 for the client round.
**Contract order:** `docs/UNIVERSAL.md` → `docs/EXEMPLAR_MIGRATION.md` (ground truth + 2026-09-27 addendum) → `docs/EVALUATION_LOG.md` (Q1–Q8 finals) → `docs/DRIFT_CLOSE_PLAN.md` (DC.E dispositions) → this file.

---

## G0 — Honor/SPP separation, locked in writing (proposed Locked, awaiting acknowledgment)

**Problem (detail).** Operators and stakeholders can easily believe the two money figures influence each other — e.g. "a school that pays late means trainers get paid less," or "Frozen schools pay trainers differently." If anyone acts on that belief (withholding honor over unpaid tuition, or re-deriving one figure from the other), the company either breaks its own cash-flow policy or silently misstates obligations.

**Root cause.** The two figures live near each other on the same dashboard (Potensi, Beban Honor, Laba/Rugi), so their visual proximity suggests a relationship the math does not have.

**What we actually lack.** A recorded, acknowledged rule — the code already enforces the separation, but no document states it in one quotable sentence, so a future operator, dev, or investor can still assume the opposite.

**What we need.** Team + client acknowledgment of the statement below (code-verified 2026-09-27 against `src/lib/finance.js:244-269`, `server/lib/invoiceGenerator.php:116-197`, `src/lib/honor.js`):

> *"Tagihan sekolah (SPP) dan honor trainer adalah dua derivasi yang tidak berbagi satu pun input: SPP hanya membaca konfigurasi penagihan sekolah + kehadiran + roster; honor hanya membaca kehadiran + peran sesi + data trainer. Keduanya bertemu semata-mata di labaRugi kas (pemasukan − honor dibayar). Kategori Frozen/Tarif hanya memilih rumus tagihan; tidak mengubah honor satu rupiah pun."*

**Example.** SMP Sains runs 3 September sessions billed × the SD roster (Tarif), while a substitute covering one of them is paid the substitute's role rate; freezing SMPN 18's bill changes neither figure for trainers. If tuition arrives late, `honorSettlement` shows `Menunggu kas` as a display note — payable stays full.

**Owner:** user/team to acknowledge; client to acknowledge in the client round (§8 Q-A).
**Acceptance:** names + dates recorded here; then this gate marks Locked.
**Acknowledged 2026-09-27 by Akbar Dwi Herlambang (owner-side lock).** Client acknowledgment (§8 Q-A) still pending; gate stays Proposed-Locked until then.

---

## G1 — F6 school-alias sign-off (the biggest DATA risk)

**Problem (detail).** Exemplar sheets spell several schools differently per file (`SD Al-Irham` vs `SD Al-Irhaam Global Islamic School`, `SMA` vs `SMAIT Al-Irsyad`, `Tauhid` vs `Tauhiid`, missing/extra `Tunas Bangsa`, `Kota`, apostrophes). The migration merged each group into one record by similarity. If any variant is actually a *distinct* school, its students, bills, and honor attach to the wrong record from day one — and un-merging production billing data later is painful and trust-destroying.

**Root cause.** The sheets never confirm identity; similarity is inference, not evidence. Only the person who owns the field data knows whether `SD Al-Irham` is a typo or a second school.

**What we actually lack.** One sign-off per alias row in `docs/EXEMPLAR_F6_CONFIRM.md` (still OPEN, all ☐ unresolved).

**What we need.** Field owner writes same/distinct per row with name + date. Any `distinct` verdict opens a data-move microtask (new canonical record + idempotent move per taste #35) — never a silent rename. No production billing data may be entered before sign-off.

**Example.** Highest-risk row: `SD Al-Irham` (Jadwal + Trainer-Sep, Paris sessions) vs `SD Al-Irhaam Global Islamic School` (Biaya tariff) vs `SD Al-Irhaam` (siswa sheet) — one tariff, one roster, one session group, but the names differ most. Sains SD/SMP is separately confirmed as two session groups sharing one roster (single record stands until SMP pupils are registered).

**Owner:** field-data owner (user to name). Team tracks; client confirms the owner has authority.
**Acceptance:** every ☐ resolved with name + date; any `distinct` moved by microtask.

---

## G2 — Test suite green or explicitly accepted (no silent red)

**Problem (detail).** Three different reds exist, and shipping on top of an undiagnosed red suite means the next regression hides inside noise. (a) Default project: 119/143 — 24 failures, each dispositioned in `DRIFT_CLOSE_MILESTONES.md` DC.E.1 (1 real regression found + fixed: AP.A.1 stale cache; remainder: legacy-monolith drift, shared-DB pollution, proven-pre-existing legs). (b) Destructive project: 8/13 — auth flake cohort + lockout cascade, phase567 blocked, stress-sim cascade-suspect. (c) The e2e monolith (`e2e.spec.js`) carries documented class-2 selector drift (e.g. Boot fails on duplicated `Tahun Ajaran` chart text — identical on pristine pre-change code).

**Root cause.** Three separate causes, not one: (1) the suite was never updated against COVER_SLOT/EVAL_FINANCE/queue-drop behavior (fixed where in-scope: DC.B.4/DC.C/DC.D legs green); (2) all specs share one MySQL database with no per-test reset, so names/rows leak across tests (strict-mode duplicates, foreign rows in exports); (3) destructive prerequisites live outside git (Temp seed scripts, absent on this machine) so phase567 cannot execute at all.

**What we actually lack.** (i) A green run, or a signed accepted-carry list; (ii) the missing Temp seed scripts (`seed_users.php`, `seed_phase567.php`, …); (iii) an owner for the e2e-monolith drift (tab counts, chart-text selectors) — flagged DL-7, unowned.

**What we need.** (1) ~~Regenerate the Temp seed scripts~~ SUPERSEDED Lane-2 (user-directed retire): phase567 deleted (invoice flow predates SB.C.2; coverage mapped to green focused specs); auth + stress Temp calls replaced with in-repo `db-reset.php` + new `server/tests/clear-throttle.php` — re-run destructive to green. (2) Team sign-off on the 24 default dispositions, or fix-owners assigned per remaining row (m512 tabs → fixed Lane-2; e2e text selectors → UI owner). (3) Either per-test DB isolation or a documented shared-DB discipline, so future reds are diagnosable.
**Lane-2 outcome 2026-09-27:** auth-login-page 11/11 green (Akun-menu opens, in-repo throttle, hermetic #11 seed); m512 green at 13 tabs; e2e Boot green isolated (year-select + `getKeys()` undefined-key app fix + probe tolerance); phase567 retired (config + setup updated); stress-simulation Unverified (stacked-modal wedge, non-CI exploratory — product finding logged DL-12 for the owning chain); AP.A.1 regression from Lane-2 itself found by triage and fixed (`pullRemote` overlay removal + unit test); trainer-honor-input proven flake (fails mine once, passes mine on retry, passes pristine). G2 still needs the full-suite re-run + team sign-off; remaining in-run reds are e2e-file-internal (DL-14: repair-vs-quarantine decision open) plus flake/pollution carries. Nothing in Lane-2 changed app billing/honor math.

**Example.** `m512` expects 11 nav tabs; the app has had 13 since the Penugasan chain added two tabs — the spec, not the app, is stale, but nobody owns updating it, so it stays red forever without G2.

**Owner:** user/team for sign-off; Temp-script regeneration owner TBD (whoever generated them originally).
**Acceptance:** destructive green (or re-run with seeds + new dispositions) AND default green-or-accepted with signatures + dates.

---

## G3 — Real-money operations decided before real money flows (Q8 + F12)

**Problem (detail).** Two collection workflows have no proven path. (a) Q8: the ground truth contains zero installment/carry-over/payout samples (verified absence in the SQL backup — 0 payment/invoice rows), so partial payments, overpayment credits, and honor installments are covered only by synthetic fixtures. The first real partial payment will exercise code no real data has ever touched. (b) F12: invoice follow-up (who received it, WA number, send date, follow-up date, note) lives only in the spreadsheet's 13 Invoice rows; the app's invoices carry billing fields only. The day real collections start, two systems track follow-ups and they will drift.

**Root cause.** (a) The exemplar simply never included payment behavior — a ground-truth hole, not a code defect. (b) Follow-up metadata was never specified as an invoice field — unplanned scope, deferred.

**What we actually lack.** (a) One real sample each of: an installment, a carry-over/credit, an honor payout — or an explicit accepted-Unverified. (b) A decision: build follow-up fields into invoices (post-finance microtask, additive nullable fields) or declare the sheet canonical for follow-ups.

**What we need.** Client supplies the Q8 samples (see §8 Q-C), or signs accepted-Unverified with an owner. F12: build-or-sheet decision recorded; if build, a microtask; if sheet, a no-dual-entry rule (follow-ups edited in exactly one place).

**Example.** A school pays half its September invoice, overpays October by 50k, and two trainers take partial honor payouts while tuition is still short — today that exact month cannot be rehearsed with real-shaped data.

**Owner:** client (samples); user/team (F12 decision).
**Acceptance:** samples received and rehearsed, or accepted-Unverified signed; F12 decision recorded.
**F12 DECIDED + IMPLEMENTED 2026-09-27 (user-directed: build).** Invoices carry nested nullable `followUp: { penerima, wa, tanggalKirim, tanggalFollowUp, catatan }` (mirrors the exemplar Invoice sheet columns); edited superadmin-only in the Riwayat section of `InvoiceModal.jsx` (full-payload replace via the existing update path — zero server changes, billing math never reads it; WA normalized with the shared `waNormalize` idiom). `Verified: npx playwright test tests/invoice-followup.spec.js --workers=1 -> 1 passed` (record → render → reload persistence + hermetic cleanup), `npm test -> 246 passed`, `npm run build -> green`. Q8 samples still pending (unchanged).

---

## G4 — Connectivity contract stated (offline is gone by decision)

**Problem (detail).** The client queue was removed by explicit decision (D-DC1): every write now posts direct to the server. If the network drops mid-entry, the save fails loudly with an alert — nothing is silently lost, but nothing can be captured offline either. An operator doing field entry (school visits, basements, dead zones) will discover this at the worst moment unless told beforehand.

**Root cause.** Architectural trade accepted for simplicity: the queue's main production behavior turned out to be silently *losing* verifications (queued edits never applied server-side), so it was removed rather than repaired. The consequence — network-required writes — was owned openly but never communicated outward.

**What we actually lack.** An operator-facing statement and a fallback procedure (retry wording, what to do with paper notes until signal returns), or a reversed decision with a new offline plan.

**What we need.** (1) Client acknowledgment of the connectivity requirement (§8 Q-D). (2) A one-paragraph field procedure in operator language (who retries, where paper backup lives, who reconciles). (3) If any entry happens offline, a fresh offline-capture plan — not a quiet re-adding of the old queue.

**Example.** A trainer marks attendance from a school with no signal: today the form shows `Gagal menyimpan. Periksa koneksi lalu coba lagi.` and nothing is recorded. The operator must know to keep the paper sheet and retry — that instruction does not exist yet.

**Owner:** user/team (procedure + comms); client (acknowledgment + field reality check).
**Acceptance:** acknowledgment recorded; procedure written where operators will read it.
**Field procedure (draft 2026-09-27, operator language — print or pin where admins/trainers see it):**
> **Kalau tombol Simpan gagal (tidak ada sinyal):** (1) Jangan khawatir — data tidak hilang diam-diam; aplikasi menampilkan pesan galat dan TIDAK mencatat apa pun. (2) Catat di kertas seperti biasa (tanggal, sekolah, siapa hadir). (3) Setelah ada sinyal, buka kembali halaman yang sama dan tekan Simpan ulang. (4) Pastikan muncul tulisan **Tersimpan**; kalau ragu, buka Riwayat dan pastikan catatan Anda ada di daftar. (5) Jangan input dua kali — kalau ragu sudah tersimpan atau belum, cek Riwayat dulu; duplikat ID ditolak server (409) dan memunculkan peringatan. Untuk admin: verifikasi dan koreksi hanya berlaku untuk data yang sudah tersimpan di server; yang belum tersimpan tidak bisa diverifikasi.
**Offline-v2 proposal (user, 2026-09-27 — assessed, not yet decided).** Idea: on failed save, persist the exact request body locally and replay it when connectivity returns, so Storage and Server converge. Assessment: the direction is sound, but it is a *new durable outbox*, not a small addition — and it must not repeat the three failure modes of the deleted queue: (1) silent loss (old sync INSERTs skipped dups as `alreadyApplied`; edits had no server path at all) — v2 needs per-entry receipts surfaced per row, never silent; (2) no update path — now unblocked (DC.B.1 added `absensi` update/verify/certify; masters have versioned updates), so replay can be honest; (3) conflicts — two offline editors on one record need an explicit last-writer-wins or version-guard policy plus a conflict UX, storage caps, and ordering (corrections after creates). One correction to the proposal: persist the *JSON request bodies* (the actual wire format), not raw SQL text — SQL would add a second parser that bypasses the validation layering for zero benefit. Recommendation: keep this gate as-is for pilot; confirm real field need via §8 Q-D first; if confirmed, build Outbox v2 as its own PLAN+MILESTONES chain. Decision pending Q-D answer.

---

## G5 — Production drill, then supervised pilot (mechanics exist, rehearsal does not)

**Problem (detail).** Everything needed for deployment exists on paper — `npm run build:deploy` mirror step, cPanel guides, setup/seed scripts, backup/restore endpoints (all green in the endpoint suite), production gates mostly VERIFIED — but nobody has rehearsed it on the real host in this session: no deploy, no backup-taken-and-restored drill, no credential/seed discipline check (no-credentials-in-git, initial-password rotation, `mustChangePassword` first-login). Paper-ready is not production-ready.

**Root cause.** Verification so far is local (Vite + PHP + MySQL on one machine). Hosting-specific behavior (paths, permissions, PHP versions, cron, backups) is unverified by construction.

**What we actually lack.** (i) One real deploy to the host; (ii) one backup-taken, wiped, and restored rehearsal *on the host*; (iii) a credential handoff record (initial passwords shown once, rotated on first login, nothing in git); (iv) a named pilot branch with supervision.

**What we need.** In order: deploy → backup/restore drill with checksums matching → credential handoff per USER_PROVISIONING D4 → supervised pilot on one branch with real-but-small data and daily backup verification → full rollout only after the pilot's issues log stays empty for an agreed period.

**Example.** The endpoint suite proves restore *replaces* rather than merges (branchA wiped, counts verified) — but that proof ran against XAMPP MySQL, not the host's database, where permissions and versions may differ.

**Owner:** user/team (drill + pilot); hosting contact (access + cron).
**Acceptance:** dated drill evidence (checksums match), credential record without secrets, pilot branch named, pilot exit criteria agreed.

---

## 8. Client-round questions (outside current resources — user to ask)

- **Q-A (G0):** "SPP and honor never affect each other; late tuition never reduces honor — the company absorbs timing risk. Acknowledge?" *(Points at G0 statement.)*
- **Q-B (G1):** "Who owns the field data and can sign that `SD Al-Irham` = `SD Al-Irhaam` (and each alias row)? If any pair is two schools, which?" *(Points at `EXEMPLAR_F6_CONFIRM.md`.)*
- **Q-C (G3):** "Can you provide one real example each of: an installment payment, a carry-over/credit month, and a partial honor payout? If none exist, do you accept those paths as unverified for now?"
- **Q-D (G4):** "Does anyone enter data where there is no signal? If yes, where — and is 'keep the paper, retry on signal' acceptable, or must offline capture come back?"
- **Q-E (G3/F12):** "Invoice follow-ups (receiver, WA, send/follow-up dates): should the app track these, or does your spreadsheet stay canonical?"
- **Q-F (G5):** "Which branch pilots first, and how long must its issues log stay empty before full rollout? Who is the hosting contact for deploy + backups?"
- **Q-G (open):** "Any billing, payout, or attendance reality that never appears in the exemplar sheets — discounts, fines, advances, mid-month transfers, leavers with unpaid honor?"

## 9. Close contract

A gate closes only when its acceptance line carries names + dates. Closing G2/G5 appends evidence to `DRIFT_CLOSE_MILESTONES.md` DC.E.1; closing G1 writes back to `EXEMPLAR_MIGRATION.md` F6 per `EXEMPLAR_F6_CONFIRM.md` §4; closing G0/G3/G4 records acknowledgments here. No gate may be closed by editing prose alone — each needs its cited evidence or signature.
