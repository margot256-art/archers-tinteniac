import { useState, useMemo } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { useSeances } from "../../../hooks/useSeances";
import { useObjectif } from "../../../hooks/useObjectif";
import { useEcranEtroit } from "../../../hooks/useEcranEtroit";
import { PRIMARY, BLUE, getSaison, CURRENT_SAISON, fmtYM, normFactor, libelleSaison } from "../../../utils/seances";
import { filtrerSeances, agregerParMoisDistance, trierParMoisPuisDistance, DIST_ORDER } from "../../../utils/statsCalc";
import { niveauEpreuves } from "../../../utils/records";
import { exporterExcel, exporterPDF } from "../../../utils/export";
import FilterSelect from "../../shared/FilterSelect";
import * as ui from "../styleArcher";

const DISTANCES = ["Toutes", ...DIST_ORDER];

const fmtDec = (v) => (v != null ? v.toFixed(2) : "—");
const fmtInt = (v) => (v != null ? String(v) : "—");

// Pas de colonne « Score » : additionner des tirs comptés différents n'a pas de sens
// (le score moyen ramené sur 600 / 720 sert de repère, par type de séance).
const EXPORT_COLS = [
  "Mois", "Distance", "Séances Entr.", "Séances Comp.",
  "Paille", "Blason", "Compté", "Total fl.",
  "Moy./fl. Entr.", "Score moy. Entr.", "Moy./fl. Comp.", "Score moy. Comp.",
];
const NUM_COLS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export default function Totaux() {
  const { user } = useAuth();
  const { seances, loading, error } = useSeances();
  const rawObjectif = useObjectif();
  const etroit = useEcranEtroit();

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
        // Niveau actuel : moyenne des 3 meilleures épreuves complètes (2 séries)
        // de la saison choisie, comme pour les records.
        const parType = (type) => {
          const avg = niveauEpreuves(seances, { distance: dist, type, saison: filterSaison });
          return {
            current: avg,
            delta: avg != null ? avg - objScore : null,
            pct: avg != null ? Math.min(100, Math.round((avg / objScore) * 100)) : 0,
          };
        };
        return { dist, objScore, nf, comp: parType("Compétition"), entr: parType("Entraînement") };
      })
      .sort((a, b) => DIST_ORDER.indexOf(a.dist) - DIST_ORDER.indexOf(b.dist));
  }, [seances, objectives, filterSaison]);

  const saisons = useMemo(() => {
    const set = new Set(seances.map((s) => (s.date ? getSaison(s.date) : null)).filter(Boolean));
    set.add(CURRENT_SAISON);
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
      total: acc.total + row.total,
      scoreEntr: acc.scoreEntr + row.scoreEntr, compteEntr: acc.compteEntr + row.compteEntr,
      scoreComp: acc.scoreComp + row.scoreComp, compteComp: acc.compteComp + row.compteComp,
    }), { nbrEntr: 0, nbrComp: 0, paille: 0, blason: 0, compteTotal: 0, total: 0, scoreEntr: 0, compteEntr: 0, scoreComp: 0, compteComp: 0 });
    return {
      ...t,
      moyEntr: t.compteEntr > 0 ? t.scoreEntr / t.compteEntr : null,
      moyComp: t.compteComp > 0 ? t.scoreComp / t.compteComp : null,
    };
  }, [rows]);

  const rowToArr = (row, asString) => [
    fmtYM(row.month), row.distance, row.nbrEntr || "", row.nbrComp || "",
    row.paille || "", row.blason || "", row.compteTotal || "", row.total || "",
    row.moyEntr != null ? (asString ? row.moyEntr.toFixed(2) : parseFloat(row.moyEntr.toFixed(2))) : "",
    row.scoreMoyEntr ?? "",
    row.moyComp != null ? (asString ? row.moyComp.toFixed(2) : parseFloat(row.moyComp.toFixed(2))) : "",
    row.scoreMoyComp ?? "",
  ];

  const totalRowArr = (asString) => {
    const t = totalRowData;
    const fmt = (v) => (v != null ? (asString ? v.toFixed(2) : parseFloat(v.toFixed(2))) : "");
    return [
      `Total — Saison ${libelleSaison(filterSaison)}`, "", t.nbrEntr || "", t.nbrComp || "",
      t.paille || "", t.blason || "", t.compteTotal || "", t.total || "",
      fmt(t.moyEntr), "", fmt(t.moyComp), "",
    ];
  };

  const archerNom = user ? `${user.prenom} ${user.nom}` : "";

  const handleExportExcel = () => exporterExcel({
    titre: `Progression — ${archerNom} — Saison ${libelleSaison(filterSaison)}`,
    colonnes: EXPORT_COLS,
    lignes: rows.map((r) => rowToArr(r, false)),
    ligneTotal: totalRowArr(false),
    fichier: `progression-saison-${libelleSaison(filterSaison)}`,
    colonnesNumeriques: NUM_COLS,
    largeurs: [{ wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 18 }],
  });

  const handleExportPDF = () => exporterPDF({
    titre: `Progression — ${archerNom} — Saison ${libelleSaison(filterSaison)}`,
    colonnes: EXPORT_COLS,
    lignes: rows.map((r) => rowToArr(r, true)),
    ligneTotal: totalRowArr(true),
    fichier: `progression-saison-${libelleSaison(filterSaison)}`,
    colonnesNumeriques: NUM_COLS,
    largeursColonnes: [24, 12, 14, 14, 10, 10, 10, 12, 18, 22, 18, 0],
  });

  if (loading) return <div style={ui.info}>Chargement…</div>;
  if (error) return <div style={ui.erreur}>{error}</div>;

  return (
    <div style={s.page}>
      <div style={ui.barre}>
        <div style={ui.filtres}>
          <FilterSelect label="Saison" value={filterSaison} options={saisons} onChange={setFilterSaison} libelle={libelleSaison} />
          <FilterSelect label="Distance" value={filterDist} options={DISTANCES} onChange={setFilterDist} />
        </div>
        <div style={ui.filtres}>
          <button style={{ ...ui.boutonSecondaire, ...(rows.length === 0 ? s.off : {}) }} onClick={handleExportExcel} disabled={rows.length === 0}>↓ Excel</button>
          <button style={{ ...ui.boutonSecondaire, ...(rows.length === 0 ? s.off : {}) }} onClick={handleExportPDF} disabled={rows.length === 0}>↓ PDF</button>
        </div>
      </div>

      {objSummary.length > 0 && (
        <section style={s.section}>
          <div style={s.sectionTete}>
            <h3 style={ui.titreSection}>Objectifs</h3>
            <span style={ui.sousTitre}>moyenne des 3 meilleures épreuves complètes de la saison</span>
          </div>
          <div style={{ ...ui.carte, overflow: "hidden" }}>
            {objSummary.map(({ dist, objScore, nf, comp, entr }, i) => (
              <div key={dist} style={{ ...s.objRow, ...(i > 0 ? { borderTop: "1px solid var(--border)" } : {}) }}>
                <div style={s.objTete}>
                  <span style={s.objDistance}>{dist}</span>
                  <span style={ui.sousTitre}>objectif <strong style={s.fort}>{objScore}</strong> / {nf * 10}</span>
                </div>
                <ObjGauge label="Entraînement" color={PRIMARY} row={entr} />
                <ObjGauge label="Compétition" color={BLUE} row={comp} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={s.section}>
        <div style={s.sectionTete}>
          <h3 style={ui.titreSection}>Par mois</h3>
          {rows.length > 0 && <span style={ui.sousTitre}>{rows.length} ligne{rows.length > 1 ? "s" : ""}</span>}
        </div>

        {rows.length === 0 ? (
          <div style={ui.vide}>Aucune séance trouvée.</div>
        ) : etroit ? (
          // Téléphone : une carte par mois et par distance.
          <div style={s.cartes}>
            {rows.map((row, i) => (
              <div key={i} style={{ ...ui.carte, ...s.carteMois }}>
                <div style={s.carteMoisTete}>
                  <span style={s.carteMoisTitre}>{fmtYM(row.month)} · {row.distance}</span>
                  <span style={ui.sousTitre}><strong style={s.fort}>{row.total}</strong> flèches</span>
                </div>
                <span style={ui.sousTitre}>
                  {[["paille", row.paille], ["blason", row.blason], ["compté", row.compteTotal]]
                    .filter(([, n]) => n > 0).map(([l, n]) => `${l} ${n}`).join(" · ") || "—"}
                </span>
                <LigneType label="Entraînement" couleur={PRIMARY} nb={row.nbrEntr} moy={row.moyEntr} score={row.scoreMoyEntr} />
                <LigneType label="Compétition" couleur={BLUE} nb={row.nbrComp} moy={row.moyComp} score={row.scoreMoyComp} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ ...ui.carte, overflowX: "auto" }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th} rowSpan={2}>Mois</th>
                  <th style={s.th} rowSpan={2}>Distance</th>
                  <th style={s.thGrp} colSpan={2}>Séances</th>
                  <th style={s.thGrp} colSpan={4}>Flèches</th>
                  <th style={s.thGrp} colSpan={2}><span style={s.grpType}><span style={ui.point(PRIMARY)} />Entraînement</span></th>
                  <th style={s.thGrp} colSpan={2}><span style={s.grpType}><span style={ui.point(BLUE)} />Compétition</span></th>
                </tr>
                <tr>
                  {["Entr.", "Comp.", "Paille", "Blason", "Compté", "Total", "Moy.", "Score moy.", "Moy.", "Score moy."].map((h, i) => (
                    <th key={i} style={{ ...s.th, textAlign: "right" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={s.tr}>
                    <td style={{ ...s.td, fontWeight: "600", color: "var(--text)" }}>{fmtYM(row.month)}</td>
                    <td style={s.td}>{row.distance}</td>
                    <td style={s.tdNum}>{row.nbrEntr || "—"}</td>
                    <td style={s.tdNum}>{row.nbrComp || "—"}</td>
                    <td style={s.tdNum}>{row.paille || "—"}</td>
                    <td style={s.tdNum}>{row.blason || "—"}</td>
                    <td style={s.tdNum}>{row.compteTotal || "—"}</td>
                    <td style={{ ...s.tdNum, fontWeight: "700", color: "var(--text)" }}>{row.total || "—"}</td>
                    <td style={s.tdNum}>{fmtDec(row.moyEntr)}</td>
                    <td style={{ ...s.tdNum, fontWeight: "700", color: row.scoreMoyEntr != null ? PRIMARY : "var(--text-dim)" }}>{fmtInt(row.scoreMoyEntr)}</td>
                    <td style={s.tdNum}>{fmtDec(row.moyComp)}</td>
                    <td style={{ ...s.tdNum, fontWeight: "700", color: row.scoreMoyComp != null ? BLUE : "var(--text-dim)" }}>{fmtInt(row.scoreMoyComp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// Une ligne Entraînement / Compétition d'une carte de mois (téléphone).
function LigneType({ label, couleur, nb, moy, score }) {
  if (!nb) return null;
  return (
    <div style={s.ligneType}>
      <span style={s.grpType}><span style={ui.point(couleur)} /><span style={s.ligneTypeNom}>{label}</span></span>
      <span style={ui.sousTitre}>
        {nb} séance{nb > 1 ? "s" : ""}
        {moy != null && <> · moy. <strong style={s.fort}>{moy.toFixed(2)}</strong></>}
        {score != null && <> · score moy. <strong style={{ ...s.fort, color: couleur }}>{score}</strong></>}
      </span>
    </div>
  );
}

function ObjGauge({ label, color, row }) {
  const { current, delta, pct } = row;
  const hasData = current != null;
  const barColor = !hasData ? "var(--border)" : pct >= 100 ? "var(--ok)" : pct >= 80 ? color : pct >= 60 ? "var(--warn)" : "var(--bad)";
  const deltaStr = delta == null ? null : delta >= 0 ? `+${delta}` : `${delta}`;
  const deltaCol = delta == null ? "var(--text-dim)" : delta >= 0 ? "var(--ok)" : "var(--bad)";
  return (
    <div style={s.jauge}>
      <span style={{ ...s.grpType, width: "120px", flexShrink: 0 }}><span style={ui.point(color)} /><span style={s.ligneTypeNom}>{label}</span></span>
      <div style={s.jaugePiste}>
        <div style={{ height: "100%", width: `${pct}%`, backgroundColor: barColor, borderRadius: "10px", transition: "width 0.5s ease" }} />
      </div>
      <span style={{ ...s.fort, width: "36px", textAlign: "right", flexShrink: 0, color: hasData ? "var(--text)" : "var(--text-dim)" }}>{hasData ? current : "—"}</span>
      <span style={{ fontSize: "12px", fontWeight: "700", color: deltaCol, width: "38px", flexShrink: 0 }}>{deltaStr ?? ""}</span>
    </div>
  );
}

const s = {
  page: { display: "flex", flexDirection: "column", gap: "22px" },
  off: { opacity: 0.4, cursor: "not-allowed" },
  section: { display: "flex", flexDirection: "column", gap: "10px" },
  sectionTete: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px 14px", flexWrap: "wrap" },
  fort: { fontWeight: "700", color: "var(--text)" },

  objRow: { display: "flex", flexDirection: "column", gap: "8px", padding: "14px 18px" },
  objTete: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" },
  objDistance: { fontFamily: "var(--display)", fontSize: "17px", fontWeight: "600", color: "var(--text)" },
  jauge: { display: "flex", alignItems: "center", gap: "10px" },
  jaugePiste: { flex: 1, height: "6px", backgroundColor: "var(--input-bg)", borderRadius: "10px", overflow: "hidden" },

  grpType: { display: "inline-flex", alignItems: "center", gap: "6px" },
  ligneType: { display: "flex", flexDirection: "column", gap: "2px" },
  ligneTypeNom: { fontSize: "13px", fontWeight: "600", color: "var(--text-2)" },

  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th: {
    padding: "9px 12px", fontSize: "12px", fontWeight: "600", color: "var(--text-muted)", textAlign: "left",
    borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", backgroundColor: "var(--surface-raised)",
  },
  thGrp: {
    padding: "9px 12px", fontSize: "12px", fontWeight: "700", color: "var(--text-2)", textAlign: "center",
    borderBottom: "1px solid var(--border)", borderLeft: "1px solid var(--border)", whiteSpace: "nowrap",
    backgroundColor: "var(--surface-raised)",
  },
  tr: { borderBottom: "1px solid var(--border)" },
  td: { padding: "10px 12px", color: "var(--text-2)", whiteSpace: "nowrap" },
  tdNum: { padding: "10px 12px", textAlign: "right", color: "var(--text-2)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },

  cartes: { display: "flex", flexDirection: "column", gap: "10px" },
  carteMois: { padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px" },
  carteMoisTete: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" },
  carteMoisTitre: { fontFamily: "var(--display)", fontSize: "16px", fontWeight: "600", color: "var(--text)" },
};
