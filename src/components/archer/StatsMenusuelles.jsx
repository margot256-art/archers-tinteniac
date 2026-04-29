import { useState, useMemo } from "react";
import { useSeances } from "../../hooks/useSeances";

const PRIMARY    = "#FF007A";
const BLUE       = "#3b82f6";
const DISTANCES  = ["Toutes", "5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const MOIS_FR    = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

const normFactor = (dist) => (dist === "5m" || dist === "18m") ? 60 : 72;

const getPaille = s => s.paille ?? s.volumePaille ?? 0;
const getBlason = s => s.blason ?? s.volumeBlason ?? 0;
const getCompte = s => s.compte ?? s.volumeCompte ?? 0;

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

// ── Composant principal ───────────────────────────────────────────────────────

export default function StatsMenusuelles() {
  const { seances, loading, error } = useSeances();
  const [filterDist,   setFilterDist]   = useState("Toutes");
  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);

  const saisons = useMemo(() => {
    const set = new Set(seances.map(s => s.date ? getSaison(s.date) : null).filter(Boolean));
    return ["Toutes", ...[...set].sort((a, b) => b.localeCompare(a))];
  }, [seances]);

  const rows = useMemo(() => {
    const src = seances.filter(s => {
      if (!s.date) return false;
      const okSaison = filterSaison === "Toutes" || getSaison(s.date) === filterSaison;
      const okDist   = filterDist   === "Toutes" || s.distance === filterDist;
      return okSaison && okDist;
    });

    const map = {};
    for (const s of src) {
      const month = s.date.slice(0, 7);
      const key   = `${month}__${s.distance}`;
      if (!map[key]) {
        map[key] = {
          month,
          distance:   s.distance,
          nbrEntr:    0,
          nbrComp:    0,
          paille:     0,
          blason:     0,
          compteTotal: 0,
          compteEntr:  0,
          scoreEntr:   0,
          compteComp:  0,
          scoreComp:   0,
        };
      }
      const g  = map[key];
      const p  = getPaille(s);
      const b  = getBlason(s);
      const c  = getCompte(s);
      const sc = s.score ?? 0;

      g.paille      += p;
      g.blason      += b;
      g.compteTotal += c;

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
        const nf         = normFactor(g.distance);
        const moyEntr    = g.compteEntr > 0 ? g.scoreEntr / g.compteEntr : null;
        const moyComp    = g.compteComp > 0 ? g.scoreComp / g.compteComp : null;
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
        return DISTANCES.indexOf(a.distance) - DISTANCES.indexOf(b.distance);
      });
  }, [seances, filterDist, filterSaison]);

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>Stats mensuelles</h2>
        <div style={s.filters}>
          <FilterSelect label="Saison"   value={filterSaison} options={saisons}   onChange={setFilterSaison} />
          <FilterSelect label="Distance" value={filterDist}   options={DISTANCES} onChange={setFilterDist} />
        </div>
      </div>

      {loading && <div style={s.info}>Chargement…</div>}
      {error   && <div style={s.errMsg}>{error}</div>}

      {!loading && !error && (
        <>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                {/* Ligne 1 : groupes */}
                <tr>
                  <th style={s.th}          rowSpan={2}>Mois</th>
                  <th style={s.th}          rowSpan={2}>Distance</th>
                  <th style={s.thGrpSeance} colSpan={2}>Séances</th>
                  <th style={s.thGrpVol}    colSpan={3}>Volumes</th>
                  <th style={s.thR}         rowSpan={2}>Score</th>
                  <th style={s.thR}         rowSpan={2}>Total fl.</th>
                  <th style={s.thGrpEntr}   colSpan={2}>Entraînement</th>
                  <th style={s.thGrpComp}   colSpan={2}>Compétition</th>
                </tr>
                {/* Ligne 2 : sous-colonnes */}
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
                  <tr>
                    <td colSpan={13} style={s.empty}>Aucune séance trouvée.</td>
                  </tr>
                ) : (
                  rows.map((row, i) => {
                    const entrMoyColor = row.moyEntr == null ? "#555" : PRIMARY;
                    const compMoyColor = row.moyComp == null ? "#555" : BLUE;
                    return (
                      <tr
                        key={i}
                        style={s.tr}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = "#1f1f1f"}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}
                      >
                        <td style={{ ...s.td, fontWeight: "500" }}>{fmtMois(row.month)}</td>
                        <td style={s.td}><span style={s.badge}>{row.distance}</span></td>
                        <td style={{ ...s.tdNum, color: row.nbrEntr ? PRIMARY : "#555", fontWeight: "600" }}>{row.nbrEntr || "—"}</td>
                        <td style={{ ...s.tdNum, color: row.nbrComp ? BLUE    : "#555", fontWeight: "600" }}>{row.nbrComp || "—"}</td>
                        <td style={s.tdNum}>{row.paille  || "—"}</td>
                        <td style={s.tdNum}>{row.blason  || "—"}</td>
                        <td style={s.tdNum}>{row.compteTotal || "—"}</td>
                        <td style={{ ...s.tdNum, fontWeight: "600" }}>{row.score || "—"}</td>
                        <td style={s.tdNum}>{row.total   || "—"}</td>
                        <td style={{ ...s.tdNum, color: entrMoyColor, fontWeight: "600" }}>
                          {fmtDec(row.moyEntr)}
                        </td>
                        <td style={{ ...s.tdNum, color: entrMoyColor, fontWeight: "700" }}>
                          {fmtInt(row.scoreMoyEntr)}
                        </td>
                        <td style={{ ...s.tdNum, color: compMoyColor, fontWeight: "600" }}>
                          {fmtDec(row.moyComp)}
                        </td>
                        <td style={{ ...s.tdNum, color: compMoyColor, fontWeight: "700" }}>
                          {fmtInt(row.scoreMoyComp)}
                        </td>
                      </tr>
                    );
                  })
                )}
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

// ── Sous-composant ────────────────────────────────────────────────────────────

function FilterSelect({ label, value, options, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={s.filterLabel}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={s.filterSelect}>
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
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" },
  title:  { fontSize: "20px", fontWeight: "700", color: "#e8e8e8", margin: 0 },
  filters:{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" },
  filterLabel: {
    fontSize: "12px", fontWeight: "600", color: "#777",
    textTransform: "uppercase", letterSpacing: "0.06em",
  },
  filterSelect: {
    padding: "7px 10px", border: "1.5px solid #2e2e2e", borderRadius: "7px",
    fontSize: "13px", color: "#e8e8e8", backgroundColor: "#1e1e1e",
    outline: "none", fontFamily: "inherit", cursor: "pointer",
  },
  tableWrap: {
    backgroundColor: "#1a1a1a", borderRadius: "12px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.3)", overflowX: "auto",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },

  // en-têtes ligne 1
  th:         { ...thBase, textAlign: "left" },
  thR:        { ...thBase, textAlign: "right" },
  thGrpSeance:{ ...thBase, textAlign: "center", borderLeft: "1px solid #2a2a2a", borderRight: "1px solid #2a2a2a" },
  thGrpVol:   { ...thBase, textAlign: "center", borderLeft: "1px solid #2a2a2a", borderRight: "1px solid #2a2a2a" },
  thGrpEntr:  { ...thBase, textAlign: "center", color: PRIMARY, backgroundColor: "rgba(255,0,122,0.1)", borderLeft: "2px solid rgba(255,0,122,0.3)" },
  thGrpComp:  { ...thBase, textAlign: "center", color: BLUE,    backgroundColor: "rgba(59,130,246,0.1)", borderLeft: "2px solid rgba(59,130,246,0.3)" },

  // en-têtes ligne 2
  thSub:     { ...thBase, fontWeight: "600", color: "#666" },
  thSubEntr: { ...thBase, fontWeight: "600", color: PRIMARY, backgroundColor: "rgba(255,0,122,0.1)" },
  thSubComp: { ...thBase, fontWeight: "600", color: BLUE,    backgroundColor: "rgba(59,130,246,0.1)" },

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
