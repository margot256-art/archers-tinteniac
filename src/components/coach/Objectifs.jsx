import { useState, useEffect, useMemo } from "react";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAllSeances } from "../../hooks/useAllSeances";

const PRIMARY   = "#FF007A";
const DIST_LIST = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];

// ── hook : lecture + écriture objectifs ───────────────────────────────────────

function useObjectifsManager() {
  const [objectifs, setObjectifs]         = useState({});
  const [objectifsLoaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "objectifs"), (snap) => {
      const map = {};
      snap.docs.forEach((d) => { map[d.id] = d.data(); });
      setObjectifs(map);
      setLoaded(true);
    });
    return () => unsub();
  }, []);

  const saveObjectif = async (archerId, archerName, distances, volEntr) => {
    const cleanDist = {};
    for (const [dist, val] of Object.entries(distances)) {
      const n = parseInt(val, 10);
      if (n > 0) cleanDist[dist] = n;
    }
    await setDoc(doc(db, "objectifs", archerId), {
      archer:    archerName,
      archerId,
      distances: cleanDist,
      volEntr:   parseInt(volEntr, 10) || 0,
    });
  };

  return { objectifs, objectifsLoaded, saveObjectif };
}

// ── carte par archer ──────────────────────────────────────────────────────────

function ArcherCard({ archer, objectif, onSave }) {
  const [distances, setDistances] = useState(
    Object.fromEntries(DIST_LIST.map((d) => [d, String(objectif?.distances?.[d] ?? "")]))
  );
  const [volEntr,  setVolEntr]  = useState(String(objectif?.volEntr ?? ""));
  const [saving,   setSaving]   = useState(false);
  const [feedback, setFeedback] = useState(null); // "ok" | "err" | null

  const setDist = (d) => (e) =>
    setDistances((prev) => ({ ...prev, [d]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await onSave(distances, volEntr);
      setFeedback("ok");
    } catch {
      setFeedback("err");
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 2500);
    }
  };

  const hasDef = DIST_LIST.some((d) => distances[d]) || volEntr;

  return (
    <div style={s.card}>
      {/* header */}
      <div style={s.cardHeader}>
        <span style={s.archerName}>{archer.name}</span>
        {hasDef && <span style={s.dot} title="Objectif défini" />}
      </div>

      {/* distances */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Score cible par distance</div>
        <div style={s.distGrid}>
          {DIST_LIST.map((d) => (
            <div key={d} style={s.distRow}>
              <span style={s.distLabel}>{d}</span>
              <input
                type="number"
                min="0"
                step="1"
                value={distances[d]}
                onChange={setDist(d)}
                placeholder="—"
                style={s.input}
              />
            </div>
          ))}
        </div>
      </div>

      {/* volume mensuel */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Volume mensuel entraînement (flèches)</div>
        <input
          type="number"
          min="0"
          step="10"
          value={volEntr}
          onChange={(e) => setVolEntr(e.target.value)}
          placeholder="ex : 300"
          style={{ ...s.input, width: "110px" }}
        />
      </div>

      {/* footer */}
      <div style={s.cardFooter}>
        <div style={s.feedbackArea}>
          {feedback === "ok"  && <span style={s.feedOk}>Sauvegardé</span>}
          {feedback === "err" && <span style={s.feedErr}>Erreur</span>}
        </div>
        <button
          style={{ ...s.btn, ...(saving ? s.btnBusy : {}) }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Enregistrement…" : "Sauvegarder"}
        </button>
      </div>
    </div>
  );
}

// ── page principale ───────────────────────────────────────────────────────────

export default function Objectifs() {
  const { seances, loading: loadingSeances } = useAllSeances();
  const { objectifs, objectifsLoaded, saveObjectif } = useObjectifsManager();

  const archers = useMemo(() => {
    const map = {};
    for (const s of seances) {
      if (!s.archer) continue;
      if (!map[s.archer]) {
        map[s.archer] = { id: s.archerId, name: s.archer };
      } else if (!map[s.archer].id && s.archerId) {
        map[s.archer].id = s.archerId;
      }
    }
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [seances]);

  const loading = loadingSeances || !objectifsLoaded;

  if (loading) return <div style={s.info}>Chargement…</div>;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.pageTitle}>Objectifs des archers</h2>
        <span style={s.subtitle}>
          {archers.filter((a) => objectifs[a.id]).length} / {archers.length} objectif{archers.length > 1 ? "s" : ""} défini{archers.length > 1 ? "s" : ""}
        </span>
      </div>

      {archers.length === 0 ? (
        <div style={s.emptyPage}>Aucun archer trouvé dans les séances.</div>
      ) : (
        <div style={s.grid}>
          {archers.map((a) => (
            <ArcherCard
              key={a.name}
              archer={a}
              objectif={
                objectifs[a.id] ??
                objectifs[a.name.trim().toLowerCase().replace(/\s+/g, "_")] ??
                Object.values(objectifs).find(o => o.archer === a.name)
              }
              onSave={(distances, volEntr) => {
                const safeId = a.id ?? a.name.trim().toLowerCase().replace(/\s+/g, "_");
                return saveObjectif(safeId, a.name, distances, volEntr);
              }}
            />
          ))}
        </div>
      )}

      <div style={s.legend}>
        <span style={{ ...s.dot, position: "static", display: "inline-block" }} /> Objectif défini
      </div>
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const s = {
  page:      { display: "flex", flexDirection: "column", gap: "20px" },
  header:    { display: "flex", alignItems: "baseline", gap: "14px", flexWrap: "wrap" },
  pageTitle: { fontSize: "20px", fontWeight: "700", color: "var(--text)", margin: 0 },
  subtitle:  { fontSize: "13px", color: "var(--text-dim)" },
  info:      { color: "var(--text-muted)", fontSize: "14px" },
  emptyPage: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)",
    padding: "40px", textAlign: "center", color: "var(--text-dim)", fontSize: "14px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
    gap: "16px",
  },

  // card
  card: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)",
    padding: "18px 20px 16px",
    display: "flex", flexDirection: "column", gap: "16px",
    position: "relative",
  },
  cardHeader: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
  },
  archerName: { fontSize: "15px", fontWeight: "700", color: "var(--text)" },
  dot: {
    position: "absolute", top: "18px", right: "18px",
    width: "8px", height: "8px", borderRadius: "50%",
    backgroundColor: "#16a34a", display: "block", flexShrink: 0,
  },

  // sections
  section:      { display: "flex", flexDirection: "column", gap: "10px" },
  sectionLabel: {
    fontSize: "11px", fontWeight: "700", color: "var(--text-dim)",
    textTransform: "uppercase", letterSpacing: "0.07em",
  },

  // distance grid (2 columns)
  distGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px",
  },
  distRow: { display: "flex", alignItems: "center", gap: "8px" },
  distLabel: {
    fontSize: "12px", fontWeight: "600", color: "var(--text-dim)",
    width: "30px", flexShrink: 0,
  },

  // input
  input: {
    padding: "6px 8px", border: "var(--border-2)", borderRadius: "6px",
    fontSize: "13px", color: "var(--text)", fontFamily: "inherit",
    outline: "none", width: "70px", backgroundColor: "var(--input-bg)",
    transition: "border-color 0.15s",
  },

  // footer
  cardFooter: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between", gap: "12px",
    paddingTop: "4px", borderTop: "var(--border)",
  },
  feedbackArea: { minHeight: "20px" },
  feedOk: { fontSize: "12px", color: "#16a34a", fontWeight: "600" },
  feedErr: { fontSize: "12px", color: "#ef4444", fontWeight: "600" },
  btn: {
    backgroundColor: PRIMARY, color: "#fff",
    border: "none", borderRadius: "7px",
    padding: "8px 16px", fontSize: "13px",
    fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
    transition: "opacity 0.15s",
  },
  btnBusy: { opacity: 0.6, cursor: "not-allowed" },

  // legend
  legend: {
    fontSize: "12px", color: "var(--text-dim)",
    display: "flex", alignItems: "center", gap: "6px",
  },
};
