import { useState, useMemo } from "react";
import { useSeances } from "../../hooks/useSeances";
import { PRIMARY, BLUE, getCompte, normFactor, getSaison, CURRENT_SAISON, fmtDate } from "../../utils/seances";

const DIST_ORDER = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];

// ── Icône calendrier ──────────────────────────────────────────────────────────

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8"  y1="2" x2="8"  y2="6" />
      <line x1="3"  y1="10" x2="21" y2="10" />
    </svg>
  );
}

// ── Section entr. / comp. ─────────────────────────────────────────────────────

function RecordSection({ type, color, bgColor, best, max }) {
  const pct = best ? Math.round(best.score / max * 100) : 0;
  return (
    <div style={{ ...s.section, backgroundColor: bgColor }}>
      <div style={{ ...s.typeBadge, color, borderColor: color + "55" }}>
        {type.toUpperCase()}
      </div>
      {best ? (
        <>
          <div style={s.scoreRow}>
            <span style={{ ...s.bigScore, color: "var(--text)" }}>{best.score}</span>
            <span style={s.scoreCtx}>/{max} ({pct}%)</span>
          </div>
          <div style={s.meta}>
            {fmtDate(best.date)}{best.lieu ? ` · ${best.lieu}` : ""}
          </div>
          <div style={s.barTrack}>
            <div style={{ ...s.barFill, width: `${pct}%`, backgroundColor: color }} />
          </div>
        </>
      ) : (
        <div style={s.noData}>Aucune séance</div>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function MesRecords() {
  const { seances, loading, error } = useSeances();
  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);

  const saisons = useMemo(() => {
    const set = new Set(seances.filter(s => s.date).map(s => getSaison(s.date)));
    return ["Toutes saisons", ...[...set].sort((a, b) => b.localeCompare(a))];
  }, [seances]);

  const toutesLesSaisons = filterSaison === "Toutes saisons";
  const subtitle = toutesLesSaisons
    ? "Meilleurs scores personnels — toutes saisons confondues"
    : (() => { const [y1, y2] = filterSaison.split("/"); return `Records de la saison ${filterSaison} (1 sept. ${y1} — 31 août ${y2})`; })();

  const records = useMemo(() => {
    const src = seances.filter(s => {
      if (!s.date) return false;
      const okSaison = toutesLesSaisons || getSaison(s.date) === filterSaison;
      return okSaison && getCompte(s) > 0 && (s.score ?? 0) > 0;
    });

    return DIST_ORDER.map(dist => {
      const distSrc = src.filter(s => s.distance === dist);
      if (!distSrc.length) return null;

      const nf  = normFactor(dist);
      const max = nf * 10;

      const getBest = (type) => {
        const hits = distSrc.filter(s => s.type === type);
        if (!hits.length) return null;
        let best = null;
        for (const s of hits) {
          const norm = Math.round(s.score / getCompte(s) * nf);
          if (!best || norm > best.score) {
            best = { score: norm, date: s.date, lieu: s.lieu || null };
          }
        }
        return best;
      };

      const entr = getBest("Entraînement");
      const comp = getBest("Compétition");
      if (!entr && !comp) return null;

      return { dist, nf, max, entr, comp };
    }).filter(Boolean);
  }, [seances, filterSaison]);

  if (loading) return <div style={s.info}>Chargement…</div>;
  if (error)   return <div style={s.errMsg}>{error}</div>;

  return (
    <div style={s.page}>

      {/* ── Sélecteur de saison ── */}
      <div style={s.saisonBar}>
        <span style={s.calIcon}><CalendarIcon /></span>
        <span style={s.saisonBarLabel}>Saison</span>
        <select
          value={filterSaison}
          onChange={e => setFilterSaison(e.target.value)}
          style={s.saisonSelect}
        >
          {saisons.map(sn => <option key={sn} value={sn}>{sn}</option>)}
        </select>
      </div>

      {/* ── Sous-titre ── */}
      <div style={s.subtitle}>{subtitle}</div>

      {/* ── Grille de cartes ── */}
      {records.length === 0 ? (
        <div style={s.empty}>{toutesLesSaisons ? "Aucune séance avec tir compté." : "Aucune séance avec tir compté pour cette saison."}</div>
      ) : (
        <div style={s.grid}>
          {records.map(({ dist, nf, max, entr, comp }) => (
            <div key={dist} style={s.card}>
              <div style={s.cardHead}>
                <span style={s.cardDistKey}>DISTANCE :</span>
                <span style={s.cardDistVal}>{dist.toUpperCase()}</span>
                <span style={s.cardMax}>(MAX {max})</span>
              </div>

              <RecordSection
                type="Entraînement"
                color={PRIMARY}
                bgColor="rgba(255,0,122,0.1)"
                best={entr}
                max={max}
              />
              <RecordSection
                type="Compétition"
                color={BLUE}
                bgColor="rgba(59,130,246,0.1)"
                best={comp}
                max={max}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  page: { display: "flex", flexDirection: "column", gap: "20px" },

  // barre saison
  saisonBar: {
    backgroundColor: "var(--blue-deep)",
    borderRadius: "10px",
    padding: "13px 18px",
    display: "flex", alignItems: "center", gap: "10px",
    boxShadow: "var(--shadow-card)",
    alignSelf: "flex-start",
  },
  calIcon:    { color: "var(--blue-dark)", display: "flex", alignItems: "center" },
  saisonBarLabel: {
    fontSize: "13px", fontWeight: "700", color: "var(--blue-soft2)",
    textTransform: "uppercase", letterSpacing: "0.08em",
  },
  saisonSelect: {
    backgroundColor: "var(--blue-mid)", color: "var(--blue-text)",
    border: "1px solid #2e4a80", borderRadius: "7px",
    padding: "7px 12px", fontSize: "14px", fontWeight: "600",
    outline: "none", fontFamily: "inherit", cursor: "pointer",
  },

  // sous-titre
  subtitle: {
    fontSize: "13px", color: "var(--text-muted)", fontStyle: "italic",
    marginTop: "-8px",
  },

  // grille
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "16px",
  },

  // carte distance
  card: {
    backgroundColor: "var(--surface)", borderRadius: "14px",
    boxShadow: "var(--shadow-card)",
    padding: "18px 20px",
    display: "flex", flexDirection: "column", gap: "12px",
  },
  cardHead: {
    display: "flex", alignItems: "baseline", gap: "7px",
    paddingBottom: "10px", borderBottom: "var(--border)",
  },
  cardDistKey: {
    fontSize: "10px", fontWeight: "700", color: "var(--text-dim)",
    textTransform: "uppercase", letterSpacing: "0.1em",
  },
  cardDistVal: {
    fontSize: "18px", fontWeight: "800", color: "var(--text)",
    letterSpacing: "-0.01em",
  },
  cardMax: {
    fontSize: "11px", color: "var(--text-dim)", marginLeft: "2px",
  },

  // section entr/comp
  section: {
    borderRadius: "9px", padding: "12px 14px",
    display: "flex", flexDirection: "column", gap: "8px",
  },
  typeBadge: {
    display: "inline-block",
    fontSize: "10px", fontWeight: "800",
    letterSpacing: "0.1em",
    border: "1px solid",
    borderRadius: "4px",
    padding: "2px 7px",
    alignSelf: "flex-start",
  },

  // score
  scoreRow: { display: "flex", alignItems: "baseline", gap: "6px" },
  bigScore: { fontSize: "38px", fontWeight: "800", lineHeight: 1, letterSpacing: "-0.02em" },
  scoreCtx: { fontSize: "14px", color: "var(--text-dim)", fontWeight: "500" },

  // date / lieu
  meta: { fontSize: "12px", color: "var(--text-muted)" },

  // barre de progression
  barTrack: {
    height: "6px", borderRadius: "3px",
    backgroundColor: "var(--border)", overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: "3px", transition: "width 0.4s ease" },

  noData: { fontSize: "12px", color: "var(--text-3)", fontStyle: "italic" },

  // états
  info:   { color: "var(--text-muted)", fontSize: "14px" },
  errMsg: {
    color: PRIMARY, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "rgba(255,0,122,0.1)", borderRadius: "8px",
    border: `1px solid ${PRIMARY}`,
  },
  empty: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)",
    padding: "48px", textAlign: "center", color: "var(--text-dim)", fontSize: "14px",
  },
};
