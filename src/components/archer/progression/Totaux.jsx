import { useState, useMemo } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { useSeances } from "../../../hooks/useSeances";
import { useObjectif } from "../../../hooks/useObjectif";
import { PRIMARY, BLUE, getSaison, CURRENT_SAISON, fmtYM, normFactor } from "../../../utils/seances";
import { filtrerSeances, agregerParMoisDistance, trierParMoisPuisDistance, topNMoyenneNormalisee, DIST_ORDER } from "../../../utils/statsCalc";
import { exporterExcel, exporterPDF } from "../../../utils/export";
import FilterSelect from "../../shared/FilterSelect";

const DISTANCES = ["Toutes", ...DIST_ORDER];

const fmtDec = (v) => (v != null ? v.toFixed(2) : "—");
const fmtInt = (v) => (v != null ? String(v) : "—");

const EXPORT_COLS = [
  "Mois", "Distance", "Séances Entr.", "Séances Comp.",
  "Paille", "Blason", "Compté", "Score", "Total fl.",
  "Moy./fl. Entr.", "Score moy. Entr.", "Moy./fl. Comp.", "Score moy. Comp.",
];
const NUM_COLS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export default function Totaux() {
  const { user } = useAuth();
  const { seances, loading, error } = useSeances();
  const rawObjectif = useObjectif();

  const [filterDist, setFilterDist] = useState("Toutes");
  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);

  const objectives = useMemo(() => {
    if (!rawObjectif) return {};
    if (rawObjectif.saisons?.[filterSaison]) return rawObjectif.saisons[filterSaison].distances ?? {};
    if (rawObjectif.distances) return rawObjectif.distances;
    return {};
  }, [rawObjectif, filterSaison]);

  const objSummary = useMemo(() => {
    const entries = Object.entries(objectives);
    if (!entries.length) return [];
    return entries
      .map(([dist, objScore]) => {
        const nf = normFactor(dist);
        const parType = (type) => {
          const list = seances.filter((s) => s.distance === dist && s.type === type);
          const avg = topNMoyenneNormalisee(list);
          return {
            current: avg,
            delta: avg != null ? avg - objScore : null,
            pct: avg != null ? Math.min(100, Math.round((avg / objScore) * 100)) : 0,
          };
        };
        return { dist, objScore, nf, comp: parType("Compétition"), entr: parType("Entraînement") };
      })
      .sort((a, b) => DIST_ORDER.indexOf(a.dist) - DIST_ORDER.indexOf(b.dist));
  }, [seances, objectives]);

  const saisons = useMemo(() => {
    const set = new Set(seances.map((s) => (s.date ? getSaison(s.date) : null)).filter(Boolean));
    return ["Toutes", ...[...set].sort((a, b) => b.localeCompare(a))];
  }, [seances]);

  const rows = useMemo(() => {
    const src = filtrerSeances(seances, { saison: filterSaison, distance: filterDist });
    return trierParMoisPuisDistance(agregerParMoisDistance(src));
  }, [seances, filterDist, filterSaison]);

  const totalRowData = useMemo(() => {
    const t = rows.reduce((acc, row) => ({
      nbrEntr: acc.nbrEntr + row.nbrEntr, nbrComp: acc.nbrComp + row.nbrComp,
      paille: acc.paille + row.paille, blason: acc.blason + row.blason, compteTotal: acc.compteTotal + row.compteTotal,
      score: acc.score + row.score, total: acc.total + row.total,
      scoreEntr: acc.scoreEntr + row.scoreEntr, compteEntr: acc.compteEntr + row.compteEntr,
      scoreComp: acc.scoreComp + row.scoreComp, compteComp: acc.compteComp + row.compteComp,
    }), { nbrEntr: 0, nbrComp: 0, paille: 0, blason: 0, compteTotal: 0, score: 0, total: 0, scoreEntr: 0, compteEntr: 0, scoreComp: 0, compteComp: 0 });
    return {
      ...t,
      moyEntr: t.compteEntr > 0 ? t.scoreEntr / t.compteEntr : null,
      moyComp: t.compteComp > 0 ? t.scoreComp / t.compteComp : null,
    };
  }, [rows]);

  const rowToArr = (row, asString) => [
    fmtYM(row.month), row.distance, row.nbrEntr || "", row.nbrComp || "",
    row.paille || "", row.blason || "", row.compteTotal || "", row.score || "", row.total || "",
    row.moyEntr != null ? (asString ? row.moyEntr.toFixed(2) : parseFloat(row.moyEntr.toFixed(2))) : "",
    row.scoreMoyEntr ?? "",
    row.moyComp != null ? (asString ? row.moyComp.toFixed(2) : parseFloat(row.moyComp.toFixed(2))) : "",
    row.scoreMoyComp ?? "",
  ];

  const totalRowArr = (asString) => {
    const t = totalRowData;
    const fmt = (v) => (v != null ? (asString ? v.toFixed(2) : parseFloat(v.toFixed(2))) : "");
    return [
      `Total — Saison ${filterSaison}`, "", t.nbrEntr || "", t.nbrComp || "",
      t.paille || "", t.blason || "", t.compteTotal || "", t.score || "", t.total || "",
      fmt(t.moyEntr), "", fmt(t.moyComp), "",
    ];
  };

  const archerNom = user ? `${user.prenom} ${user.nom}` : "";

  const handleExportExcel = () => exporterExcel({
    titre: `Progression — ${archerNom} — Saison ${filterSaison}`,
    colonnes: EXPORT_COLS,
    lignes: rows.map((r) => rowToArr(r, false)),
    ligneTotal: totalRowArr(false),
    fichier: `progression-${filterSaison.replace("/", "-")}`,
    colonnesNumeriques: NUM_COLS,
    largeurs: [{ wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 18 }],
  });

  const handleExportPDF = () => exporterPDF({
    titre: `Progression — ${archerNom} — Saison ${filterSaison}`,
    colonnes: EXPORT_COLS,
    lignes: rows.map((r) => rowToArr(r, true)),
    ligneTotal: totalRowArr(true),
    fichier: `progression-${filterSaison.replace("/", "-")}`,
    colonnesNumeriques: NUM_COLS,
    largeursColonnes: [24, 12, 14, 14, 10, 10, 10, 10, 12, 18, 22, 18, 0],
  });

  if (loading) return <div style={s.info}>Chargement…</div>;
  if (error) return <div style={s.errMsg}>{error}</div>;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.filters}>
          <FilterSelect label="Saison" value={filterSaison} options={saisons} onChange={setFilterSaison} />
          <FilterSelect label="Distance" value={filterDist} options={DISTANCES} onChange={setFilterDist} />
          <button style={{ ...s.exportBtn, ...(rows.length === 0 ? s.off : {}) }} onClick={handleExportExcel} disabled={rows.length === 0}>↓ Excel</button>
          <button style={{ ...s.exportBtn, ...(rows.length === 0 ? s.off : {}) }} onClick={handleExportPDF} disabled={rows.length === 0}>↓ PDF</button>
        </div>
      </div>

      {objSummary.length > 0 && (
        <div style={s.objCard}>
          <div style={s.objHeader}>
            <span style={s.objTitle}>Objectifs</span>
            <span style={s.objHint}>Moy. top 3 · score normalisé</span>
          </div>
          {objSummary.map(({ dist, objScore, nf, comp, entr }, i) => (
            <div key={dist} style={{ ...s.objRow, ...(i === objSummary.length - 1 ? { borderBottom: "none" } : {}) }}>
              <div style={s.objLeft}>
                <span style={s.objBadge}>{dist}</span>
                <span style={s.objMax}>/ {nf * 10} pts</span>
              </div>
              <div style={s.objMiddle}>
                <ObjGauge label="Comp." color={BLUE} row={comp} />
                <ObjGauge label="Entr." color={PRIMARY} row={entr} />
                <div style={s.objObjLine}><span style={s.objObjVal}>objectif : {objScore}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th} rowSpan={2}>Mois</th>
              <th style={s.th} rowSpan={2}>Distance</th>
              <th style={s.thGrpSeance} colSpan={2}>Séances</th>
              <th style={s.thGrpVol} colSpan={3}>Volumes</th>
              <th style={s.thR} rowSpan={2}>Score</th>
              <th style={s.thR} rowSpan={2}>Total fl.</th>
              <th style={s.thGrpEntr} colSpan={2}>Entraînement</th>
              <th style={s.thGrpComp} colSpan={2}>Compétition</th>
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
              <tr><td colSpan={13} style={s.empty}>Aucune séance trouvée.</td></tr>
            ) : rows.map((row, i) => {
              const entrMoyColor = row.moyEntr == null ? "var(--text-dim)" : PRIMARY;
              const compMoyColor = row.moyComp == null ? "var(--text-dim)" : BLUE;
              return (
                <tr key={i} style={s.tr}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-raised)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                >
                  <td style={{ ...s.td, fontWeight: "500" }}>{fmtYM(row.month)}</td>
                  <td style={s.td}><span style={s.badge}>{row.distance}</span></td>
                  <td style={{ ...s.tdNum, color: row.nbrEntr ? PRIMARY : "var(--text-dim)", fontWeight: "600" }}>{row.nbrEntr || "—"}</td>
                  <td style={{ ...s.tdNum, color: row.nbrComp ? BLUE : "var(--text-dim)", fontWeight: "600" }}>{row.nbrComp || "—"}</td>
                  <td style={s.tdNum}>{row.paille || "—"}</td>
                  <td style={s.tdNum}>{row.blason || "—"}</td>
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
      {rows.length > 0 && <div style={s.count}>{rows.length} ligne{rows.length > 1 ? "s" : ""}</div>}
    </div>
  );
}

function ObjGauge({ label, color, row }) {
  const { current, delta, pct } = row;
  const hasData = current != null;
  const barColor = !hasData ? "var(--border)" : pct >= 100 ? "#16a34a" : pct >= 80 ? color : pct >= 60 ? "#f97316" : "#ef4444";
  const deltaStr = delta == null ? null : delta >= 0 ? `+${delta}` : `${delta}`;
  const deltaCol = delta == null ? "var(--text-dim)" : delta >= 0 ? "#16a34a" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <span style={{ fontSize: "10px", fontWeight: "700", color, width: "32px", flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <div style={{ flex: 1, height: "5px", backgroundColor: "var(--input-bg)", borderRadius: "10px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, backgroundColor: barColor, borderRadius: "10px", transition: "width 0.5s ease" }} />
      </div>
      <span style={{ fontSize: "13px", fontWeight: "700", color: hasData ? "var(--text)" : "var(--text-3)", width: "32px", textAlign: "right", flexShrink: 0 }}>{hasData ? current : "—"}</span>
      {deltaStr ? <span style={{ fontSize: "11px", fontWeight: "700", color: deltaCol, width: "36px", flexShrink: 0 }}>{deltaStr}</span> : <span style={{ width: "36px", flexShrink: 0 }} />}
    </div>
  );
}

const thBase = {
  padding: "10px 12px", fontSize: "11px", fontWeight: "700",
  textTransform: "uppercase", letterSpacing: "0.06em",
  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
  backgroundColor: "var(--surface-raised)", color: "var(--text-dim)",
};

const s = {
  page: { display: "flex", flexDirection: "column", gap: "16px" },
  header: { display: "flex", alignItems: "center", justifyContent: "flex-end" },
  filters: { display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" },
  exportBtn: {
    backgroundColor: "var(--border)", color: "var(--text)", border: "none",
    borderRadius: "7px", padding: "8px 14px", fontSize: "13px", fontWeight: "600",
    cursor: "pointer", fontFamily: "inherit",
  },
  off: { opacity: 0.4, cursor: "not-allowed" },
  tableWrap: { backgroundColor: "var(--surface)", borderRadius: "12px", boxShadow: "var(--shadow-card)", overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th: { ...thBase, textAlign: "left" },
  thR: { ...thBase, textAlign: "right" },
  thGrpSeance: { ...thBase, textAlign: "center", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" },
  thGrpVol: { ...thBase, textAlign: "center", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" },
  thGrpEntr: { ...thBase, textAlign: "center", color: PRIMARY, backgroundColor: "rgba(255,0,122,0.1)", borderLeft: "2px solid rgba(255,0,122,0.3)" },
  thGrpComp: { ...thBase, textAlign: "center", color: BLUE, backgroundColor: "rgba(59,130,246,0.1)", borderLeft: "2px solid rgba(59,130,246,0.3)" },
  thSub: { ...thBase, fontWeight: "600", color: "var(--text-dim)" },
  thSubEntr: { ...thBase, fontWeight: "600", color: PRIMARY, backgroundColor: "rgba(255,0,122,0.1)" },
  thSubComp: { ...thBase, fontWeight: "600", color: BLUE, backgroundColor: "rgba(59,130,246,0.1)" },
  tr: { borderBottom: "1px solid var(--border)", transition: "background-color 0.1s" },
  td: { padding: "10px 12px", color: "var(--text-2)", whiteSpace: "nowrap" },
  tdNum: { padding: "10px 12px", textAlign: "right", color: "var(--text-3)", whiteSpace: "nowrap" },
  badge: { backgroundColor: "var(--border)", borderRadius: "5px", padding: "2px 8px", fontSize: "12px", fontWeight: "600", color: "var(--text-3)" },
  empty: { padding: "40px", textAlign: "center", color: "var(--text-dim)", fontSize: "14px" },
  info: { color: "var(--text-muted)", fontSize: "14px" },
  errMsg: { color: PRIMARY, fontSize: "13px", padding: "10px 14px", backgroundColor: "rgba(255,0,122,0.1)", borderRadius: "8px", border: `1px solid ${PRIMARY}` },
  count: { fontSize: "12px", color: "var(--text-dim)", textAlign: "right" },
  objCard: { backgroundColor: "var(--surface)", borderRadius: "12px", boxShadow: "var(--shadow-card)", overflow: "hidden" },
  objHeader: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", padding: "16px 20px", borderBottom: "1px solid var(--border-2)" },
  objTitle: { fontSize: "13px", fontWeight: "700", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.06em" },
  objHint: { fontSize: "11px", color: "var(--text-3)", marginLeft: "auto" },
  objRow: { display: "grid", gridTemplateColumns: "80px 1fr", alignItems: "center", gap: "16px", padding: "14px 20px", borderBottom: "1px solid var(--border)" },
  objLeft: { display: "flex", flexDirection: "column", gap: "4px" },
  objBadge: { backgroundColor: "var(--input-bg)", borderRadius: "5px", padding: "2px 8px", fontSize: "12px", fontWeight: "700", color: "var(--text-3)", alignSelf: "flex-start" },
  objMax: { fontSize: "10px", color: "var(--border-strong)" },
  objMiddle: { display: "flex", flexDirection: "column", gap: "7px" },
  objObjLine: { display: "flex", justifyContent: "flex-end" },
  objObjVal: { fontSize: "10px", color: "var(--border-strong)" },
};
