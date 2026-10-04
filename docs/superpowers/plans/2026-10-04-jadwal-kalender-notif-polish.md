# Jadwal-Kalender-Notif Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the existing Harian/Mingguan/Kalender hub + in-app H-1/H-day bell so done-flags are correct, export covers the visible view, and bell items land on the right date.

**Architecture:** Client-only derivation, no new entity/endpoint. `remindersForTrainer` gains an `absensiPengajar` lane with legacy fallback; `PenugasanTimetable` lifts the Harian-only CSV gate to `rowsByDate`; `NotificationBell onOpenJadwal` gains `{iso, view}` context consumed by `App.setActiveTab` + `kalenderNonce` remount.

**Tech Stack:** React 19 + Vite 6, Vitest 4 (unit), Playwright 1.62 (temp E2E only), Tailwind 4 (reuse verbatim classes only).

**Spec:** `docs/superpowers/specs/2026-10-04-jadwal-kalender-notif-polish-design.md` — the plan argues from the spec, so the spec travels with it; executors read both.

## Global Constraints

- No new table/entity/endpoint/dependency; no `notif*`, no cron, no WA/FCM (spec D1).
- Copy stays Indonesian so tests can select by role/name (`Tidak ada sekolah terjadwal hari ini/besok`, `Unduh CSV`, `Lihat Jadwal`).
- Mirror existing idiom verbatim; do not invent colors/fonts/icons (taste #11); Kalender icon reuses Jadwal path.
- Local wall-clock only (`new Date(y,m,d)`), never UTC/`toISOString` for H-day/H-1.
- RBAC: server stays authoritative (taste #61); bell/timetable never grant write; trainer sees own scope only.
- Numeric/date test data is dynamic (current month/week), never hardcoded dates (testing taste #6).
- Temp E2E specs are removed after green; only unit test extension persists.

## Review Focus

- Eksternal `done` recorded by another trainer via `dicatatOleh` still shows Selesai for the owner — expect OR across recorder ids.
- Legacy `absensi` row exists but no `absensiPengajar` row — expect still Selesai during 1-release fallback window.
- `jadwalList: []` or malformed entry — expect empty lists, no throw.
- Mingguan CSV opened in Excel — expect `Tanggal` column per row matching the stacked tbody dates, BOM + quoting intact.
- Bell “Besok” clicked at 23:55 WIB — expect landing on tomorrow’s ISO, not a UTC-shifted day.

---

### Task 1: Done flag from absensiPengajar (+ legacy fallback)

**Files:**
- Modify: `src/lib/reminders.js:29-62`
- Modify: `src/components/NotificationBell.jsx:56-91`
- Modify: `src/features/auth/TrainerDashboard.jsx:70-78`
- Test: `src/lib/__tests__/reminders.test.js`

**Interfaces:**
- Consumes: `penugasanInvolvesTrainer(a, trainerId)`, `formatJadwalList(list)`, `localDateString(d)` — unchanged.
- Produces: `remindersForTrainer({trainerId, sekolah, trainer, absensi, absensiPengajar, nowLocal}) -> {today:[{sekolahId,nama,waktu,done}], tomorrow:[...], counts:{todayUndone,tomorrow,total}}` — new optional `absensiPengajar` array; `done` = `absensiPengajar.some(tanggal===todayISO && sekolahId && involvesTrainer) || absensi.some(same)`.

- [ ] **Step 1: Write the failing tests**

```js
it('marks done from absensiPengajar internal row', () => {
  const { nowLocal, todayName, todayISO } = dayFixture()
  const trainer = { id: 'trn-1', sekolahIds: ['skl-today'], penugasanPengajar: [] }
  const sekolah = [{ id: 'skl-today', nama: 'SD Hari Ini', jadwalList: [{ dayOfWeek: todayName, time: '14:00' }] }]
  const absensiPengajar = [{ tanggal: todayISO, sekolahId: 'skl-today', trainerId: 'trn-1' }]
  const out = remindersForTrainer({ trainerId: 'trn-1', sekolah, trainer, absensi: [], absensiPengajar, nowLocal })
  expect(out.today[0].done).toBe(true)
})
```

Add three more: eksternal row (`trainerId: 'ext-1'` + `dicatatOleh: 'trn-1'`, owner `trn-1` still done via `penugasanInvolvesTrainer`), legacy fallback (`absensi` only → done true), and WIB boundary (`nowLocal = new Date(2026, 9, 4, 0, 30)` still resolves todayName/todayISO by wall-clock, not UTC).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/reminders.test.js -v`
Expected: FAIL with `absensiPengajar is not defined` / `done false`.

- [ ] **Step 3: Implement `remindersForTrainer` lane in `src/lib/reminders.js`**

Add optional param `absensiPengajar = []`; compute `todayISO` as today; `done = ledgerPengajar.some(...) || ledger.some(...)` where pengajar match checks `a.tanggal===todayISO && a.sekolahId===s.id && (a.trainerId===trainerId || penugasanInvolvesTrainer(a, trainerId))`. Keep `jadwalList` guard and wall-clock H-1 untouched.

- [ ] **Step 4: Wire callers to pass the cache**

In `NotificationBell.jsx computeReminders`: `readCached('absensiPengajar')` alongside `absensi`, pass through both lanes (trainer + `aggregateForTrainers`). In `TrainerDashboard.jsx`: `readCached('absensiPengajar')` (or existing cached var) into same `done` expression with identical OR.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/reminders.test.js -v`
Expected: PASS (8 tests: 4 existing + 4 new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/reminders.js src/components/NotificationBell.jsx src/features/auth/TrainerDashboard.jsx src/lib/__tests__/reminders.test.js
git commit -m "feat: reminders done from absensiPengajar with legacy fallback"
```

### Task 2: CSV/print parity for visible view

**Files:**
- Modify: `src/features/penugasan/PenugasanTimetable.jsx:242-254,313-320`
- Test: temp `tests/jadwal-csv-parity.tmp.spec.js` (removed after green)

**Interfaces:**
- Consumes: `rowsByDate: {[iso]: Row[]}`, `visibleDates: string[]`, `exportJadwalPenugasanCSV(displayRows, tanggal)` — `displayRows: [{sekolah,trainer,asisten,waktu}]`, CSV already appends `Tanggal` column per row (`csv.js:130-136`).
- Produces: `displayRowsForView` — Harian keeps `(displayRows, tanggal)`; Mingguan/Kalender passes flatMap `visibleDates.flatMap(iso => rowsByDate[iso].map(r => ({...row, tanggal: iso})))` with filename label `weekStart_s.d._weekEnd` / month label.

- [ ] **Step 1: Write the failing temp spec**

```js
test('mingguan CSV mirrors stacked rows with Tanggal', async ({ page }) => {
  await page.goto('/?tab=jadwalPenugasan&view=mingguan')
  await expect(page.getByRole('button', { name: 'Unduh CSV' })).toBeVisible()
})
```

Plus download event assert: CSV content contains `Tanggal` header and one line per rendered `tbody[data-tanggal]` row.

- [ ] **Step 2: Run temp spec to verify it fails**

Run: `npx playwright test tests/jadwal-csv-parity.tmp.spec.js --project=chromium`
Expected: FAIL — button hidden when `view !== 'harian'`.

- [ ] **Step 3: Lift the Harian-only gate in `PenugasanTimetable.jsx`**

Remove `{view === 'harian' && ...}` around Unduh CSV; build `displayRowsForView` from `rows` (harian) or `allVisibleRows` with per-iso `tanggal`; call existing `exportJadwalPenugasanCSV(displayRowsForView, label)` where label = `tanggal` / `${weekStart}_s.d._${weekEnd}` / month ISO. Keep `PrintButton` + `printable-report` on the active view container; no new styles.

- [ ] **Step 4: Run temp spec to verify it passes, then delete it**

Run: `npx playwright test tests/jadwal-csv-parity.tmp.spec.js --project=chromium`
Expected: PASS, zero `pageerror`. Then: `Remove-Item tests/jadwal-csv-parity.tmp.spec.js`.

- [ ] **Step 5: Commit**

```bash
git add src/features/penugasan/PenugasanTimetable.jsx
git commit -m "feat: jadwal CSV covers mingguan and kalender visible rows"
```

### Task 3: Bell deep-link with date context

**Files:**
- Modify: `src/components/NotificationBell.jsx:203-211`
- Modify: `src/App.jsx:235-249,361,380`
- Test: temp `tests/bell-deeplink.tmp.spec.js` (removed after green)

**Interfaces:**
- Consumes: `onOpenJadwal?(ctx: {iso: string, view: 'harian'|'mingguan'|'kalender'})` — bell passes the clicked entry’s ISO + originating view.
- Produces: `App.setActiveTab('jadwalPenugasan', ctx)` — sets `tanggal` + `jadwalView` + `kalenderNonce++` remount; highlight stays on Jadwal Penugasan; mobile drawer closes.

- [ ] **Step 1: Write the failing temp spec**

```js
test('bell Besok lands on correct date view', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Notifikasi' }).click()
  await page.getByRole('button', { name: 'Lihat Jadwal' }).click()
  await expect(page.getByText(/Jadwal Penugasan/)).toBeVisible()
})
```

Extend: click a tomorrow entry asserts URL/state `jadwalView` + highlighted `data-testid=kalender-hari[data-tanggal=<tomorrowISO>]`.

- [ ] **Step 2: Run temp spec to verify it fails**

Run: `npx playwright test tests/bell-deeplink.tmp.spec.js --project=chromium`
Expected: FAIL — lands on generic tab without date context.

- [ ] **Step 3: Implement `ctx` threading**

Bell: tomorrow/today row click calls `onOpenJadwal({iso: e.tanggal ?? tomorrowISO, view: 'harian'})`; `Lihat Jadwal` passes current anchor. App: `setActiveTab('jadwalPenugasan', ctx)` sets `uiState {activeTab, jadwalView: ctx.view ?? 'harian'}` + internal `tanggal` state + `setKalenderNonce(n+1)`; `withKalenderShortcut` + `openDayInHarian` reused; no new route/id.

- [ ] **Step 4: Run temp spec to verify it passes, then delete it**

Run: `npx playwright test tests/bell-deeplink.tmp.spec.js --project=chromium`
Expected: PASS, zero `pageerror`. Then: `Remove-Item tests/bell-deeplink.tmp.spec.js`.

- [ ] **Step 5: Final gate + commit**

Run: `npm run build`
Expected: clean build, no new warnings.

```bash
git add src/components/NotificationBell.jsx src/App.jsx
git commit -m "feat: bell deep-links to dated jadwal view"
```
