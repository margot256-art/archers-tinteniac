import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, doc, updateDoc, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";

const toBase64 = (str) => btoa(unescape(encodeURIComponent(str)));

function useResetRequests() {
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    const q    = query(collection(db, "password_resets"), where("status", "==", "pending"));
    const unsub = onSnapshot(q, (snap) =>
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);
  return requests;
}
import { useAllSeances } from "../../hooks/useAllSeances";

const PRIMARY = "#FF007A";
const GREEN   = "#16a34a";
const RED     = "#ef4444";
const ORANGE  = "#f97316";

// ── helpers ───────────────────────────────────────────────────────────────────

function getWeekBounds() {
  const today = new Date();
  const dow   = today.getDay();
  const toMon = dow === 0 ? -6 : 1 - dow;
  const mon   = new Date(today);
  mon.setDate(today.getDate() + toMon);
  const sun   = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const localISO = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return [localISO(mon), localISO(sun)];
}

function getMonthKeys() {
  const today  = new Date();
  const ym     = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const prev   = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const ymPrev = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  return [ym, ymPrev];
}

function daysSince(iso) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today - new Date(iso + "T00:00:00")) / 86400000);
}

const fmtDate    = (iso) => { if (!iso) return "—"; const [y,m,d] = iso.split("-"); return `${d}/${m}/${y}`; };
const sumFleches = (s)   => s.totalFleches ?? (s.paille ?? s.volumePaille ?? 0) + (s.blason ?? s.volumeBlason ?? 0) + (s.compte ?? s.volumeCompte ?? 0);
const getMoy     = (s)   => {
  const c  = s.compte ?? s.volumeCompte ?? 0;
  const sc = s.score ?? 0;
  if (c > 0 && sc > 0) return sc / c;
  if (s.moyenne != null) return Number(s.moyenne);
  return null;
};

// ── objectifs hook ────────────────────────────────────────────────────────────

function useObjectifs() {
  const [objectifs, setObjectifs] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "objectifs"), (snap) =>
      setObjectifs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);
  return objectifs;
}

// ── composant principal ───────────────────────────────────────────────────────

export default function Dashboard() {
  const { seances, loading, error } = useAllSeances();
  const objectifs  = useObjectifs();
  const resetReqs  = useResetRequests();
  const [newPasswords, setNewPasswords] = useState({});
  const [resetStatus,  setResetStatus]  = useState({});

  const handlePasswordReset = async (req) => {
    const pwd = (newPasswords[req.id] || "").trim();
    if (!pwd) return;
    setResetStatus(prev => ({ ...prev, [req.id]: "loading" }));
    try {
      await updateDoc(doc(db, "users", req.archerId), { mdp: toBase64(pwd) });
      await updateDoc(doc(db, "password_resets", req.id), { status: "done" });
      setResetStatus(prev => ({ ...prev, [req.id]: "done" }));
      setNewPasswords(prev => ({ ...prev, [req.id]: "" }));
    } catch {
      setResetStatus(prev => ({ ...prev, [req.id]: "error" }));
    }
  };

  const [monStr, sunStr] = useMemo(() => getWeekBounds(), []);
  const [ym, ymPrev]     = useMemo(() => getMonthKeys(),  []);

  const weekSeances  = useMemo(() => seances.filter(s => s.date >= monStr && s.date <= sunStr), [seances, monStr, sunStr]);
  const monthSeances = useMemo(() => seances.filter(s => s.date?.startsWith(ym)),     [seances, ym]);
  const prevSeances  = useMemo(() => seances.filter(s => s.date?.startsWith(ymPrev)), [seances, ymPrev]);

  // ── stat cards ────────────────────────────────────────────────────────────

  const fleches = useMemo(
    () => monthSeances.reduce((n, s) => n + sumFleches(s), 0),
    [monthSeances]
  );

  const archerDuMois = useMemo(() => {
    const c = {};
    for (const s of monthSeances) {
      if (!s.archer) continue;
      if (!c[s.archer]) c[s.archer] = { name: s.archer, n: 0 };
      c[s.archer].n++;
    }
    return Object.values(c).sort((a, b) => b.n - a.n)[0] ?? null;
  }, [monthSeances]);

  // ── tous les archers, triés par dernière séance décroissante ──────────────
  // Clé = s.archer (nom complet) — toujours défini, robuste même si archerId varie

  const archerActivity = useMemo(() => {
    const map = {};
    for (const s of seances) {
      if (!s.date || !s.archer) continue;
      if (!map[s.archer]) {
        map[s.archer] = { id: s.archerId, name: s.archer, lastDate: s.date };
      } else {
        if (s.date > map[s.archer].lastDate) map[s.archer].lastDate = s.date;
        if (!map[s.archer].id && s.archerId) map[s.archer].id = s.archerId;
      }
    }
    return Object.values(map).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  }, [seances]);

  // ── progression moyenne/flèche ────────────────────────────────────────────

  const progression = useMemo(() => {
    const avgMoy = (list) => {
      const hits = list.filter(s => getMoy(s) != null);
      if (!hits.length) return null;
      return hits.reduce((sum, s) => sum + getMoy(s), 0) / hits.length;
    };
    return archerActivity.map(({ name }) => {
      const curr  = avgMoy(monthSeances.filter(s => s.archer === name));
      const prev  = avgMoy(prevSeances.filter(s => s.archer === name));
      const delta = curr != null && prev != null ? curr - prev : null;
      return { name, curr, prev, delta };
    }).filter(a => a.curr != null || a.prev != null);
  }, [archerActivity, monthSeances, prevSeances]);

  // ── volume entraînement vs objectif ──────────────────────────────────────

  const volumeData = useMemo(() => {
    return archerActivity.map(archer => {
      const obj = objectifs.find(o => o.archer === archer.name || o.id === archer.id);

      const entrSeances = monthSeances.filter(
        s => s.archer === archer.name && s.type?.startsWith("Entraîn")
      );
      const vol = entrSeances.reduce(
        (n, s) =>
          n +
          (s.paille ?? s.volumePaille ?? 0) +
          (s.blason ?? s.volumeBlason ?? 0) +
          (s.compte ?? s.volumeCompte ?? 0),
        0
      );
      const target = obj?.volEntr ?? 0;
      const hasObj = !!obj && target > 0;
      const rawPct = hasObj ? Math.round((vol / target) * 100) : null;
      const barPct = hasObj ? Math.min(rawPct, 100) : null;
      return { ...archer, vol, target, hasObj, rawPct, barPct };
    }).sort((a, b) => {
      if (a.hasObj && !b.hasObj) return -1;
      if (!a.hasObj && b.hasObj) return 1;
      if (!a.hasObj) return 0;
      return (b.rawPct ?? 0) - (a.rawPct ?? 0);
    });
  }, [archerActivity, monthSeances, objectifs]);

  // ── render ────────────────────────────────────────────────────────────────

  if (loading) return <div style={s.info}>Chargement…</div>;
  if (error)   return <div style={s.errMsg}>{error}</div>;

  return (
    <div style={s.page}>

      {/* ── Demandes de réinitialisation de mot de passe ── */}
      {resetReqs.length > 0 && (
        <div style={s.resetSection}>
          <div style={s.resetHeader}>
            <span style={s.resetTitle}>Demandes de mot de passe</span>
            <span style={s.resetBadge}>{resetReqs.length}</span>
          </div>
          {resetReqs.map(req => (
            <div key={req.id} style={s.resetRow}>
              <span style={s.resetName}>{req.prenom} {req.nom}</span>
              <div style={s.resetActions}>
                <input
                  type="text"
                  placeholder="Nouveau mot de passe"
                  value={newPasswords[req.id] || ""}
                  onChange={e => setNewPasswords(prev => ({ ...prev, [req.id]: e.target.value }))}
                  style={s.resetInput}
                />
                <button
                  style={{ ...s.resetBtn, ...(resetStatus[req.id] === "loading" ? { opacity: 0.6 } : {}) }}
                  onClick={() => handlePasswordReset(req)}
                  disabled={resetStatus[req.id] === "loading" || !(newPasswords[req.id] || "").trim()}
                >
                  {resetStatus[req.id] === "done" ? "✓" : resetStatus[req.id] === "loading" ? "…" : "Valider"}
                </button>
              </div>
              {resetStatus[req.id] === "error" && (
                <span style={{ fontSize: "11px", color: "#ef4444" }}>Erreur — archer introuvable ?</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Stat cards ── */}
      <div className="coach-cards-grid">
        <StatCard label="Séances cette semaine" value={weekSeances.length} />
        <StatCard label="Séances ce mois"       value={monthSeances.length} />
        <StatCard label="Flèches ce mois"       value={fleches.toLocaleString("fr-FR")} />
        <StatCard
          label="🏆 Archer du mois"
          value={archerDuMois ? archerDuMois.name.split(" ")[0] : "—"}
          sub={archerDuMois ? `${archerDuMois.n} séance${archerDuMois.n > 1 ? "s" : ""}` : undefined}
        />
      </div>

      {/* ── Dernière séance par archer ── */}
      <Section title="⏰ Dernière séance par archer">
        {archerActivity.length === 0 ? (
          <div style={s.empty}>Aucune séance enregistrée.</div>
        ) : (
          <div>
            {archerActivity.map((a, i) => {
              const days  = daysSince(a.lastDate);
              const col   = days < 7 ? GREEN : days <= 14 ? ORANGE : RED;
              const label = days === 0 ? "Auj." : `${days} j.`;
              return (
                <div
                  key={a.name}
                  style={{ ...s.lastRow, ...(i === archerActivity.length - 1 ? { borderBottom: "none" } : {}) }}
                >
                  <span style={s.lastName}>{a.name}</span>
                  <span style={{ ...s.lastRight, color: col }}>
                    {label} ({fmtDate(a.lastDate)})
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── Progression ── */}
      <Section title="📈 Progression — ce mois vs mois précédent">
        {progression.length === 0 ? (
          <div style={s.empty}>Aucune séance avec tir compté ce mois-ci ou le mois précédent.</div>
        ) : (
          <div style={s.progGrid}>
            {progression.map(p => {
              const dCol   = p.delta == null ? "#555" : p.delta > 0 ? PRIMARY : RED;
              const dStr   = p.delta != null
                ? `${p.delta > 0 ? "+ " : "− "}${Math.abs(p.delta).toFixed(2)}`
                : null;
              return (
                <div key={p.name} style={s.progCard}>
                  <div style={s.progName}>{p.name}</div>
                  <div style={s.progPrev}>
                    Mois prec. : {p.prev != null ? p.prev.toFixed(2) : "—"}
                  </div>
                  <div style={s.progRow}>
                    <span style={s.progCurr}>
                      {p.curr != null ? p.curr.toFixed(2) : "—"}
                    </span>
                    {dStr && (
                      <span style={{ ...s.progDelta, color: dCol }}>{dStr}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── Volume vs objectif ── */}
      <Section title="🎯 Volume mensuel entraînement vs objectif">
        {volumeData.length === 0 ? (
          <div style={s.empty}>Aucune séance enregistrée.</div>
        ) : (
          <div style={s.volCard}>
            {volumeData.map((a, i) => (
              <div
                key={a.name}
                style={{ ...s.volRow, ...(i === volumeData.length - 1 ? { borderBottom: "none" } : {}) }}
              >
                <div style={s.volMeta}>
                  <span style={s.volName}>{a.name}</span>
                  {a.hasObj ? (
                    <span style={s.volText}>
                      {a.vol} / {a.target} fl. ({a.rawPct}%)
                    </span>
                  ) : (
                    <span style={s.volNoObj}>{a.vol} fl. — pas objectif</span>
                  )}
                </div>
                {a.hasObj && (
                  <div style={s.barTrack}>
                    <div style={{ ...s.barFill, width: `${a.barPct}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── sous-composants ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }) {
  return (
    <div style={s.statCard}>
      <div style={s.statLabel}>{label}</div>
      <div style={s.statValue}>{value}</div>
      {sub && <div style={s.statSub}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={s.section}>
      <h3 style={s.sectionTitle}>{title}</h3>
      {children}
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const s = {
  page:   { display: "flex", flexDirection: "column", gap: "28px" },
  info:   { color: "#777", fontSize: "14px" },
  errMsg: {
    color: PRIMARY, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "rgba(255,0,122,0.1)", borderRadius: "8px", border: `1px solid ${PRIMARY}`,
  },

  // réinitialisation mot de passe
  resetSection: {
    backgroundColor: "#1a1a1a",
    border: "1px solid #f97316",
    borderRadius: "12px",
    padding: "16px 20px",
    display: "flex", flexDirection: "column", gap: "12px",
    boxShadow: "0 2px 10px rgba(249,115,22,0.15)",
  },
  resetHeader: { display: "flex", alignItems: "center", gap: "10px" },
  resetTitle:  { fontSize: "13px", fontWeight: "700", color: "#e8e8e8", textTransform: "uppercase", letterSpacing: "0.06em" },
  resetBadge:  {
    backgroundColor: "#f97316", color: "#fff",
    borderRadius: "10px", padding: "1px 7px",
    fontSize: "11px", fontWeight: "700",
  },
  resetRow: {
    display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px",
    paddingTop: "10px", borderTop: "1px solid #2a2a2a",
  },
  resetName:    { fontSize: "14px", color: "#e8e8e8", fontWeight: "600", flex: "1 1 120px" },
  resetActions: { display: "flex", gap: "8px", flex: "2 1 240px" },
  resetInput: {
    flex: 1, padding: "7px 10px",
    border: "1.5px solid #2e2e2e", borderRadius: "7px",
    fontSize: "13px", color: "#e8e8e8", backgroundColor: "#252525",
    outline: "none", fontFamily: "inherit",
  },
  resetBtn: {
    backgroundColor: "#f97316", color: "#fff", border: "none",
    borderRadius: "7px", padding: "7px 14px",
    fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
    whiteSpace: "nowrap",
  },

  // bannière
  banner: {
    backgroundColor: "#1a2744",
    borderRadius: "12px",
    padding: "20px 28px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
  },
  bannerTitle: {
    fontSize: "20px", fontWeight: "700", color: "#e8e8e8",
    letterSpacing: "-0.01em",
  },

  // stat cards
  cards: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px" },
  statCard: {
    backgroundColor: "#1a1a1a", borderRadius: "12px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
    padding: "18px 20px",
    display: "flex", flexDirection: "column", gap: "4px",
  },
  statLabel: {
    fontSize: "11px", fontWeight: "700", color: "#666",
    textTransform: "uppercase", letterSpacing: "0.07em",
  },
  statValue: {
    fontSize: "28px", fontWeight: "800", color: "#e8e8e8",
    letterSpacing: "-0.02em", lineHeight: "1.1",
  },
  statSub: { fontSize: "12px", color: "#555" },

  // sections
  section:      { display: "flex", flexDirection: "column", gap: "10px" },
  sectionTitle: { fontSize: "14px", fontWeight: "700", color: "#c0c0c0", margin: 0 },
  empty:        { color: "#555", fontSize: "14px", padding: "24px", textAlign: "center" },

  // dernière séance (sans fond)
  lastRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "11px 4px",
    borderBottom: "1px solid #222",
  },
  lastName:  { fontSize: "14px", fontWeight: "700", color: "#d0d0d0" },
  lastRight: { fontSize: "13px", fontWeight: "600" },

  // progression
  progGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
    gap: "12px",
  },
  progCard: {
    backgroundColor: "#1a1a1a", borderRadius: "10px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
    padding: "14px 16px",
    display: "flex", flexDirection: "column", gap: "6px",
  },
  progName:  { fontSize: "13px", fontWeight: "700", color: "#e0e0e0" },
  progPrev:  { fontSize: "11px", color: "#666" },
  progRow:   { display: "flex", alignItems: "baseline", gap: "8px" },
  progCurr:  { fontSize: "26px", fontWeight: "800", color: "#e8e8e8", letterSpacing: "-0.02em" },
  progDelta: { fontSize: "14px", fontWeight: "700" },

  // volume vs objectif
  volCard: {
    backgroundColor: "#1a1a1a", borderRadius: "12px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
    overflow: "hidden",
  },
  volRow: {
    padding: "13px 20px",
    borderBottom: "1px solid #1e1e1e",
    display: "flex", flexDirection: "column", gap: "8px",
  },
  volMeta:  { display: "flex", justifyContent: "space-between", alignItems: "center" },
  volName:  { fontSize: "13px", fontWeight: "600", color: "#d0d0d0" },
  volText:  { fontSize: "12px", color: "#888" },
  volNoObj: { fontSize: "12px", color: "#555", fontStyle: "italic" },
  barTrack: {
    height: "7px", backgroundColor: "#2a2a2a",
    borderRadius: "10px", overflow: "hidden",
  },
  barFill: {
    height: "100%", borderRadius: "10px",
    backgroundColor: ORANGE, transition: "width 0.5s ease",
  },
};
