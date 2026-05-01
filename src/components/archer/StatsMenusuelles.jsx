import { useState, useEffect, useMemo } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../hooks/useAuth";
import { useSeances } from "../../hooks/useSeances";
import XLSX from "xlsx-js-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

const DIST_ORDER = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];

export default function StatsMenusuelles() {
  const { user }                        = useAuth();
  const { seances, loading, error }     = useSeances();
  const [filterDist,   setFilterDist]   = useState("Toutes");
  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);
  const [objectives,   setObjectives]   = useState({});

  useEffect(() => {
    if (!user) return;
    const archerId = user.id ?? `${user.prenom.toLowerCase()}_${user.nom.toLowerCase()}`;
    const unsub = onSnapshot(doc(db, "objectifs", archerId), snap =>
      setObjectives(snap.exists() ? (snap.data().distances ?? {}) : {})
    );
    return () => unsub();
  }, [user]);

  // Top 3 compétition + top 3 entraînement par distance vs objectif
  const objSummary = useMemo(() => {
    const entries = Object.entries(objectives);
    if (!entries.length) return [];

    const top3avg = (dist, type) => {
      const nf   = normFactor(dist);
      const list = seances
        .filter(s => s.distance === dist && s.type === type && getCompte(s) > 0 && (s.score ?? 0) > 0)
        .map(s => Math.round((s.score / getCompte(s)) * nf))
        .sort((a, b) => b - a)
        .slice(0, 3);
      return { avg: list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null, nb: list.length };
    };

    return entries
      .map(([dist, objScore]) => {
        const nf   = normFactor(dist);
        const comp = top3avg(dist, "Compétition");
        const entr = top3avg(dist, "Entraînement");
        const mkRow = (avg) => ({
          current: avg,
          delta:   avg != null ? avg - objScore : null,
          pct:     avg != null ? Math.min(100, Math.round((avg / objScore) * 100)) : 0,
        });
        return { dist, objScore, nf, comp: { ...mkRow(comp.avg), nb: comp.nb }, entr: { ...mkRow(entr.avg), nb: entr.nb } };
      })
      .sort((a, b) => DIST_ORDER.indexOf(a.dist) - DIST_ORDER.indexOf(b.dist));
  }, [seances, objectives]);

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

  // ── Export helpers ────────────────────────────────────────────────────────

  const EXPORT_COLS = [
    "Mois", "Distance", "Séances Entr.", "Séances Comp.",
    "Paille", "Blason", "Compté", "Score", "Total fl.",
    "Moy./fl. Entr.", "Score moy. Entr.",
    "Moy./fl. Comp.", "Score moy. Comp.",
  ];
  const EXPORT_NC       = EXPORT_COLS.length; // 13
  const EXPORT_NUM_COLS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const rowToArr = (row, asString = false) => [
    fmtMois(row.month),
    row.distance,
    row.nbrEntr     || "",
    row.nbrComp     || "",
    row.paille      || "",
    row.blason      || "",
    row.compteTotal || "",
    row.score       || "",
    row.total       || "",
    row.moyEntr  != null ? (asString ? row.moyEntr.toFixed(2)  : parseFloat(row.moyEntr.toFixed(2)))  : "",
    row.scoreMoyEntr ?? "",
    row.moyComp  != null ? (asString ? row.moyComp.toFixed(2)  : parseFloat(row.moyComp.toFixed(2)))  : "",
    row.scoreMoyComp ?? "",
  ];

  // ── Export Excel ──────────────────────────────────────────────────────────

  const handleExportExcel = () => {
    const NC      = EXPORT_NC;
    const archer  = user ? `${user.prenom} ${user.nom}` : "";
    const numCols = EXPORT_NUM_COLS;

    const aoa     = [];
    const merges  = [];
    const rowMeta = [];

    // Titre
    aoa.push([`Stats mensuelles — ${archer} — Saison ${filterSaison}`, ...Array(NC - 1).fill("")]);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: NC - 1 } });
    rowMeta.push({ type: "title" });
    aoa.push(Array(NC).fill(""));
    rowMeta.push({ type: "empty" });

    // En-tête colonnes
    aoa.push([...EXPORT_COLS]);
    rowMeta.push({ type: "header" });

    // Données
    rows.forEach((row, i) => {
      aoa.push(rowToArr(row, false));
      rowMeta.push({ type: "data", even: i % 2 === 0 });
    });

    const ws      = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = merges;
    ws["!cols"]   = [
      { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
      { wch: 8  }, { wch: 8  }, { wch: 8  }, { wch: 8  },
      { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 18 },
    ];

    const ST = {
      title: {
        font: { bold: true, sz: 13, color: { rgb: "FFFFFF" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "B30057" } },
        alignment: { horizontal: "left", vertical: "center" },
      },
      header: (c) => ({
        font: { bold: true, sz: 9, color: { rgb: "000000" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "FFCCE5" } },
        alignment: { horizontal: numCols.includes(c) ? "right" : "left", vertical: "center" },
        border: { bottom: { style: "medium", color: { rgb: "FF007A" } } },
      }),
      dataEven: (c) => ({
        font: { sz: 9, color: { rgb: "202020" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } },
        alignment: { horizontal: numCols.includes(c) ? "right" : "left", vertical: "center" },
      }),
      dataOdd: (c) => ({
        font: { sz: 9, color: { rgb: "202020" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "FFF0F6" } },
        alignment: { horizontal: numCols.includes(c) ? "right" : "left", vertical: "center" },
      }),
    };

    const rowHeights = [];
    rowMeta.forEach((meta, r) => {
      if (meta.type === "empty") return;
      if (meta.type === "title")  rowHeights[r] = { hpx: 28 };
      if (meta.type === "header") rowHeights[r] = { hpx: 18 };
      for (let c = 0; c < NC; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { v: "", t: "s" };
        ws[addr].s =
          meta.type === "title"  ? ST.title :
          meta.type === "header" ? ST.header(c) :
          meta.even              ? ST.dataEven(c) : ST.dataOdd(c);
      }
    });
    ws["!rows"] = rowHeights;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stats");
    XLSX.writeFile(wb, `stats-${filterSaison.replace("/", "-")}.xlsx`);
  };

  // ── Export PDF ────────────────────────────────────────────────────────────

  const handleExportPDF = () => {
    const pdf    = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const archer = user ? `${user.prenom} ${user.nom}` : "";
    const pw     = pdf.internal.pageSize.width;
    const ph     = pdf.internal.pageSize.height;
    // Mois(24) Dist(12) SéEntr(14) SéComp(14) Paille(10) Blason(10) Compté(10) Score(10) Total(12) MoyEntr(18) ScMoyEntr(22) MoyComp(18) ScMoyComp(auto)
    const COL_W  = [24, 12, 14, 14, 10, 10, 10, 10, 12, 18, 22, 18, 0];

    const colStyles = COL_W.reduce((acc, w, i) => {
      acc[i] = w > 0 ? { cellWidth: w } : {};
      if (EXPORT_NUM_COLS.includes(i)) acc[i].halign = "right";
      return acc;
    }, {});

    const drawTitle = () => {
      pdf.setFillColor(179, 0, 87);
      pdf.rect(0, 0, pw, 14, "F");
      pdf.setFontSize(11);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.text(`Stats mensuelles — ${archer} — Saison ${filterSaison}`, 14, 9.5);
    };
    drawTitle();

    autoTable(pdf, {
      head: [EXPORT_COLS],
      body: rows.map(row => rowToArr(row, true)),
      startY: 18,
      margin: { left: 14, right: 14, top: 18 },
      styles: { fontSize: 7.5, cellPadding: 2, font: "helvetica" },
      headStyles: {
        fillColor: [255, 204, 229], textColor: [0, 0, 0],
        fontStyle: "bold", fontSize: 8,
      },
      bodyStyles: { textColor: [32, 32, 32], fillColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [255, 240, 246] },
      columnStyles: colStyles,
      didDrawPage: () => {
        drawTitle();
        pdf.setFontSize(8);
        pdf.setTextColor(180, 0, 86);
        pdf.setFont("helvetica", "normal");
        pdf.text(`Page ${pdf.internal.getNumberOfPages()}`, pw - 20, ph - 6);
      },
    });

    pdf.save(`stats-${filterSaison.replace("/", "-")}.pdf`);
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>Stats mensuelles</h2>
        <div style={s.filters}>
          <FilterSelect label="Saison"   value={filterSaison} options={saisons}   onChange={setFilterSaison} />
          <FilterSelect label="Distance" value={filterDist}   options={DISTANCES} onChange={setFilterDist} />
          <button
            style={{ ...s.exportBtn, ...(rows.length === 0 ? { opacity: 0.4, cursor: "not-allowed" } : {}) }}
            onClick={handleExportExcel}
            disabled={rows.length === 0}
            title="Exporter en Excel (.xlsx)"
          >↓ Excel</button>
          <button
            style={{ ...s.exportBtn, ...(rows.length === 0 ? { opacity: 0.4, cursor: "not-allowed" } : {}) }}
            onClick={handleExportPDF}
            disabled={rows.length === 0}
            title="Exporter en PDF"
          >↓ PDF</button>
        </div>
      </div>

      {loading && <div style={s.info}>Chargement…</div>}
      {error   && <div style={s.errMsg}>{error}</div>}

      {/* Objectifs par distance */}
      {!loading && objSummary.length > 0 && (
        <div style={s.objCard}>
          <div style={s.objHeader}>
            <span style={s.objTitle}>Objectifs</span>
            <span style={s.objHint}>Moy. top 3 · score normalisé</span>
          </div>
          {objSummary.map(({ dist, objScore, nf, comp, entr }, i) => {
            const isLast = i === objSummary.length - 1;
            return (
              <div key={dist} style={{ ...s.objRow, ...(isLast ? { borderBottom: "none" } : {}) }}>
                {/* Distance */}
                <div style={s.objLeft}>
                  <span style={s.objBadge}>{dist}</span>
                  <span style={s.objMax}>/ {nf * 10} pts</span>
                </div>
                {/* Jauges */}
                <div style={s.objMiddle}>
                  <ObjGauge label="Comp." color={BLUE}    row={comp} objScore={objScore} />
                  <ObjGauge label="Entr." color={PRIMARY} row={entr} objScore={objScore} />
                  <div style={s.objObjLine}>
                    <span style={s.objObjVal}>objectif : {objScore}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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

function ObjGauge({ label, color, row, objScore }) {
  const { current, delta, pct } = row;
  const hasData  = current != null;
  const barColor = !hasData ? "#2a2a2a" : pct >= 100 ? "#16a34a" : pct >= 80 ? color : pct >= 60 ? "#f97316" : "#ef4444";
  const deltaStr = delta == null ? null : delta >= 0 ? `+${delta}` : `${delta}`;
  const deltaCol = delta == null ? "#555" : delta >= 0 ? "#16a34a" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <span style={{ fontSize: "10px", fontWeight: "700", color, width: "32px", flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: "5px", backgroundColor: "#252525", borderRadius: "10px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, backgroundColor: barColor, borderRadius: "10px", transition: "width 0.5s ease" }} />
      </div>
      <span style={{ fontSize: "13px", fontWeight: "700", color: hasData ? "#e0e0e0" : "#333", width: "32px", textAlign: "right", flexShrink: 0 }}>
        {hasData ? current : "—"}
      </span>
      {deltaStr
        ? <span style={{ fontSize: "11px", fontWeight: "700", color: deltaCol, width: "36px", flexShrink: 0 }}>{deltaStr}</span>
        : <span style={{ width: "36px", flexShrink: 0 }} />
      }
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
  exportBtn: {
    backgroundColor: "#2a2a2a", color: "#e0e0e0", border: "none",
    borderRadius: "7px", padding: "8px 14px", fontSize: "13px",
    fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
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

  // objectifs
  objCard: {
    backgroundColor: "#1a1a1a", borderRadius: "12px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
    overflow: "hidden",
  },
  objHeader: {
    display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
    padding: "16px 20px", borderBottom: "1px solid #222",
  },
  objTitle:  { fontSize: "13px", fontWeight: "700", color: "#c0c0c0", textTransform: "uppercase", letterSpacing: "0.06em" },
  objHint:   { fontSize: "11px", color: "#444", marginLeft: "auto" },
  objRow: {
    display: "grid",
    gridTemplateColumns: "80px 1fr",
    alignItems: "center",
    gap: "16px",
    padding: "14px 20px",
    borderBottom: "1px solid #1e1e1e",
  },
  objLeft:    { display: "flex", flexDirection: "column", gap: "4px" },
  objBadge:   { backgroundColor: "#252525", borderRadius: "5px", padding: "2px 8px", fontSize: "12px", fontWeight: "700", color: "#bbb", alignSelf: "flex-start" },
  objMax:     { fontSize: "10px", color: "#3a3a3a" },
  objMiddle:  { display: "flex", flexDirection: "column", gap: "7px" },
  objObjLine: { display: "flex", justifyContent: "flex-end" },
  objObjVal:  { fontSize: "10px", color: "#3a3a3a" },
};
