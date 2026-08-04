import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";

/* =========================================================================
   AFTERSCHOLA — ADMIN DASHBOARD
   Single-file implementation of the plan in Part 1–6 of the roadmap.

   Persistence note: the spec (D7) calls for LocalStorage, but LocalStorage
   is unavailable inside this artifact sandbox. We use the artifact
   persistent-storage API (window.storage) instead — it is per-user and
   survives refresh/reopen the same way LocalStorage would, and the JSON
   backup/restore feature (D8/M3) is unaffected either way since it works
   off exported files, not the storage mechanism itself.
   ========================================================================= */

/* ---------------------------- constants ---------------------------- */

const MONTH_NAMES = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const ACADEMIC_MONTH_ORDER = [7,8,9,10,11,12,1,2,3,4,5,6];
const DATA_KEY = "afterschola:data";
const UI_KEY = "afterschola:ui";
const BACKUP_VERSION = 2;

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function pad2(n) { return String(n).padStart(2, "0"); }

// Calendar year that a given month-number falls in, for academic year starting A (July).
function calYear(monthNum, yearStart) {
  return monthNum >= 7 ? yearStart : yearStart + 1;
}

function periodeKeyFromParts(calendarYear, monthNum) {
  return `${calendarYear}-${pad2(monthNum)}`;
}

function periodeFromDate(tanggal) {
  return (tanggal || "").slice(0, 7);
}

function currentPeriod() {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  const yearStart = m >= 7 ? y : y - 1;
  return { yearStart, month: m };
}

function formatRupiah(n) {
  const v = Number(n) || 0;
  return "Rp " + new Intl.NumberFormat("id-ID").format(v);
}

function parseRupiahInput(str) {
  const digits = String(str).replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

function normalizeWA(raw) {
  let digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  else if (!digits.startsWith("62")) digits = "62" + digits;
  return digits;
}

function waLink(wa, text) {
  return `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
}

/* ---------------------------- factories (Part 2 contract) ---------------------------- */

function newSekolah() {
  return { id: uid("sek"), nama: "", alamat: "", foto: "", jadwal: "", spp: 0, trainerIds: [] };
}
function newTrainer() {
  return { id: uid("tr"), nama: "", wa: "", jadwal: "", sekolahIds: [], honor: 0 };
}
function newSiswa() {
  return { id: uid("sis"), nama: "", wa: "", kelas: "", sekolahId: "", sekolahNama: "", foto: "", sppLunas: {} };
}

function emptyData() {
  return {
    sekolah: [],
    trainer: [],
    siswa: [],
    absensi: [],
    honorPayments: [],
    settings: { logoUrl: "", title: "Afterschola" },
  };
}

/* ---------------------------- inverse-array sync (Part 2, rule 1) ---------------------------- */

function syncInverseOnSchoolSave(savedSekolah, allSekolah, allTrainer) {
  const trainers = allTrainer.map((t) => ({ ...t, sekolahIds: [...t.sekolahIds] }));
  for (const t of trainers) {
    const shouldHave = savedSekolah.trainerIds.includes(t.id);
    const has = t.sekolahIds.includes(savedSekolah.id);
    if (shouldHave && !has) t.sekolahIds.push(savedSekolah.id);
    if (!shouldHave && has) t.sekolahIds = t.sekolahIds.filter((id) => id !== savedSekolah.id);
  }
  return trainers;
}

function syncInverseOnTrainerSave(savedTrainer, allSekolah) {
  const schools = allSekolah.map((s) => ({ ...s, trainerIds: [...s.trainerIds] }));
  for (const s of schools) {
    const shouldHave = savedTrainer.sekolahIds.includes(s.id);
    const has = s.trainerIds.includes(savedTrainer.id);
    if (shouldHave && !has) s.trainerIds.push(savedTrainer.id);
    if (!shouldHave && has) s.trainerIds = s.trainerIds.filter((id) => id !== savedTrainer.id);
  }
  return schools;
}

/* ---------------------------- finance engine ---------------------------- */

function computeFinance(data, periode) {
  const { sekolah, siswa, absensi, honorPayments, trainer } = data;
  const sekolahById = Object.fromEntries(sekolah.map((s) => [s.id, s]));

  let potensi = 0;
  let pemasukan = 0;
  for (const s of siswa) {
    const sek = sekolahById[s.sekolahId];
    const spp = sek ? Number(sek.spp) || 0 : 0;
    potensi += spp;
    if (s.sppLunas && s.sppLunas[periode]) pemasukan += spp;
  }
  const belumTertagih = potensi - pemasukan;

  // sessions attended (Hadir) per trainer this periode
  const sessionsByTrainer = {};
  for (const a of absensi) {
    if (a.periode !== periode) continue;
    if (a.trainerStatus !== "Hadir") continue;
    sessionsByTrainer[a.trainerId] = (sessionsByTrainer[a.trainerId] || 0) + 1;
  }
  const trainerById = Object.fromEntries(trainer.map((t) => [t.id, t]));
  let bebanHonor = 0;
  const bebanByTrainer = {};
  for (const [tid, count] of Object.entries(sessionsByTrainer)) {
    const rate = trainerById[tid] ? Number(trainerById[tid].honor) || 0 : 0;
    const beban = count * rate;
    bebanByTrainer[tid] = beban;
    bebanHonor += beban;
  }

  const dibayarByTrainer = {};
  let dibayarHonor = 0;
  for (const p of honorPayments) {
    if (p.periode !== periode) continue;
    dibayarByTrainer[p.trainerId] = (dibayarByTrainer[p.trainerId] || 0) + Number(p.nominal || 0);
    dibayarHonor += Number(p.nominal || 0);
  }

  const sisaKewajiban = bebanHonor - dibayarHonor;
  const labaRugi = pemasukan - dibayarHonor;

  return {
    potensi, pemasukan, belumTertagih, bebanHonor, dibayarHonor, sisaKewajiban, labaRugi,
    sessionsByTrainer, bebanByTrainer, dibayarByTrainer,
  };
}

function trainerFinanceRow(data, periode, trainerId) {
  const f = computeFinance(data, periode);
  const sesi = f.sessionsByTrainer[trainerId] || 0;
  const beban = f.bebanByTrainer[trainerId] || 0;
  const dibayar = f.dibayarByTrainer[trainerId] || 0;
  return { sesi, beban, dibayar, sisa: beban - dibayar };
}

/* ---------------------------- CSV helpers ---------------------------- */

function toCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

function downloadFile(filename, content, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------------------------- small UI atoms ---------------------------- */

const COLORS = {
  primary: "#0F5257",
  primaryDark: "#0A3A3E",
  accent: "#F2A007",
  bg: "#F6F7F5",
  card: "#FFFFFF",
  ink: "#1C2A2B",
  sub: "#5B6B6C",
  line: "#E3E7E4",
  danger: "#C24A3E",
  good: "#2F7D5E",
};

function Btn({ children, onClick, variant = "primary", type = "button", disabled, className = "", title }) {
  const base = "px-3.5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const styles = {
    primary: { backgroundColor: COLORS.primary, color: "white" },
    accent: { backgroundColor: COLORS.accent, color: COLORS.primaryDark },
    ghost: { backgroundColor: "transparent", color: COLORS.primary, border: `1px solid ${COLORS.line}` },
    danger: { backgroundColor: "transparent", color: COLORS.danger, border: `1px solid ${COLORS.danger}55` },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${className}`} style={styles[variant]}>
      {children}
    </button>
  );
}

function Card({ children, className = "", style = {} }) {
  return (
    <div className={`rounded-xl p-4 ${className}`} style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.line}`, ...style }}>
      {children}
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium mb-1" style={{ color: COLORS.sub }}>{label}</span>
      {children}
      {hint && <span className="block text-[11px] mt-1" style={{ color: COLORS.sub }}>{hint}</span>}
    </label>
  );
}

const inputStyle = { border: `1px solid ${COLORS.line}`, backgroundColor: "white" };
const inputCls = "w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-2";

function Modal({ title, onClose, children, width = "max-w-md" }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "#0A2E2F88" }}>
      <div className={`w-full ${width} rounded-2xl p-5 max-h-[90vh] overflow-y-auto`} style={{ backgroundColor: COLORS.card }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-base" style={{ color: COLORS.ink }}>{title}</h3>
          <button onClick={onClose} className="text-sm px-2 py-1 rounded" style={{ color: COLORS.sub }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = "Ya, lanjutkan" }) {
  return (
    <Modal title="Konfirmasi" onClose={onCancel} width="max-w-sm">
      <p className="text-sm mb-5" style={{ color: COLORS.ink }}>{message}</p>
      <div className="flex justify-end gap-2">
        <Btn variant="ghost" onClick={onCancel}>Batal</Btn>
        <Btn variant="primary" onClick={onConfirm}>{confirmLabel}</Btn>
      </div>
    </Modal>
  );
}

function Toast({ text, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [text]);
  if (!text) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-lg text-sm text-white shadow-lg" style={{ backgroundColor: COLORS.primaryDark }}>
      {text}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="py-14 text-center text-sm" style={{ color: COLORS.sub }}>
      {text}
    </div>
  );
}

/* ---------------------------- period picker ---------------------------- */

function PeriodPicker({ period, setPeriod, compact }) {
  const years = [];
  const base = currentPeriod().yearStart;
  for (let y = base - 2; y <= base + 3; y++) years.push(y);
  return (
    <div className={`flex gap-2 ${compact ? "" : "flex-col sm:flex-row"}`}>
      <select
        value={period.yearStart}
        onChange={(e) => setPeriod((p) => ({ ...p, yearStart: Number(e.target.value) }))}
        className={inputCls} style={{ ...inputStyle, width: compact ? 110 : undefined }}
      >
        {years.map((y) => <option key={y} value={y}>{y}/{y + 1}</option>)}
      </select>
      <select
        value={period.month}
        onChange={(e) => setPeriod((p) => ({ ...p, month: Number(e.target.value) }))}
        className={inputCls} style={{ ...inputStyle, width: compact ? 130 : undefined }}
      >
        {ACADEMIC_MONTH_ORDER.map((m) => <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>)}
      </select>
    </div>
  );
}

/* =========================================================================
   MAIN APP
   ========================================================================= */

const NAV = [
  { id: "overview", label: "Ringkasan", icon: "◧" },
  { id: "sekolah", label: "Sekolah", icon: "🏫" },
  { id: "siswa", label: "Siswa", icon: "🎓" },
  { id: "trainer", label: "Trainer", icon: "🧑‍🏫" },
  { id: "absensi", label: "Absensi", icon: "📝" },
  { id: "riwayat", label: "Riwayat Absensi", icon: "🕘" },
  { id: "pembayaran", label: "Pembayaran", icon: "💵" },
  { id: "keuangan", label: "Keuangan", icon: "📊" },
  { id: "tunggakan", label: "Tunggakan", icon: "📣" },
  { id: "settings", label: "Pengaturan", icon: "⚙️" },
];

export default function App() {
  const [data, setData] = useState(emptyData());
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [period, setPeriod] = useState(currentPeriod());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");
  const saveTimer = useRef(null);

  const periode = periodeKeyFromParts(calYear(period.month, period.yearStart), period.month);

  // ---- load persisted state on mount ----
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(DATA_KEY, false);
        if (res && res.value) setData({ ...emptyData(), ...JSON.parse(res.value) });
      } catch (e) { /* first run: no data yet */ }
      try {
        const ui = await window.storage.get(UI_KEY, false);
        if (ui && ui.value) {
          const parsed = JSON.parse(ui.value);
          if (parsed.activeTab) setActiveTab(parsed.activeTab);
          if (parsed.period) setPeriod(parsed.period);
        }
      } catch (e) { /* no ui state yet */ }
      setLoaded(true);
    })();
  }, []);

  // ---- persist data (debounced) ----
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      window.storage.set(DATA_KEY, JSON.stringify(data), false).catch(() => {});
    }, 300);
    return () => clearTimeout(saveTimer.current);
  }, [data, loaded]);

  // ---- persist ui state ----
  useEffect(() => {
    if (!loaded) return;
    window.storage.set(UI_KEY, JSON.stringify({ activeTab, period }), false).catch(() => {});
  }, [activeTab, period, loaded]);

  const notify = useCallback((msg) => setToast(msg), []);

  const ctx = { data, setData, period, setPeriod, periode, notify };

  const activeNav = NAV.find((n) => n.id === activeTab) || NAV[0];

  return (
    <div className="min-h-screen w-full flex" style={{ backgroundColor: COLORS.bg, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r" style={{ borderColor: COLORS.line, backgroundColor: COLORS.card }}>
        <SidebarContent activeTab={activeTab} setActiveTab={setActiveTab} data={data} period={period} setPeriod={setPeriod} />
      </aside>

      {/* Sidebar (mobile drawer) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72" style={{ backgroundColor: COLORS.card }}>
            <SidebarContent activeTab={activeTab} setActiveTab={(t) => { setActiveTab(t); setSidebarOpen(false); }} data={data} period={period} setPeriod={setPeriod} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b" style={{ borderColor: COLORS.line, backgroundColor: COLORS.card }}>
          <div className="flex items-center gap-3 min-w-0">
            <button className="md:hidden text-lg" onClick={() => setSidebarOpen(true)}>☰</button>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide" style={{ color: COLORS.sub }}>{activeNav.icon} {activeNav.label}</div>
              <div className="text-sm font-medium truncate" style={{ color: COLORS.ink }}>Periode aktif: {MONTH_NAMES[period.month - 1]} {periode.slice(0,4)} <span style={{ color: COLORS.sub }}>({period.yearStart}/{period.yearStart+1})</span></div>
            </div>
          </div>
          <div className="md:hidden">
            <PeriodPicker period={period} setPeriod={setPeriod} compact />
          </div>
        </header>

        <main className="flex-1 min-w-0 p-4 md:p-6 overflow-x-hidden">
          {!loaded ? (
            <div className="py-20 text-center text-sm" style={{ color: COLORS.sub }}>Memuat data…</div>
          ) : (
            <>
              {activeTab === "overview" && <OverviewView {...ctx} />}
              {activeTab === "sekolah" && <SekolahView {...ctx} />}
              {activeTab === "siswa" && <SiswaView {...ctx} />}
              {activeTab === "trainer" && <TrainerView {...ctx} />}
              {activeTab === "absensi" && <AbsensiView {...ctx} loadRecord={null} />}
              {activeTab === "riwayat" && <RiwayatView {...ctx} goToAbsensi={setActiveTab} />}
              {activeTab === "pembayaran" && <PembayaranView {...ctx} />}
              {activeTab === "keuangan" && <KeuanganView {...ctx} />}
              {activeTab === "tunggakan" && <TunggakanView {...ctx} />}
              {activeTab === "settings" && <SettingsView {...ctx} />}
            </>
          )}
        </main>
      </div>

      <Toast text={toast} onDone={() => setToast("")} />
    </div>
  );
}

function SidebarContent({ activeTab, setActiveTab, data, period, setPeriod }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-5 py-5">
        {data.settings.logoUrl ? (
          <img src={data.settings.logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: COLORS.primary }}>A</div>
        )}
        <div className="font-semibold text-sm" style={{ color: COLORS.ink }}>{data.settings.title || "Afterschola"}</div>
      </div>
      <div className="px-5 pb-4">
        <div className="text-[11px] uppercase tracking-wide mb-1.5" style={{ color: COLORS.sub }}>Periode</div>
        <PeriodPicker period={period} setPeriod={setPeriod} />
      </div>
      <nav className="flex-1 overflow-y-auto px-2">
        {NAV.map((n) => {
          const active = n.id === activeTab;
          return (
            <button
              key={n.id}
              onClick={() => setActiveTab(n.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm mb-0.5 text-left transition-colors"
              style={{
                backgroundColor: active ? COLORS.primary : "transparent",
                color: active ? "white" : COLORS.ink,
                fontWeight: active ? 600 : 500,
              }}
            >
              <span>{n.icon}</span>{n.label}
            </button>
          );
        })}
      </nav>
      <div className="px-5 py-4 text-[11px]" style={{ color: COLORS.sub }}>
        Data tersimpan otomatis. Cadangkan berkala lewat Pengaturan.
      </div>
    </div>
  );
}

/* =========================================================================
   OVERVIEW
   ========================================================================= */

function OverviewView({ data, period, periode }) {
  const f = computeFinance(data, periode);

  // trend across the academic year
  const trend = ACADEMIC_MONTH_ORDER.map((m) => {
    const cy = calYear(m, period.yearStart);
    const p = periodeKeyFromParts(cy, m);
    const fm = computeFinance(data, p);
    return { label: MONTH_NAMES[m - 1].slice(0, 3), pemasukan: fm.pemasukan, dibayar: fm.dibayarHonor, beban: fm.bebanHonor };
  });
  const maxVal = Math.max(1, ...trend.map((t) => Math.max(t.pemasukan, t.dibayar, t.beban)));

  const collectionRate = f.potensi > 0 ? Math.round((f.pemasukan / f.potensi) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Pemasukan (kas)" value={formatRupiah(f.pemasukan)} tone="good" />
        <StatCard label="Honor dibayar (kas)" value={formatRupiah(f.dibayarHonor)} tone="danger" />
        <StatCard label="Laba/Rugi (kas)" value={formatRupiah(f.labaRugi)} tone={f.labaRugi >= 0 ? "good" : "danger"} big />
        <StatCard label="Sisa kewajiban honor (memo)" value={formatRupiah(f.sisaKewajiban)} tone="muted" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>Tren bulanan — tahun ajaran {period.yearStart}/{period.yearStart + 1}</div>
          <svg viewBox="0 0 720 220" className="w-full h-52">
            {trend.map((t, i) => {
              const gw = 720 / trend.length;
              const x = i * gw + 8;
              const bw = (gw - 16) / 3;
              const hP = (t.pemasukan / maxVal) * 160;
              const hD = (t.dibayar / maxVal) * 160;
              const hB = (t.beban / maxVal) * 160;
              return (
                <g key={i}>
                  <rect x={x} y={180 - hP} width={bw} height={hP} fill={COLORS.good} rx="2" />
                  <rect x={x + bw} y={180 - hD} width={bw} height={hD} fill={COLORS.danger} rx="2" />
                  <rect x={x + bw * 2} y={180 - hB} width={bw} height={hB} fill={COLORS.line} rx="2" />
                  <text x={x + bw * 1.5} y="198" fontSize="9" textAnchor="middle" fill={COLORS.sub}>{t.label}</text>
                </g>
              );
            })}
          </svg>
          <div className="flex gap-4 text-[11px] mt-1" style={{ color: COLORS.sub }}>
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ backgroundColor: COLORS.good }} />Pemasukan</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ backgroundColor: COLORS.danger }} />Honor dibayar</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ backgroundColor: COLORS.line, border: `1px solid ${COLORS.sub}` }} />Beban (memo)</span>
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>Tingkat penagihan SPP</div>
          <div className="flex items-center justify-center py-2">
            <svg viewBox="0 0 100 100" className="w-32 h-32">
              <circle cx="50" cy="50" r="40" fill="none" stroke={COLORS.line} strokeWidth="14" />
              <circle
                cx="50" cy="50" r="40" fill="none" stroke={COLORS.primary} strokeWidth="14"
                strokeDasharray={`${(collectionRate / 100) * 251.2} 251.2`}
                strokeLinecap="round" transform="rotate(-90 50 50)"
              />
              <text x="50" y="55" textAnchor="middle" fontSize="18" fontWeight="700" fill={COLORS.ink}>{collectionRate}%</text>
            </svg>
          </div>
          <div className="text-xs text-center" style={{ color: COLORS.sub }}>{formatRupiah(f.pemasukan)} dari potensi {formatRupiah(f.potensi)}</div>
        </Card>
      </div>

      <Card>
        <div className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>Per sekolah — periode ini</div>
        {data.sekolah.length === 0 ? <EmptyState text="Belum ada sekolah." /> : (
          <div className="space-y-2">
            {data.sekolah.map((s) => {
              const siswaSekolah = data.siswa.filter((sw) => sw.sekolahId === s.id);
              const bayar = siswaSekolah.filter((sw) => sw.sppLunas && sw.sppLunas[periode]).length;
              const pct = siswaSekolah.length ? Math.round((bayar / siswaSekolah.length) * 100) : 0;
              return (
                <div key={s.id}>
                  <div className="flex justify-between text-xs mb-1" style={{ color: COLORS.sub }}>
                    <span>{s.nama || "(tanpa nama)"}</span>
                    <span>{bayar}/{siswaSekolah.length} lunas</span>
                  </div>
                  <div className="w-full h-2 rounded-full" style={{ backgroundColor: COLORS.line }}>
                    <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: COLORS.primary }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone, big }) {
  const color = { good: COLORS.good, danger: COLORS.danger, muted: COLORS.sub }[tone] || COLORS.ink;
  return (
    <Card>
      <div className="text-[11px] mb-1" style={{ color: COLORS.sub }}>{label}</div>
      <div className={big ? "text-xl font-bold" : "text-base font-semibold"} style={{ color }}>{value}</div>
    </Card>
  );
}

/* =========================================================================
   SEKOLAH
   ========================================================================= */

function SekolahView({ data, setData, notify }) {
  const [editing, setEditing] = useState(null); // sekolah object or null
  const [reassign, setReassign] = useState(null); // { sekolah, siswaIds }
  const [confirmDelete, setConfirmDelete] = useState(null);

  const openNew = () => setEditing(newSekolah());

  const save = (form) => {
    const trainers = syncInverseOnSchoolSave(form, data.sekolah, data.trainer);
    const exists = data.sekolah.some((s) => s.id === form.id);
    const sekolah = exists ? data.sekolah.map((s) => (s.id === form.id ? form : s)) : [...data.sekolah, form];
    // rename cache refresh
    const siswa = data.siswa.map((sw) => (sw.sekolahId === form.id ? { ...sw, sekolahNama: form.nama } : sw));
    setData({ ...data, sekolah, trainer: trainers, siswa });
    setEditing(null);
    notify("Sekolah disimpan.");
  };

  const tryDelete = (s) => {
    const linked = data.siswa.filter((sw) => sw.sekolahId === s.id);
    if (linked.length > 0) {
      setReassign({ sekolah: s, siswaIds: [] });
    } else {
      setConfirmDelete(s);
    }
  };

  const doDelete = (s) => {
    const trainer = data.trainer.map((t) => ({ ...t, sekolahIds: t.sekolahIds.filter((id) => id !== s.id) }));
    setData({ ...data, sekolah: data.sekolah.filter((x) => x.id !== s.id), trainer });
    setConfirmDelete(null);
    notify("Sekolah dihapus.");
  };

  const doReassign = (targetSchoolId) => {
    const target = data.sekolah.find((s) => s.id === targetSchoolId);
    const siswa = data.siswa.map((sw) => (sw.sekolahId === reassign.sekolah.id ? { ...sw, sekolahId: targetSchoolId, sekolahNama: target?.nama || "" } : sw));
    const trainer = data.trainer.map((t) => ({ ...t, sekolahIds: t.sekolahIds.filter((id) => id !== reassign.sekolah.id) }));
    setData({ ...data, siswa, trainer, sekolah: data.sekolah.filter((s) => s.id !== reassign.sekolah.id) });
    setReassign(null);
    notify("Siswa dipindahkan, sekolah dihapus.");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold" style={{ color: COLORS.ink }}>Sekolah</h2>
        <Btn onClick={openNew}>+ Tambah sekolah</Btn>
      </div>

      {data.sekolah.length === 0 ? <EmptyState text="Belum ada sekolah. Tambahkan sekolah pertama." /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.sekolah.map((s) => {
            const jumlahSiswa = data.siswa.filter((sw) => sw.sekolahId === s.id).length;
            return (
              <Card key={s.id}>
                <div className="font-semibold text-sm mb-1" style={{ color: COLORS.ink }}>{s.nama || "(tanpa nama)"}</div>
                <div className="text-xs mb-2" style={{ color: COLORS.sub }}>{s.alamat || "Alamat belum diisi"}</div>
                <div className="text-xs mb-1" style={{ color: COLORS.sub }}>SPP: {formatRupiah(s.spp)}/bulan</div>
                <div className="text-xs mb-1" style={{ color: COLORS.sub }}>Jadwal: {s.jadwal || "-"}</div>
                <div className="text-xs mb-3" style={{ color: COLORS.sub }}>{jumlahSiswa} siswa · {s.trainerIds.length} trainer</div>
                <div className="flex gap-2">
                  <Btn variant="ghost" onClick={() => setEditing(s)}>Ubah</Btn>
                  <Btn variant="danger" onClick={() => tryDelete(s)}>Hapus</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <SekolahForm sekolah={editing} allTrainer={data.trainer} onCancel={() => setEditing(null)} onSave={save} />
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={`Hapus sekolah "${confirmDelete.nama || "(tanpa nama)"}"? Riwayat absensi & pembayaran tetap tersimpan.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => doDelete(confirmDelete)}
        />
      )}

      {reassign && (
        <Modal title={`Pindahkan siswa dari "${reassign.sekolah.nama}"`} onClose={() => setReassign(null)}>
          <p className="text-sm mb-3" style={{ color: COLORS.ink }}>
            Sekolah ini masih punya {data.siswa.filter((sw) => sw.sekolahId === reassign.sekolah.id).length} siswa. Pilih sekolah tujuan sebelum menghapus.
          </p>
          <Field label="Pindahkan semua siswa ke">
            <select id="reassign-target" className={inputCls} style={inputStyle} defaultValue="">
              <option value="" disabled>Pilih sekolah…</option>
              {data.sekolah.filter((s) => s.id !== reassign.sekolah.id).map((s) => (
                <option key={s.id} value={s.id}>{s.nama || "(tanpa nama)"}</option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2 mt-4">
            <Btn variant="ghost" onClick={() => setReassign(null)}>Batal</Btn>
            <Btn onClick={() => {
              const sel = document.getElementById("reassign-target").value;
              if (!sel) { notify("Pilih sekolah tujuan dulu."); return; }
              doReassign(sel);
            }}>Pindahkan &amp; hapus</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SekolahForm({ sekolah, allTrainer, onCancel, onSave }) {
  const [form, setForm] = useState(sekolah);
  const toggleTrainer = (id) => {
    setForm((f) => ({ ...f, trainerIds: f.trainerIds.includes(id) ? f.trainerIds.filter((x) => x !== id) : [...f.trainerIds, id] }));
  };
  return (
    <Modal title={sekolah.nama ? "Ubah sekolah" : "Tambah sekolah"} onClose={onCancel}>
      <Field label="Nama sekolah"><input className={inputCls} style={inputStyle} value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></Field>
      <Field label="Alamat"><input className={inputCls} style={inputStyle} value={form.alamat} onChange={(e) => setForm({ ...form, alamat: e.target.value })} /></Field>
      <Field label="Jadwal"><input className={inputCls} style={inputStyle} value={form.jadwal} onChange={(e) => setForm({ ...form, jadwal: e.target.value })} placeholder="mis. Senin & Kamis, 15:00" /></Field>
      <Field label="SPP per bulan (Rp)">
        <input className={inputCls} style={inputStyle} inputMode="numeric" min={0}
          value={form.spp ? new Intl.NumberFormat("id-ID").format(form.spp) : ""}
          onChange={(e) => setForm({ ...form, spp: parseRupiahInput(e.target.value) })} />
      </Field>
      <Field label="URL foto (opsional)"><input className={inputCls} style={inputStyle} value={form.foto} onChange={(e) => setForm({ ...form, foto: e.target.value })} /></Field>
      <Field label="Trainer di sekolah ini">
        {allTrainer.length === 0 ? <div className="text-xs" style={{ color: COLORS.sub }}>Belum ada trainer. Tambahkan trainer dulu.</div> : (
          <div className="flex flex-wrap gap-2">
            {allTrainer.map((t) => {
              const on = form.trainerIds.includes(t.id);
              return (
                <button key={t.id} type="button" onClick={() => toggleTrainer(t.id)}
                  className="px-2.5 py-1 rounded-full text-xs border"
                  style={{ backgroundColor: on ? COLORS.primary : "white", color: on ? "white" : COLORS.ink, borderColor: on ? COLORS.primary : COLORS.line }}>
                  {t.nama || "(tanpa nama)"}
                </button>
              );
            })}
          </div>
        )}
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Btn variant="ghost" onClick={onCancel}>Batal</Btn>
        <Btn onClick={() => onSave(form)} disabled={!form.nama.trim()}>Simpan</Btn>
      </div>
    </Modal>
  );
}

/* =========================================================================
   SISWA
   ========================================================================= */

function SiswaView({ data, setData, period, periode, notify }) {
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [filterSekolah, setFilterSekolah] = useState("");

  const openNew = () => setEditing(newSiswa());

  const save = (form) => {
    const sek = data.sekolah.find((s) => s.id === form.sekolahId);
    const withCache = { ...form, sekolahNama: sek ? sek.nama : "" };
    const exists = data.siswa.some((s) => s.id === form.id);
    const siswa = exists ? data.siswa.map((s) => (s.id === form.id ? withCache : s)) : [...data.siswa, withCache];
    setData({ ...data, siswa });
    setEditing(null);
    notify("Siswa disimpan.");
  };

  const doDelete = (s) => {
    setData({ ...data, siswa: data.siswa.filter((x) => x.id !== s.id) });
    setConfirmDelete(null);
    notify("Siswa dihapus.");
  };

  const list = data.siswa.filter((s) => !filterSekolah || s.sekolahId === filterSekolah);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold" style={{ color: COLORS.ink }}>Siswa</h2>
        <div className="flex gap-2">
          <select className={inputCls} style={inputStyle} value={filterSekolah} onChange={(e) => setFilterSekolah(e.target.value)}>
            <option value="">Semua sekolah</option>
            {data.sekolah.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
          <Btn onClick={openNew} disabled={data.sekolah.length === 0} title={data.sekolah.length === 0 ? "Tambahkan sekolah dulu" : ""}>+ Tambah siswa</Btn>
        </div>
      </div>

      {list.length === 0 ? <EmptyState text="Belum ada siswa." /> : (
        <Card className="!p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: COLORS.sub, borderBottom: `1px solid ${COLORS.line}` }}>
                <th className="px-3 py-2.5">Nama</th>
                <th className="px-3 py-2.5">Sekolah</th>
                <th className="px-3 py-2.5">Kelas</th>
                <th className="px-3 py-2.5">SPP {MONTH_NAMES[period.month - 1]}</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const lunas = !!(s.sppLunas && s.sppLunas[periode]);
                return (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${COLORS.line}` }}>
                    <td className="px-3 py-2.5" style={{ color: COLORS.ink }}>{s.nama || "(tanpa nama)"}</td>
                    <td className="px-3 py-2.5" style={{ color: COLORS.sub }}>{s.sekolahNama}</td>
                    <td className="px-3 py-2.5" style={{ color: COLORS.sub }}>{s.kelas}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => {
                          const sppLunas = { ...s.sppLunas };
                          if (lunas) delete sppLunas[periode]; else sppLunas[periode] = true;
                          setData({ ...data, siswa: data.siswa.map((x) => (x.id === s.id ? { ...x, sppLunas } : x)) });
                        }}
                        className="px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: lunas ? `${COLORS.good}22` : `${COLORS.danger}18`, color: lunas ? COLORS.good : COLORS.danger }}
                      >
                        {lunas ? "Lunas" : "Belum bayar"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button className="text-xs mr-3" style={{ color: COLORS.primary }} onClick={() => setEditing(s)}>Ubah</button>
                      <button className="text-xs" style={{ color: COLORS.danger }} onClick={() => setConfirmDelete(s)}>Hapus</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {editing && <SiswaForm siswa={editing} allSekolah={data.sekolah} onCancel={() => setEditing(null)} onSave={save} />}
      {confirmDelete && (
        <ConfirmDialog message={`Hapus siswa "${confirmDelete.nama}"?`} onCancel={() => setConfirmDelete(null)} onConfirm={() => doDelete(confirmDelete)} />
      )}
    </div>
  );
}

function SiswaForm({ siswa, allSekolah, onCancel, onSave }) {
  const [form, setForm] = useState(siswa);
  return (
    <Modal title={siswa.nama ? "Ubah siswa" : "Tambah siswa"} onClose={onCancel}>
      <Field label="Nama siswa"><input className={inputCls} style={inputStyle} value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></Field>
      <Field label="Sekolah">
        <select className={inputCls} style={inputStyle} value={form.sekolahId} onChange={(e) => setForm({ ...form, sekolahId: e.target.value })}>
          <option value="">Pilih sekolah…</option>
          {allSekolah.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
        </select>
      </Field>
      <Field label="Kelas"><input className={inputCls} style={inputStyle} value={form.kelas} onChange={(e) => setForm({ ...form, kelas: e.target.value })} /></Field>
      <Field label="No. WhatsApp orang tua" hint="Otomatis dinormalisasi ke format 62…">
        <input className={inputCls} style={inputStyle} value={form.wa} onChange={(e) => setForm({ ...form, wa: e.target.value })} placeholder="08xx…" />
      </Field>
      <Field label="URL foto (opsional)"><input className={inputCls} style={inputStyle} value={form.foto} onChange={(e) => setForm({ ...form, foto: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 mt-4">
        <Btn variant="ghost" onClick={onCancel}>Batal</Btn>
        <Btn onClick={() => onSave({ ...form, wa: normalizeWA(form.wa) })} disabled={!form.nama.trim() || !form.sekolahId}>Simpan</Btn>
      </div>
    </Modal>
  );
}

/* =========================================================================
   TRAINER
   ========================================================================= */

function TrainerView({ data, setData, notify }) {
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const openNew = () => setEditing(newTrainer());

  const save = (form) => {
    const sekolah = syncInverseOnTrainerSave(form, data.sekolah);
    const exists = data.trainer.some((t) => t.id === form.id);
    const trainer = exists ? data.trainer.map((t) => (t.id === form.id ? form : t)) : [...data.trainer, form];
    setData({ ...data, trainer, sekolah });
    setEditing(null);
    notify("Trainer disimpan.");
  };

  const doDelete = (t) => {
    const sekolah = data.sekolah.map((s) => ({ ...s, trainerIds: s.trainerIds.filter((id) => id !== t.id) }));
    setData({ ...data, trainer: data.trainer.filter((x) => x.id !== t.id), sekolah });
    setConfirmDelete(null);
    notify("Trainer dihapus. Riwayat absensi & pembayaran tetap tersimpan.");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold" style={{ color: COLORS.ink }}>Trainer</h2>
        <Btn onClick={openNew}>+ Tambah trainer</Btn>
      </div>

      {data.trainer.length === 0 ? <EmptyState text="Belum ada trainer." /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.trainer.map((t) => {
            const sekolahNames = t.sekolahIds.map((id) => data.sekolah.find((s) => s.id === id)?.nama).filter(Boolean);
            return (
              <Card key={t.id}>
                <div className="font-semibold text-sm mb-1" style={{ color: COLORS.ink }}>{t.nama || "(tanpa nama)"}</div>
                <div className="text-xs mb-1" style={{ color: COLORS.sub }}>Honor/sesi: {formatRupiah(t.honor)}</div>
                <div className="text-xs mb-1" style={{ color: COLORS.sub }}>WA: {t.wa || "-"}</div>
                <div className="text-xs mb-3" style={{ color: COLORS.sub }}>Sekolah: {sekolahNames.length ? sekolahNames.join(", ") : "-"}</div>
                <div className="flex gap-2">
                  <Btn variant="ghost" onClick={() => setEditing(t)}>Ubah</Btn>
                  <Btn variant="danger" onClick={() => setConfirmDelete(t)}>Hapus</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && <TrainerForm trainer={editing} allSekolah={data.sekolah} onCancel={() => setEditing(null)} onSave={save} />}
      {confirmDelete && (
        <ConfirmDialog message={`Hapus trainer "${confirmDelete.nama}"? Riwayat absensi & pembayaran tetap tersimpan dan tetap terhitung.`} onCancel={() => setConfirmDelete(null)} onConfirm={() => doDelete(confirmDelete)} />
      )}
    </div>
  );
}

function TrainerForm({ trainer, allSekolah, onCancel, onSave }) {
  const [form, setForm] = useState(trainer);
  const toggleSekolah = (id) => {
    setForm((f) => ({ ...f, sekolahIds: f.sekolahIds.includes(id) ? f.sekolahIds.filter((x) => x !== id) : [...f.sekolahIds, id] }));
  };
  return (
    <Modal title={trainer.nama ? "Ubah trainer" : "Tambah trainer"} onClose={onCancel}>
      <Field label="Nama trainer"><input className={inputCls} style={inputStyle} value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></Field>
      <Field label="No. WhatsApp" hint="Otomatis dinormalisasi ke format 62…">
        <input className={inputCls} style={inputStyle} value={form.wa} onChange={(e) => setForm({ ...form, wa: e.target.value })} placeholder="08xx…" />
      </Field>
      <Field label="Jadwal"><input className={inputCls} style={inputStyle} value={form.jadwal} onChange={(e) => setForm({ ...form, jadwal: e.target.value })} /></Field>
      <Field label="Honor per sesi (Rp)">
        <input className={inputCls} style={inputStyle} inputMode="numeric" min={0}
          value={form.honor ? new Intl.NumberFormat("id-ID").format(form.honor) : ""}
          onChange={(e) => setForm({ ...form, honor: parseRupiahInput(e.target.value) })} />
      </Field>
      <Field label="Mengajar di sekolah">
        {allSekolah.length === 0 ? <div className="text-xs" style={{ color: COLORS.sub }}>Belum ada sekolah.</div> : (
          <div className="flex flex-wrap gap-2">
            {allSekolah.map((s) => {
              const on = form.sekolahIds.includes(s.id);
              return (
                <button key={s.id} type="button" onClick={() => toggleSekolah(s.id)}
                  className="px-2.5 py-1 rounded-full text-xs border"
                  style={{ backgroundColor: on ? COLORS.primary : "white", color: on ? "white" : COLORS.ink, borderColor: on ? COLORS.primary : COLORS.line }}>
                  {s.nama || "(tanpa nama)"}
                </button>
              );
            })}
          </div>
        )}
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Btn variant="ghost" onClick={onCancel}>Batal</Btn>
        <Btn onClick={() => onSave({ ...form, wa: normalizeWA(form.wa) })} disabled={!form.nama.trim()}>Simpan</Btn>
      </div>
    </Modal>
  );
}

/* =========================================================================
   ABSENSI (entry form) + RIWAYAT (history / load-to-correct)
   ========================================================================= */

function AbsensiView({ data, setData, notify, prefillRecord, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [sekolahId, setSekolahId] = useState(prefillRecord?.sekolahId || "");
  const [trainerId, setTrainerId] = useState(prefillRecord?.trainerId || "");
  const [tanggal, setTanggal] = useState(prefillRecord?.tanggal || today);
  const [trainerStatus, setTrainerStatus] = useState(prefillRecord?.trainerStatus || "Hadir");
  const [siswaStatus, setSiswaStatus] = useState(() => {
    const map = {};
    (prefillRecord?.siswaList || []).forEach((s) => { map[s.siswaId] = s.status; });
    return map;
  });

  useEffect(() => {
    if (prefillRecord) {
      setSekolahId(prefillRecord.sekolahId);
      setTrainerId(prefillRecord.trainerId);
      setTanggal(prefillRecord.tanggal);
      setTrainerStatus(prefillRecord.trainerStatus);
      const map = {};
      prefillRecord.siswaList.forEach((s) => { map[s.siswaId] = s.status; });
      setSiswaStatus(map);
    }
  }, [prefillRecord]);

  const sekolah = data.sekolah.find((s) => s.id === sekolahId);
  const trainerChoices = sekolah ? data.trainer.filter((t) => sekolah.trainerIds.includes(t.id)) : [];
  const siswaList = sekolah ? data.siswa.filter((s) => s.sekolahId === sekolahId) : [];

  useEffect(() => {
    // default new students to Hadir
    setSiswaStatus((prev) => {
      const next = { ...prev };
      siswaList.forEach((s) => { if (!(s.id in next)) next[s.id] = "Hadir"; });
      return next;
    });
    // eslint-disable-next-line
  }, [sekolahId]);

  const recordId = tanggal && sekolahId && trainerId ? `${tanggal}_${sekolahId}_${trainerId}` : null;
  const existingSame = recordId ? data.absensi.find((a) => a.id === recordId && a.id !== prefillRecord?.id) : null;

  const canSave = sekolahId && trainerId && tanggal && siswaList.length > 0;

  const save = () => {
    const record = {
      id: recordId,
      tanggal,
      periode: periodeFromDate(tanggal),
      sekolahId,
      trainerId,
      trainerNama: data.trainer.find((t) => t.id === trainerId)?.nama || "",
      trainerStatus,
      siswaList: siswaList.map((s) => ({ siswaId: s.id, nama: s.nama, status: siswaStatus[s.id] || "Hadir" })),
    };
    const isUpdate = prefillRecord && prefillRecord.id === record.id;
    const withoutOld = prefillRecord ? data.absensi.filter((a) => a.id !== prefillRecord.id) : data.absensi;
    const absensi = [...withoutOld.filter((a) => a.id !== record.id), record];
    setData({ ...data, absensi });
    notify(isUpdate || prefillRecord ? "Absensi diperbarui." : "Absensi disimpan.");
    if (onSaved) onSaved();
    if (!prefillRecord) {
      setTrainerId(""); setSiswaStatus({});
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4" style={{ color: COLORS.ink }}>{prefillRecord ? "Koreksi absensi" : "Absensi harian"}</h2>
      <Card className="max-w-2xl">
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="Tanggal">
            <input type="date" className={inputCls} style={inputStyle} value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </Field>
          <Field label="Sekolah">
            <select className={inputCls} style={inputStyle} value={sekolahId} onChange={(e) => { setSekolahId(e.target.value); setTrainerId(""); }}>
              <option value="">Pilih sekolah…</option>
              {data.sekolah.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Trainer sesi ini">
          <select className={inputCls} style={inputStyle} value={trainerId} onChange={(e) => setTrainerId(e.target.value)} disabled={!sekolahId}>
            <option value="">Pilih trainer…</option>
            {trainerChoices.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
          </select>
          {sekolahId && trainerChoices.length === 0 && <div className="text-[11px] mt-1" style={{ color: COLORS.danger }}>Sekolah ini belum punya trainer terdaftar.</div>}
        </Field>
        {existingSame && (
          <div className="text-[11px] mb-3 px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: `${COLORS.accent}22`, color: COLORS.primaryDark }}>
            Sudah ada catatan untuk kombinasi tanggal/sekolah/trainer ini — menyimpan akan menimpanya. Gunakan Riwayat untuk membuka &amp; mengoreksi catatan yang sudah ada.
          </div>
        )}
        <Field label="Kehadiran trainer">
          <div className="flex gap-2">
            {["Hadir", "Izin", "Alpa"].map((st) => (
              <button key={st} type="button" onClick={() => setTrainerStatus(st)}
                className="px-3 py-1.5 rounded-lg text-xs border"
                style={{ backgroundColor: trainerStatus === st ? COLORS.primary : "white", color: trainerStatus === st ? "white" : COLORS.ink, borderColor: trainerStatus === st ? COLORS.primary : COLORS.line }}>
                {st}
              </button>
            ))}
          </div>
        </Field>

        {sekolahId && (
          <div className="mt-2">
            <div className="text-xs font-medium mb-2" style={{ color: COLORS.sub }}>Kehadiran siswa ({siswaList.length})</div>
            {siswaList.length === 0 ? <EmptyState text="Belum ada siswa di sekolah ini." /> : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {siswaList.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <span style={{ color: COLORS.ink }}>{s.nama}</span>
                    <div className="flex gap-1">
                      {["Hadir", "Izin", "Alpa"].map((st) => (
                        <button key={st} type="button" onClick={() => setSiswaStatus((p) => ({ ...p, [s.id]: st }))}
                          className="px-2 py-1 rounded-md text-[11px] border"
                          style={{ backgroundColor: siswaStatus[s.id] === st ? COLORS.primaryDark : "white", color: siswaStatus[s.id] === st ? "white" : COLORS.sub, borderColor: COLORS.line }}>
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <Btn onClick={save} disabled={!canSave}>{prefillRecord ? "Simpan koreksi" : "Simpan absensi"}</Btn>
        </div>
      </Card>
    </div>
  );
}

function RiwayatView({ data, setData, notify, period, periode }) {
  const [filterSekolah, setFilterSekolah] = useState("");
  const [loadRecord, setLoadRecord] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const list = data.absensi
    .filter((a) => a.periode === periode)
    .filter((a) => !filterSekolah || a.sekolahId === filterSekolah)
    .sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));

  if (loadRecord) {
    return <AbsensiView data={data} setData={setData} notify={notify} prefillRecord={loadRecord} onSaved={() => setLoadRecord(null)} />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold" style={{ color: COLORS.ink }}>Riwayat absensi — {MONTH_NAMES[period.month - 1]} {periode.slice(0,4)}</h2>
        <select className={inputCls} style={inputStyle} value={filterSekolah} onChange={(e) => setFilterSekolah(e.target.value)}>
          <option value="">Semua sekolah</option>
          {data.sekolah.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
        </select>
      </div>

      {list.length === 0 ? <EmptyState text="Belum ada absensi pada periode ini." /> : (
        <div className="space-y-2">
          {list.map((a) => {
            const sekolah = data.sekolah.find((s) => s.id === a.sekolahId);
            const trainer = data.trainer.find((t) => t.id === a.trainerId);
            const hadirCount = a.siswaList.filter((s) => s.status === "Hadir").length;
            return (
              <Card key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium" style={{ color: COLORS.ink }}>{a.tanggal} · {sekolah?.nama || "(sekolah dihapus)"}</div>
                  <div className="text-xs" style={{ color: COLORS.sub }}>
                    Trainer: {trainer?.nama || a.trainerNama} ({a.trainerStatus}) · {hadirCount}/{a.siswaList.length} siswa hadir
                  </div>
                </div>
                <div className="flex gap-2">
                  <Btn variant="ghost" onClick={() => setLoadRecord(a)}>Buka &amp; koreksi</Btn>
                  <Btn variant="danger" onClick={() => setConfirmDelete(a)}>Hapus</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message="Hapus catatan absensi ini? Honor terkait akan hilang dari perhitungan Beban."
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            setData({ ...data, absensi: data.absensi.filter((a) => a.id !== confirmDelete.id) });
            setConfirmDelete(null);
            notify("Catatan absensi dihapus.");
          }}
        />
      )}
    </div>
  );
}

/* =========================================================================
   PEMBAYARAN (honor ledger + Lunaskan)
   ========================================================================= */

function PembayaranView({ data, setData, periode, period, notify }) {
  const [expanded, setExpanded] = useState(null);
  const [payModal, setPayModal] = useState(null); // trainer
  const [confirmDelete, setConfirmDelete] = useState(null);

  const addPayment = (trainerId, nominal) => {
    const p = { id: uid("pay"), trainerId, periode, nominal, tanggalBayar: new Date().toISOString().slice(0, 10) };
    setData({ ...data, honorPayments: [...data.honorPayments, p] });
    notify("Pembayaran dicatat.");
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4" style={{ color: COLORS.ink }}>Pembayaran honor — {MONTH_NAMES[period.month - 1]} {periode.slice(0,4)}</h2>

      {data.trainer.length === 0 ? <EmptyState text="Belum ada trainer." /> : (
        <div className="space-y-2">
          {data.trainer.map((t) => {
            const row = trainerFinanceRow(data, periode, t.id);
            const history = data.honorPayments.filter((p) => p.trainerId === t.id && p.periode === periode);
            return (
              <Card key={t.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium" style={{ color: COLORS.ink }}>{t.nama}</div>
                    <div className="text-xs" style={{ color: COLORS.sub }}>{row.sesi} sesi hadir · Beban {formatRupiah(row.beban)} · Dibayar {formatRupiah(row.dibayar)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: row.sisa > 0 ? COLORS.danger : COLORS.good }}>Sisa {formatRupiah(row.sisa)}</span>
                    <Btn variant="ghost" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>{history.length} riwayat</Btn>
                    <Btn variant="accent" onClick={() => setPayModal(t)} disabled={row.sisa <= 0 && row.beban === 0}>Bayar</Btn>
                  </div>
                </div>
                {expanded === t.id && (
                  <div className="mt-3 pt-3 border-t" style={{ borderColor: COLORS.line }}>
                    {history.length === 0 ? <div className="text-xs" style={{ color: COLORS.sub }}>Belum ada pembayaran.</div> : (
                      <table className="w-full text-xs">
                        <tbody>
                          {history.map((p) => (
                            <tr key={p.id}>
                              <td className="py-1" style={{ color: COLORS.sub }}>{p.tanggalBayar}</td>
                              <td className="py-1 text-right" style={{ color: COLORS.ink }}>{formatRupiah(p.nominal)}</td>
                              <td className="py-1 text-right">
                                <button className="text-[11px]" style={{ color: COLORS.danger }} onClick={() => setConfirmDelete(p)}>Hapus</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {payModal && (
        <PayModal
          trainer={payModal}
          row={trainerFinanceRow(data, periode, payModal.id)}
          periode={periode}
          period={period}
          onClose={() => setPayModal(null)}
          onPay={(nominal) => { addPayment(payModal.id, nominal); setPayModal(null); }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={`Hapus pembayaran ${formatRupiah(confirmDelete.nominal)} tanggal ${confirmDelete.tanggalBayar}? Sisa kewajiban akan bertambah kembali.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            setData({ ...data, honorPayments: data.honorPayments.filter((p) => p.id !== confirmDelete.id) });
            setConfirmDelete(null);
            notify("Pembayaran dihapus.");
          }}
        />
      )}
    </div>
  );
}

function PayModal({ trainer, row, periode, period, onClose, onPay }) {
  const [mode, setMode] = useState("lunas"); // lunas | manual
  const [manual, setManual] = useState(row.sisa > 0 ? row.sisa : 0);
  const overpay = mode === "manual" && manual > row.sisa;
  return (
    <Modal title={`Bayar honor — ${trainer.nama}`} onClose={onClose}>
      <div className="text-sm mb-4" style={{ color: COLORS.ink }}>
        Sisa kewajiban untuk <b>{MONTH_NAMES[period.month - 1]} {periode.slice(0,4)}</b>: <b>{formatRupiah(row.sisa)}</b>
      </div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setMode("lunas")} className="flex-1 px-3 py-2 rounded-lg text-sm border"
          style={{ backgroundColor: mode === "lunas" ? COLORS.primary : "white", color: mode === "lunas" ? "white" : COLORS.ink, borderColor: COLORS.line }}>
          Lunaskan sisa
        </button>
        <button onClick={() => setMode("manual")} className="flex-1 px-3 py-2 rounded-lg text-sm border"
          style={{ backgroundColor: mode === "manual" ? COLORS.primary : "white", color: mode === "manual" ? "white" : COLORS.ink, borderColor: COLORS.line }}>
          Nominal manual
        </button>
      </div>
      {mode === "manual" && (
        <Field label="Nominal (Rp)">
          <input className={inputCls} style={inputStyle} inputMode="numeric"
            value={new Intl.NumberFormat("id-ID").format(manual)}
            onChange={(e) => setManual(parseRupiahInput(e.target.value))} />
        </Field>
      )}
      {mode === "lunas" && (
        <p className="text-sm mb-2" style={{ color: COLORS.ink }}>
          Bayar sisa {formatRupiah(row.sisa)} kepada {trainer.nama} untuk {MONTH_NAMES[period.month - 1]} {periode.slice(0,4)}?
        </p>
      )}
      {overpay && <div className="text-xs mb-3" style={{ color: COLORS.danger }}>Nominal ini melebihi sisa kewajiban ({formatRupiah(row.sisa)}).</div>}
      <div className="flex justify-end gap-2 mt-2">
        <Btn variant="ghost" onClick={onClose}>Batal</Btn>
        <Btn onClick={() => onPay(mode === "lunas" ? row.sisa : manual)} disabled={mode === "lunas" ? row.sisa <= 0 : manual <= 0}>
          Konfirmasi bayar
        </Btn>
      </div>
    </Modal>
  );
}

/* =========================================================================
   KEUANGAN
   ========================================================================= */

function KeuanganView({ data, periode, period }) {
  const f = computeFinance(data, periode);
  const rows = [
    ["Potensi SPP", f.potensi, "memo"],
    ["Pemasukan (SPP lunas)", f.pemasukan, "cash"],
    ["SPP belum tertagih", f.belumTertagih, "memo"],
    ["Beban honor", f.bebanHonor, "memo"],
    ["Honor dibayar", f.dibayarHonor, "cash"],
    ["Sisa kewajiban honor", f.sisaKewajiban, "memo"],
    ["Laba/Rugi (kas)", f.labaRugi, "total"],
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h2 className="text-lg font-semibold" style={{ color: COLORS.ink }}>Keuangan — {MONTH_NAMES[period.month - 1]} {periode.slice(0,4)}</h2>
        <Btn variant="ghost" onClick={() => window.print()}>Cetak laporan</Btn>
      </div>

      <Card className="max-w-lg">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([label, val, kind]) => (
              <tr key={label} style={{ borderBottom: kind === "total" ? "none" : `1px solid ${COLORS.line}` }}>
                <td className="py-2" style={{ color: kind === "memo" ? COLORS.sub : COLORS.ink, fontStyle: kind === "memo" ? "italic" : "normal" }}>
                  {label} {kind === "memo" && <span className="text-[10px]">(memo)</span>}
                </td>
                <td className="py-2 text-right font-medium" style={{ color: kind === "total" ? (val >= 0 ? COLORS.good : COLORS.danger) : COLORS.ink, fontWeight: kind === "total" ? 700 : 500 }}>
                  {formatRupiah(val)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="mt-4 max-w-lg">
        <div className="text-sm font-semibold mb-2" style={{ color: COLORS.ink }}>Rincian per trainer</div>
        <Card className="!p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: COLORS.sub, borderBottom: `1px solid ${COLORS.line}` }}>
                <th className="px-3 py-2">Trainer</th>
                <th className="px-3 py-2 text-right">Sesi</th>
                <th className="px-3 py-2 text-right">Beban</th>
                <th className="px-3 py-2 text-right">Dibayar</th>
                <th className="px-3 py-2 text-right">Sisa</th>
              </tr>
            </thead>
            <tbody>
              {data.trainer.map((t) => {
                const r = trainerFinanceRow(data, periode, t.id);
                return (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${COLORS.line}` }}>
                    <td className="px-3 py-2" style={{ color: COLORS.ink }}>{t.nama}</td>
                    <td className="px-3 py-2 text-right" style={{ color: COLORS.sub }}>{r.sesi}</td>
                    <td className="px-3 py-2 text-right" style={{ color: COLORS.sub }}>{formatRupiah(r.beban)}</td>
                    <td className="px-3 py-2 text-right" style={{ color: COLORS.sub }}>{formatRupiah(r.dibayar)}</td>
                    <td className="px-3 py-2 text-right font-medium" style={{ color: r.sisa > 0 ? COLORS.danger : COLORS.good }}>{formatRupiah(r.sisa)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

/* =========================================================================
   TUNGGAKAN
   ========================================================================= */

function TunggakanView({ data, period }) {
  // elapsed months of the academic year up to and including the selected month
  const idxSel = ACADEMIC_MONTH_ORDER.indexOf(period.month);
  const elapsed = ACADEMIC_MONTH_ORDER.slice(0, idxSel + 1).map((m) => ({ m, periode: periodeKeyFromParts(calYear(m, period.yearStart), m) }));

  const rows = [];
  for (const s of data.siswa) {
    const sek = data.sekolah.find((x) => x.id === s.sekolahId);
    const unpaid = elapsed.filter((e) => !(s.sppLunas && s.sppLunas[e.periode]));
    if (unpaid.length > 0) rows.push({ siswa: s, sekolah: sek, unpaid });
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1" style={{ color: COLORS.ink }}>Tunggakan SPP</h2>
      <p className="text-xs mb-4" style={{ color: COLORS.sub }}>Siswa dengan tunggakan pada bulan berjalan hingga {MONTH_NAMES[period.month - 1]} {period.yearStart}/{period.yearStart + 1}.</p>

      {rows.length === 0 ? <EmptyState text="Tidak ada tunggakan. Semua siswa lunas sampai bulan ini." /> : (
        <div className="space-y-2">
          {rows.map(({ siswa, sekolah, unpaid }) => {
            const bulanTerbaru = unpaid[unpaid.length - 1];
            const bulanNama = MONTH_NAMES[bulanTerbaru.m - 1];
            const text = `Tagihan SPP bulan ${bulanNama} untuk Ananda ${siswa.nama}: ${formatRupiah(sekolah?.spp || 0)}`;
            return (
              <Card key={siswa.id} className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium" style={{ color: COLORS.ink }}>{siswa.nama} <span className="text-xs font-normal" style={{ color: COLORS.sub }}>· {siswa.sekolahNama}</span></div>
                  <div className="text-xs" style={{ color: COLORS.danger }}>{unpaid.length} bulan menunggak · {formatRupiah((sekolah?.spp || 0) * unpaid.length)}</div>
                </div>
                {siswa.wa ? (
                  <a href={waLink(siswa.wa, text)} target="_blank" rel="noreferrer">
                    <Btn variant="accent">Kirim tagihan WA</Btn>
                  </a>
                ) : <span className="text-[11px]" style={{ color: COLORS.sub }}>No. WA belum diisi</span>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   SETTINGS — backup/restore, branding, CSV exports
   ========================================================================= */

function SettingsView({ data, setData, notify, period, periode }) {
  const fileInputRef = useRef(null);
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [wipeConfirm, setWipeConfirm] = useState(false);

  const doBackup = () => {
    const payload = { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
    downloadFile(`afterschola-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json");
    notify("Backup diunduh.");
  };

  const onFilePicked = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      if (!parsed.data || !parsed.data.sekolah || !parsed.data.trainer || !parsed.data.siswa) {
        notify("File tidak valid — struktur backup tidak dikenali.");
        return;
      }
      setConfirmRestore(parsed.data);
    } catch (err) {
      notify("File tidak valid — gagal membaca JSON.");
    }
    e.target.value = "";
  };

  const doRestore = () => {
    setData({ ...emptyData(), ...confirmRestore });
    setConfirmRestore(null);
    notify("Data dipulihkan dari backup.");
  };

  // ----- CSV exports -----
  const exportSiswa = () => {
    const rows = data.siswa.map((s) => ({
      nama: s.nama, sekolah: s.sekolahNama, kelas: s.kelas,
      spp_lunas_periode_ini: s.sppLunas && s.sppLunas[periode] ? "Lunas" : "Belum",
      wa: s.wa,
    }));
    downloadFile(`siswa_${periode}.csv`, toCSV(rows));
  };
  const exportAbsensi = () => {
    const rows = data.absensi.filter((a) => a.periode === periode).map((a) => ({
      tanggal: a.tanggal,
      sekolah: data.sekolah.find((s) => s.id === a.sekolahId)?.nama || "",
      trainer: data.trainer.find((t) => t.id === a.trainerId)?.nama || a.trainerNama,
      status_trainer: a.trainerStatus,
      siswa_hadir: a.siswaList.filter((x) => x.status === "Hadir").length,
      total_siswa: a.siswaList.length,
    }));
    downloadFile(`absensi_${periode}.csv`, toCSV(rows));
  };
  const exportPembayaran = () => {
    const rows = data.honorPayments.filter((p) => p.periode === periode).map((p) => ({
      tanggal_bayar: p.tanggalBayar,
      trainer: data.trainer.find((t) => t.id === p.trainerId)?.nama || "(dihapus)",
      nominal: p.nominal,
    }));
    downloadFile(`pembayaran_${periode}.csv`, toCSV(rows));
  };
  const exportHonorTrainer = () => {
    const rows = data.trainer.map((t) => {
      const r = trainerFinanceRow(data, periode, t.id);
      return { trainer: t.nama, sesi_hadir: r.sesi, beban: r.beban, dibayar: r.dibayar, sisa: r.sisa };
    });
    downloadFile(`honor_trainer_${periode}.csv`, toCSV(rows));
  };
  const exportSekolah = () => {
    const rows = data.sekolah.map((s) => {
      const siswaSekolah = data.siswa.filter((sw) => sw.sekolahId === s.id);
      const bayar = siswaSekolah.filter((sw) => sw.sppLunas && sw.sppLunas[periode]).length;
      return { sekolah: s.nama, jumlah_siswa: siswaSekolah.length, lunas: bayar, pemasukan: bayar * (Number(s.spp) || 0) };
    });
    downloadFile(`sekolah_${periode}.csv`, toCSV(rows));
  };
  const exportTunggakan = () => {
    const idxSel = ACADEMIC_MONTH_ORDER.indexOf(period.month);
    const elapsed = ACADEMIC_MONTH_ORDER.slice(0, idxSel + 1).map((m) => periodeKeyFromParts(calYear(m, period.yearStart), m));
    const rows = [];
    for (const s of data.siswa) {
      const sek = data.sekolah.find((x) => x.id === s.sekolahId);
      const unpaid = elapsed.filter((p) => !(s.sppLunas && s.sppLunas[p]));
      if (unpaid.length) rows.push({ siswa: s.nama, sekolah: s.sekolahNama, bulan_menunggak: unpaid.length, total_tunggakan: unpaid.length * (Number(sek?.spp) || 0), wa: s.wa });
    }
    downloadFile(`tunggakan_${periode}.csv`, toCSV(rows));
  };

  return (
    <div className="max-w-2xl space-y-5">
      <h2 className="text-lg font-semibold" style={{ color: COLORS.ink }}>Pengaturan</h2>

      <Card>
        <div className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>Identitas</div>
        <Field label="Nama aplikasi"><input className={inputCls} style={inputStyle} value={data.settings.title} onChange={(e) => setData({ ...data, settings: { ...data.settings, title: e.target.value } })} /></Field>
        <Field label="URL logo"><input className={inputCls} style={inputStyle} value={data.settings.logoUrl} onChange={(e) => setData({ ...data, settings: { ...data.settings, logoUrl: e.target.value } })} /></Field>
      </Card>

      <Card>
        <div className="text-sm font-semibold mb-1" style={{ color: COLORS.ink }}>Cadangkan &amp; pulihkan data</div>
        <p className="text-xs mb-3" style={{ color: COLORS.sub }}>
          Data tersimpan di penyimpanan akun Anda pada aplikasi ini. Unduh cadangan secara berkala — file ini juga akan menjadi format impor saat pindah ke penyimpanan cloud nanti.
        </p>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={doBackup}>Unduh backup (.json)</Btn>
          <Btn variant="ghost" onClick={() => fileInputRef.current.click()}>Pulihkan dari file…</Btn>
          <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={onFilePicked} />
        </div>
        <div className="mt-3 pt-3 border-t" style={{ borderColor: COLORS.line }}>
          <Btn variant="danger" onClick={() => setWipeConfirm(true)}>Kosongkan semua data</Btn>
        </div>
      </Card>

      <Card>
        <div className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>Ekspor CSV — periode {MONTH_NAMES[period.month - 1]} {periode.slice(0,4)}</div>
        <div className="flex flex-wrap gap-2">
          <Btn variant="ghost" onClick={exportSiswa}>Siswa &amp; status SPP</Btn>
          <Btn variant="ghost" onClick={exportAbsensi}>Absensi</Btn>
          <Btn variant="ghost" onClick={exportPembayaran}>Pembayaran honor</Btn>
          <Btn variant="ghost" onClick={exportHonorTrainer}>Rekap honor trainer</Btn>
          <Btn variant="ghost" onClick={exportSekolah}>Rekap per sekolah</Btn>
          <Btn variant="ghost" onClick={exportTunggakan}>Tunggakan</Btn>
        </div>
      </Card>

      {confirmRestore && (
        <ConfirmDialog
          message="Memulihkan backup akan menimpa seluruh data saat ini. Lanjutkan?"
          onCancel={() => setConfirmRestore(null)}
          onConfirm={doRestore}
          confirmLabel="Ya, pulihkan"
        />
      )}
      {wipeConfirm && (
        <ConfirmDialog
          message="Kosongkan seluruh data (sekolah, siswa, trainer, absensi, pembayaran)? Tindakan ini tidak bisa dibatalkan — unduh backup dulu jika belum."
          onCancel={() => setWipeConfirm(false)}
          onConfirm={() => { setData(emptyData()); setWipeConfirm(false); notify("Semua data dikosongkan."); }}
          confirmLabel="Ya, kosongkan"
        />
      )}
    </div>
  );
}
