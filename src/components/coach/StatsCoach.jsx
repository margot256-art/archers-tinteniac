import { useState, useMemo } from "react";
import { useAllSeances } from "../../hooks/useAllSeances";

const PRIMARY    = "#FF007A";
const BLUE       = "#3b82f6";
const DISTANCES  = ["Toutes", "5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const MOIS_FR    = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const DIST_ORDER = ["5m","18m","20m","30m","40m","50m","60m","70m"];

const AVATAR_COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#f97316",
  "#10b981","#3b82f6","#f59e0b","#14b8a6","#84cc16","#ef4444",
];

const normFactor = (dist) => (dist === "5m" || dist === "18m") ? 60 : 72;
const getPaille  = s => s.paille ?? s.volumePaille ?? 0;
const getBlason  = s => s.blason ?? s.volumeBlason ?? 0;
const getCompte  = s => s.compte ?? s.volumeCompte ?? 0;

const fmtMois = (yyyyMM) => {
  const [y, m] = yyyyMM.split("-");
  return `${MOIS_FR[parseInt(m, 10) - 1]} ${y}`;
};

const getSaison = (iso) => {
  const [y, m] = iso.split("-").map(Number);
  return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
};

const CURRENT_SAISON = (() => {
  const d = new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
})();

const fmtDec = (v) => (v != null ? v.toFixed(2) : "—");
const fmtInt = (v) => (v != null ? String(v) : "—");

function archerColor(name) {
  let h = 0;
  for (const c of (name || "")) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initiales(name) {
  const parts = (name || "").trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (name || "?")[0].toUpperCase();
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function StatsCoach() {
  const { seances, loading, error } = useAllSeances();
  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);
  const [filterArcher, setFilterArcher] = useState("Tous");
  const [filterDist,   setFilterDist]   = useState("Toutes");

  const saisons = useMemo(() => {
    const set = new Set(seances.map(s => s.date ? getSaison(s.date) : null).filter(Boolean));
    return ["Toutes", ...[...set].sort((a, b) => b.localeCompare(a))];
  }, [seances]);

  // Toutes les séances de la saison (sans filtre archer/dist) → pour les stats globales
  const saisonSeances = useMemo(() =>
    seances.filter(s => s.date && (filterSaison === "Toutes" || getSaison(s.date) === filterSaison)),
    [seances, filterSaison]
  );

  // ── Stats globales saison ─────────────────────────────────────────────────

  const globalStats = useMemo(() => {
    const actifs  = new Set(saisonSeances.map(s => s.archer).filter(Boolean)).size;
    const fleches = saisonSeances.reduce((n, s) => n + getPaille(s) + getBlason(s) + getCompte(s), 0);
    const scored  = saisonSeances.filter(s => getCompte(s) > 0 && (s.score ?? 0) > 0);
    const distMap = {};
    for (const s of scored) {
      const d = s.distance;
      if (!d) continue;
      if (!distMap[d]) distMap[d] = { scoreSum: 0, compteSum: 0 };
      distMap[d].scoreSum  += s.score;
      distMap[d].compteSum += getCompte(s);
    }
    const moyByDist = DIST_ORDER
      .filter(d => distMap[d]?.compteSum > 0)
      .map(d => ({ dist: d, moy: distMap[d].scoreSum / distMap[d].compteSum }));
    const entr = saisonSeances.filter(s => s.type === "Entraînement").length;
    const comp = saisonSeances.filter(s => s.type === "Compétition").length;
    return { total: saisonSeances.length, actifs, fleches, moyByDist, entr, comp };
  }, [saisonSeances]);

  // ── Cartes par archer ─────────────────────────────────────────────────────

  const archerCards = useMemo(() => {
    const map = {};
    for (const s of saisonSeances) {
      if (!s.archer) continue;
      if (!map[s.archer]) map[s.archer] = { name: s.archer, n: 0, fleches: 0, distData: {} };
      map[s.archer].n++;
      map[s.archer].fleches += getPaille(s) + getBlason(s) + getCompte(s);
      const c = getCompte(s);
      if (c > 0 && (s.score ?? 0) > 0 && s.distance) {
        if (!map[s.archer].distData[s.distance])
          map[s.archer].distData[s.distance] = { scoreSum: 0, compteSum: 0 };
        map[s.archer].distData[s.distance].scoreSum  += s.score;
        map[s.archer].distData[s.distance].compteSum += c;
      }
    }
    return Object.values(map)
      .sort((a, b) => b.n - a.n)
      .map(a => ({
        ...a,
        moysByDist: DIST_ORDER
          .filter(d => a.distData[d]?.compteSum > 0)
          .map(d => ({ dist: d, moy: a.distData[d].scoreSum / a.distData[d].compteSum })),
      }));
  }, [saisonSeances]);

  // ── Tableau mensuel (avec filtres archer/dist) ────────────────────────────

  const archerOptions = useMemo(() => {
    const names = [...new Set(saisonSeances.map(s => s.archer).filter(Boolean))].sort();
    return ["Tous", ...names];
  }, [saisonSeances]);

  const rows = useMemo(() => {
    const src = saisonSeances.filter(s => {
      const okArcher = filterArcher === "Tous" || s.archer === filterArcher;
      const okDist   = filterDist   === "Toutes" || s.distance === filterDist;
      return okArcher && okDist;
    });

    const map = {};
    for (const s of src) {
      const month = s.date.slice(0, 7);
      const key   = `${month}__${s.archer ?? ""}__${s.distance}`;
      if (!map[key]) {
        map[key] = {
          month, archer: s.archer ?? "—", distance: s.distance,
          nbrEntr: 0, nbrComp: 0, paille: 0, blason: 0,
          compteTotal: 0, compteEntr: 0, scoreEntr: 0, compteComp: 0, scoreComp: 0,
        };
      }
      const g  = map[key];
      const p  = getPaille(s);
      const b  = getBlason(s);
      const c  = getCompte(s);
      const sc = s.score ?? 0;
      g.paille += p; g.blason += b; g.compteTotal += c;
      if (s.type === "Entraînement") {
        g.nbrEntr++;
        if (c > 0 && sc > 0) { g.compteEntr += c; g.scoreEntr += sc; }
      } else if (s.type === "Compétition") {
        g.nbrComp++;
        if (c > 0 && sc > 0) { g.compteComp += c; g.scoreComp += sc; }
      }
    }

    return Object.values(map)
      .map(g => {
        const nf      = normFactor(g.distance);
        const moyEntr = g.compteEntr > 0 ? g.scoreEntr / g.compteEntr : null;
        const moyComp = g.compteComp > 0 ? g.scoreComp / g.compteComp : null;
        return {
          ...g,
          total:        g.paille + g.blason + g.compteTotal,
          score:        g.scoreEntr + g.scoreComp,
          moyEntr,
          scoreMoyEntr: moyEntr != null ? Math.round(moyEntr * nf) : null,
          moyComp,
          scoreMoyComp: moyComp != null ? Math.round(moyComp * nf) : null,
        };
      })
      .sort((a, b) => {
        const cm = b.month.localeCompare(a.month);
        if (cm !== 0) return cm;
        const ca = a.archer.localeCompare(b.archer);
        if (ca !== 0) return ca;
        return DISTANCES.indexOf(a.distance) - DISTANCES.indexOf(b.distance);
      });
  }, [saisonSeances, filterArcher, filterDist]);

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>

      {/* ── Sélecteur de saison ── */}
      <div style={s.saisonBar}>
        <span style={s.saisonBarLabel}>Saison</span>
        <select
          value={filterSaison}
          onChange={e => { setFilterSaison(e.target.value); setFilterArcher("Tous"); }}
          style={s.saisonSelect}
        >
          {saisons.map(sn => <option key={sn}>{sn}</option>)}
        </select>
      </div>

      {/* ── Cartes stats globales ── */}
      {!loading && !error && (
        <div className="coach-cards-grid">
          <StatCard label="Total séances"  value={globalStats.total} sub={`${globalStats.entr} entr. · ${globalStats.comp} comp.`} />
          <StatCard label="Archers actifs" value={globalStats.actifs} />
          <StatCard label="Total flèches"  value={globalStats.fleches.toLocaleString("fr-FR")} />
          <MoyDistCard moyByDist={globalStats.moyByDist} />
        </div>
      )}

      {/* ── Macarons archers ── */}
      {!loading && !error && archerCards.length > 0 && (
        <div style={s.archerGrid}>
          {archerCards.map(a => {
            const col = archerColor(a.name);
            return (
              <div key={a.name} style={s.archerCard}>
                <div style={{ ...s.avatar, backgroundColor: col + "22", color: col }}>
                  {initiales(a.name)}
                </div>
                <div style={s.archerInfo}>
                  <div style={s.archerName}>{a.name}</div>
                  <div style={s.archerMeta}>
                    {a.n} séance{a.n > 1 ? "s" : ""} · {a.fleches.toLocaleString("fr-FR")} fl.
                  </div>
                  {a.moysByDist.length > 0 && (
                    <div style={s.archerMoy}>
                      {a.moysByDist.map(d => `${d.dist} : ${d.moy.toFixed(2)}`).join(" | ")}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tableau mensuel ── */}
      <div style={s.header}>
        <h2 style={s.title}>Stats mensuelles — club</h2>
        <div style={s.filters}>
          <FilterSelect label="Archer"   value={filterArcher} options={archerOptions} onChange={setFilterArcher} />
          <FilterSelect label="Distance" value={filterDist}   options={DISTANCES}     onChange={setFilterDist} />
        </div>
      </div>

      {loading && <div style={s.info}>Chargement…</div>}
      {error   && <div style={s.errMsg}>{error}</div>}

      {!loading && !error && (
        <>
          <div style={s.tableWrap}>
            <table style={s.table} className="coach-table">
              <thead>
                <tr>
                  <th style={s.th}          rowSpan={2}>Mois</th>
                  <th style={s.th}          rowSpan={2}>Archer</th>
                  <th style={s.th}          rowSpan={2}>Distance</th>
                  <th style={s.thGrpSeance} colSpan={2}>Séances</th>
                  <th style={s.thGrpVol}    colSpan={3}>Volumes</th>
                  <th style={s.thR}         rowSpan={2}>Score</th>
                  <th style={s.thR}         rowSpan={2}>Total fl.</th>
                  <th style={s.thGrpEntr}   colSpan={2}>Entraînement</th>
                  <th style={s.thGrpComp}   colSpan={2}>Compétition</th>
                </tr>
                <tr>
                  <th style={{ ...s.thSub, ...s.thR }}>Entr.</th>
                  <th style={{ ...s.thSub, ...s.thR }}>Comp.</th>
                  <th style={{ ...s.thSub, ...s.thR }}>Paille</th>
                  <th style={{ ...s.thSub, ...s.thR }}>Blason</th>
                  <th style={{ ...s.thSub, ...s.thR }}>Compté</th>
                  <th style={{ ...s.thSubEntr, ...s.thR }}>Moy./fl.</th>
                  <th style={{ ...s.thSubEntr, ...s.thR }}>Score moy.</th>
                  <th style={{ ...s.thSubComp, ...s.thR }}>Moy./fl.</th>
                  <th style={{ ...s.thSubComp, ...s.thR }}>Score moy.</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={14} style={s.empty}>Aucune séance trouvée.</td></tr>
                ) : rows.map((row, i) => {
                  const entrMoyColor = row.moyEntr == null ? "#555" : PRIMARY;
                  const compMoyColor = row.moyComp == null ? "#555" : BLUE;
                  return (
                    <tr key={i} style={s.tr}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = "#1f1f1f"}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}
                    >
                      <td style={{ ...s.td, fontWeight: "500" }}>{fmtMois(row.month)}</td>
                      <td style={{ ...s.td, fontWeight: "700" }}>{row.archer}</td>
                      <td style={s.td}><span style={s.badge}>{row.distance}</span></td>
                      <td style={{ ...s.tdNum, color: row.nbrEntr ? PRIMARY : "#555", fontWeight: "600" }}>{row.nbrEntr || "—"}</td>
                      <td style={{ ...s.tdNum, color: row.nbrComp ? BLUE    : "#555", fontWeight: "600" }}>{row.nbrComp || "—"}</td>
                      <td style={s.tdNum}>{row.paille      || "—"}</td>
                      <td style={s.tdNum}>{row.blason      || "—"}</td>
                      <td style={s.tdNum}>{row.compteTotal || "—"}</td>
                      <td style={{ ...s.tdNum, fontWeight: "600" }}>{row.score || "—"}</td>
                      <td style={s.tdNum}>{row.total || "—"}</td>
                      <td style={{ ...s.tdNum, color: entrMoyColor, fontWeight: "600" }}>{fmtDec(row.moyEntr)}</td>
                      <td style={{ ...s.tdNum, color: entrMoyColor, fontWeight: "700" }}>{fmtInt(row.scoreMoyEntr)}</td>
                      <td style={{ ...s.tdNum, color: compMoyColor, fontWeight: "600" }}>{fmtDec(row.moyComp)}</td>
                      <td style={{ ...s.tdNum, color: compMoyColor, fontWeight: "700" }}>{fmtInt(row.scoreMoyComp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > 0 && (
            <div style={s.count}>{rows.length} ligne{rows.length > 1 ? "s" : ""}</div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sous-composants ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }) {
  return (
    <div style={s.statCard}>
      <div style={s.statLabel}>{label}</div>
      <div style={s.statValue}>{value}</div>
      {sub && <div style={s.statSub}>{sub}</div>}
    </div>
  );
}

function MoyDistCard({ moyByDist }) {
  return (
    <div style={{ ...s.statCard, gap: "8px" }}>
      <div style={s.statLabel}>Moy. club / flèche</div>
      {moyByDist.length === 0 ? (
        <div style={{ fontSize: "13px", color: "#555" }}>—</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "2px" }}>
          {moyByDist.map(({ dist, moy }) => (
            <div key={dist} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: "12px", color: "#666", fontWeight: "600" }}>{dist}</span>
              <span style={{ fontSize: "16px", fontWeight: "800", color: PRIMARY, letterSpacing: "-0.01em" }}>
                {moy.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={s.filterLabel}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="coach-filter-select">
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const thBase = {
  padding: "10px 12px",
  fontSize: "11px", fontWeight: "700",
  textTransform: "uppercase", letterSpacing: "0.06em",
  borderBottom: "1px solid #2a2a2a", whiteSpace: "nowrap",
  backgroundColor: "#1e1e1e", color: "#666",
};

const s = {
  page:   { display: "flex", flexDirection: "column", gap: "16px" },
  header: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "12px" },
  title:  { fontSize: "20px", fontWeight: "700", color: "#e8e8e8", margin: 0 },
  filters:{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" },
  filterLabel: {
    fontSize: "12px", fontWeight: "600", color: "#777",
    textTransform: "uppercase", letterSpacing: "0.06em",
  },

  saisonBar: {
    display: "flex", alignItems: "center", gap: "10px",
    alignSelf: "flex-start",
  },
  saisonBarLabel: {
    fontSize: "12px", fontWeight: "700", color: "#666",
    textTransform: "uppercase", letterSpacing: "0.08em",
  },
  saisonSelect: {
    padding: "7px 12px", borderRadius: "8px",
    border: "1.5px solid #2e2e2e",
    backgroundColor: "#1e1e1e", color: "#c8daf5",
    fontSize: "14px", fontWeight: "600",
    cursor: "pointer", outline: "none", fontFamily: "inherit",
  },

  // stat cards
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

  // macarons archers
  archerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "12px",
  },
  archerCard: {
    backgroundColor: "#1a1a1a", borderRadius: "10px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
    padding: "14px 16px",
    display: "flex", alignItems: "center", gap: "13px",
  },
  avatar: {
    width: "42px", height: "42px", borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "15px", fontWeight: "800", flexShrink: 0,
  },
  archerInfo: { display: "flex", flexDirection: "column", gap: "3px" },
  archerName: { fontSize: "14px", fontWeight: "700", color: "#e0e0e0" },
  archerMeta: { fontSize: "11px", color: "#666" },
  archerMoy:  { fontSize: "12px", fontWeight: "600", color: PRIMARY },

  // tableau
  tableWrap: {
    backgroundColor: "#1a1a1a", borderRadius: "12px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.3)", overflowX: "auto",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },

  th:         { ...thBase, textAlign: "left" },
  thR:        { ...thBase, textAlign: "right" },
  thGrpSeance:{ ...thBase, textAlign: "center", borderLeft: "1px solid #2a2a2a", borderRight: "1px solid #2a2a2a" },
  thGrpVol:   { ...thBase, textAlign: "center", borderLeft: "1px solid #2a2a2a", borderRight: "1px solid #2a2a2a" },
  thGrpEntr:  { ...thBase, textAlign: "center", color: PRIMARY, backgroundColor: "rgba(255,0,122,0.1)", borderLeft: "2px solid rgba(255,0,122,0.3)" },
  thGrpComp:  { ...thBase, textAlign: "center", color: BLUE,    backgroundColor: "rgba(59,130,246,0.1)", borderLeft: "2px solid rgba(59,130,246,0.3)" },
  thSub:      { ...thBase, fontWeight: "600", color: "#666" },
  thSubEntr:  { ...thBase, fontWeight: "600", color: PRIMARY, backgroundColor: "rgba(255,0,122,0.1)" },
  thSubComp:  { ...thBase, fontWeight: "600", color: BLUE,    backgroundColor: "rgba(59,130,246,0.1)" },

  tr:    { borderBottom: "1px solid #1e1e1e", transition: "background-color 0.1s" },
  td:    { padding: "10px 12px", color: "#d0d0d0", whiteSpace: "nowrap" },
  tdNum: { padding: "10px 12px", textAlign: "right", color: "#ccc", whiteSpace: "nowrap" },
  badge: {
    backgroundColor: "#2a2a2a", borderRadius: "5px",
    padding: "2px 8px", fontSize: "12px", fontWeight: "600", color: "#bbb",
  },
  empty:  { padding: "40px", textAlign: "center", color: "#555", fontSize: "14px" },
  info:   { color: "#777", fontSize: "14px" },
  errMsg: {
    color: PRIMARY, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "rgba(255,0,122,0.1)", borderRadius: "8px", border: `1px solid ${PRIMARY}`,
  },
  count: { fontSize: "12px", color: "#555", textAlign: "right" },
};
