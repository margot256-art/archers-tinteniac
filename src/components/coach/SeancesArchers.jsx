import { useState, useMemo, Fragment } from "react";
import { useAllSeances } from "../../hooks/useAllSeances";
import XLSX from "xlsx-js-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PRIMARY   = "#FF007A";
const BLUE      = "#3b82f6";
const DISTANCES = ["Toutes", "5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const TYPES     = ["Tous", "Entraînement", "Compétition"];

const normFactor = (dist) => (dist === "5m" || dist === "18m") ? 60 : 72;
const getPaille  = (s) => s.paille  ?? s.volumePaille  ?? 0;
const getBlason  = (s) => s.blason  ?? s.volumeBlason  ?? 0;
const getCompte  = (s) => s.compte  ?? s.volumeCompte  ?? 0;

const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

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

// ── Composant principal ───────────────────────────────────────────────────────

export default function SeancesArchers() {
  const { seances, loading, error } = useAllSeances();
  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);
  const [filterArcher, setFilterArcher] = useState("Tous");
  const [filterType,   setFilterType]   = useState("Tous");
  const [filterDist,   setFilterDist]   = useState("Toutes");

  const saisons = useMemo(() => {
    const set = new Set(seances.filter(s => s.date).map(s => getSaison(s.date)));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [seances]);

  const saisonSeances = useMemo(() =>
    seances.filter(s => s.date && getSaison(s.date) === filterSaison),
    [seances, filterSaison]
  );

  const archerOptions = useMemo(() => {
    const names = [...new Set(saisonSeances.map(s => s.archer).filter(Boolean))].sort();
    return ["Tous", ...names];
  }, [saisonSeances]);

  const filtered = useMemo(() =>
    saisonSeances.filter(s => {
      const okA = filterArcher === "Tous"   || s.archer   === filterArcher;
      const okT = filterType   === "Tous"   || s.type     === filterType;
      const okD = filterDist   === "Toutes" || s.distance === filterDist;
      return okA && okT && okD;
    }),
    [saisonSeances, filterArcher, filterType, filterDist]
  );

  const groupedByMonth = useMemo(() => {
    const map = {};
    for (const s of filtered) {
      if (!s.date) continue;
      const month = s.date.slice(0, 7);
      if (!map[month]) map[month] = [];
      map[month].push(s);
    }
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, rows]) => ({
        month,
        rows: rows.sort((a, b) => b.date.localeCompare(a.date)),
      }));
  }, [filtered]);

  // ── Export helpers ────────────────────────────────────────────────────────

  const buildMonthTotals = (group) => {
    const tp     = group.reduce((n, x) => n + getPaille(x), 0);
    const tb     = group.reduce((n, x) => n + getBlason(x), 0);
    const scored = group.filter(x => getCompte(x) > 0 && (x.score ?? 0) > 0);
    const tc     = scored.reduce((n, x) => n + getCompte(x), 0);
    const ts     = scored.reduce((n, x) => n + x.score, 0);
    const tt     = tp + tb + group.reduce((n, x) => n + getCompte(x), 0);
    const tmoy   = tc > 0 ? ts / tc : null;
    const dists  = [...new Set(scored.map(x => x.distance))];
    const tscoreMoy = tmoy != null && dists.length === 1
      ? Math.round(tmoy * normFactor(dists[0])) : null;
    return { tp, tb, tc, ts, tt, tmoy, tscoreMoy };
  };

  const COL_HEADS  = ["Date","Archer","Type","Lieu","Dist.","Paille","Blason","Compté","Score","Total fl.","Moy./fl.","Score moy.","Commentaire"];
  const NC         = 13;
  const RIGHT_COLS = [5, 6, 7, 8, 9, 10, 11];

  const exportTitle = filterArcher !== "Tous"
    ? `Séances archers — ${filterArcher} — Saison ${filterSaison}`
    : `Séances archers — Saison ${filterSaison}`;

  const handleExportExcel = () => {
    const numCols = RIGHT_COLS;
    const aoa     = [];
    const merges  = [];
    const rowMeta = [];

    aoa.push([exportTitle, ...Array(NC - 1).fill("")]);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: NC - 1 } });
    rowMeta.push({ type: "title" });
    aoa.push(Array(NC).fill(""));
    rowMeta.push({ type: "empty" });

    groupedByMonth.forEach(({ month, rows: group }) => {
      const mR = aoa.length;
      aoa.push([fmtMois(month), ...Array(NC - 1).fill("")]);
      merges.push({ s: { r: mR, c: 0 }, e: { r: mR, c: NC - 1 } });
      rowMeta.push({ type: "month" });

      aoa.push([...COL_HEADS]);
      rowMeta.push({ type: "header" });

      group.forEach((s, i) => {
        const p   = getPaille(s);
        const b   = getBlason(s);
        const c   = getCompte(s);
        const moy = c > 0 && (s.score ?? 0) > 0 ? s.score / c : null;
        aoa.push([
          s.date || "", s.archer || "", s.type || "", s.lieu || "", s.distance || "",
          p, b, c, s.score ?? "", p + b + c || "",
          moy != null ? parseFloat(moy.toFixed(2)) : "",
          moy != null ? Math.round(moy * normFactor(s.distance)) : "",
          s.commentaire || "",
        ]);
        rowMeta.push({ type: "data", even: i % 2 === 0 });
      });

      const { tp, tb, tc, ts, tt, tmoy, tscoreMoy } = buildMonthTotals(group);
      aoa.push([
        `Total — ${fmtMois(month)}`, "", "", "", "",
        tp, tb, tc, ts || "", tt || "",
        tmoy != null ? parseFloat(tmoy.toFixed(2)) : "",
        tscoreMoy ?? "", "",
      ]);
      rowMeta.push({ type: "total" });
      aoa.push(Array(NC).fill(""));
      rowMeta.push({ type: "empty" });
    });

    const ws      = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = merges;
    ws["!cols"]   = [
      { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 7 },
      { wch: 8  }, { wch: 8  }, { wch: 8  }, { wch: 8  }, { wch: 10 },
      { wch: 10 }, { wch: 12 }, { wch: 34 },
    ];

    const ST = {
      title: {
        font: { bold: true, sz: 13, color: { rgb: "FFFFFF" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "B30057" } },
        alignment: { horizontal: "left", vertical: "center" },
      },
      month: {
        font: { bold: true, sz: 11, color: { rgb: "FFFFFF" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "FF007A" } },
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
      total: (c) => ({
        font: { bold: true, sz: 9, color: { rgb: "FFFFFF" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "FF007A" } },
        alignment: { horizontal: numCols.includes(c) ? "right" : "left", vertical: "center" },
        border: {
          top:    { style: "medium", color: { rgb: "B30057" } },
          bottom: { style: "thin",   color: { rgb: "B30057" } },
        },
      }),
    };

    const rowHeights = [];
    rowMeta.forEach((meta, r) => {
      if (meta.type === "empty") return;
      if (meta.type === "title")  rowHeights[r] = { hpx: 28 };
      if (meta.type === "month")  rowHeights[r] = { hpx: 20 };
      if (meta.type === "header") rowHeights[r] = { hpx: 18 };
      for (let c = 0; c < NC; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { v: "", t: "s" };
        ws[addr].s =
          meta.type === "title"  ? ST.title :
          meta.type === "month"  ? ST.month :
          meta.type === "header" ? ST.header(c) :
          meta.type === "total"  ? ST.total(c) :
          meta.even              ? ST.dataEven(c) : ST.dataOdd(c);
      }
    });
    ws["!rows"] = rowHeights;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Séances");
    XLSX.writeFile(wb, `seances-archers-${filterSaison.replace("/", "-")}.xlsx`);
  };

  const handleExportPDF = () => {
    const pdf   = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw    = pdf.internal.pageSize.width;
    const ph    = pdf.internal.pageSize.height;
    const COL_W = [20, 26, 22, 20, 10, 12, 12, 12, 12, 14, 14, 14, 0];

    const colStyles = COL_W.reduce((acc, w, i) => {
      acc[i] = w > 0 ? { cellWidth: w } : {};
      if (RIGHT_COLS.includes(i)) acc[i].halign = "right";
      return acc;
    }, {});

    const drawTitle = () => {
      pdf.setFillColor(179, 0, 87);
      pdf.rect(0, 0, pw, 14, "F");
      pdf.setFontSize(11);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.text(exportTitle, 14, 9.5);
    };
    drawTitle();

    let startY = 18;

    groupedByMonth.forEach(({ month, rows: group }) => {
      if (startY > ph - 30) {
        pdf.addPage();
        drawTitle();
        startY = 18;
      }

      const body = group.map(s => {
        const p   = getPaille(s);
        const b   = getBlason(s);
        const c   = getCompte(s);
        const moy = c > 0 && (s.score ?? 0) > 0 ? s.score / c : null;
        return [
          fmtDate(s.date), s.archer || "", s.type || "", s.lieu || "", s.distance || "",
          p || 0, b || 0, c || 0, s.score ?? "",
          p + b + c || "",
          moy != null ? moy.toFixed(2) : "",
          moy != null ? Math.round(moy * normFactor(s.distance)) : "",
          s.commentaire || "",
        ];
      });

      const { tp, tb, tc, ts, tt, tmoy, tscoreMoy } = buildMonthTotals(group);
      const totalRow = [
        `Total — ${fmtMois(month)}`, "", "", "", "",
        tp, tb, tc, ts || "", tt || "",
        tmoy != null ? tmoy.toFixed(2) : "",
        tscoreMoy ?? "", "",
      ];

      autoTable(pdf, {
        head: [
          [{ content: fmtMois(month).toUpperCase(), colSpan: NC, styles: {
            fillColor: [255, 0, 122], textColor: [255, 255, 255],
            fontStyle: "bold", fontSize: 9, halign: "left",
            cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
          }}],
          COL_HEADS,
        ],
        body: [...body, totalRow],
        startY,
        margin: { left: 14, right: 14, top: 18 },
        styles: { fontSize: 7.5, cellPadding: 2, font: "helvetica" },
        headStyles: {
          fillColor: [255, 204, 229], textColor: [0, 0, 0],
          fontStyle: "bold", fontSize: 8,
        },
        bodyStyles: { textColor: [32, 32, 32], fillColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [255, 240, 246] },
        columnStyles: colStyles,
        didParseCell: ({ row, cell, section }) => {
          if (section === "body" && row.index === body.length) {
            cell.styles.fillColor = [255, 0, 122];
            cell.styles.textColor = [255, 255, 255];
            cell.styles.fontStyle = "bold";
          }
        },
        didDrawPage: () => {
          drawTitle();
          pdf.setFontSize(8);
          pdf.setTextColor(180, 0, 86);
          pdf.setFont("helvetica", "normal");
          pdf.text(`Page ${pdf.internal.getNumberOfPages()}`, pw - 20, ph - 6);
        },
      });

      const nextY = pdf.lastAutoTable.finalY + 6;
      startY = nextY > ph - 30 ? ph : nextY;
    });

    pdf.save(`seances-archers-${filterSaison.replace("/", "-")}.pdf`);
  };

  if (loading) return <div style={s.info}>Chargement…</div>;
  if (error)   return <div style={s.errMsg}>{error}</div>;

  return (
    <div style={s.page}>

      {/* ── Sélecteur de saison ── */}
      <div style={s.saisonBar}>
        <CalendarIcon />
        <span style={s.saisonLabel}>Saison</span>
        <select
          value={filterSaison}
          onChange={e => { setFilterSaison(e.target.value); setFilterArcher("Tous"); }}
          style={s.saisonSelect}
        >
          {saisons.map(sn => <option key={sn} value={sn}>{sn}</option>)}
        </select>
      </div>

      {/* ── Filtres + Export ── */}
      <div className="coach-filter-bar">
        <div className="coach-filter-group">
          <FilterSelect label="Archer"   value={filterArcher} options={archerOptions} onChange={setFilterArcher} />
          <FilterSelect label="Type"     value={filterType}   options={TYPES}         onChange={setFilterType} />
          <FilterSelect label="Distance" value={filterDist}   options={DISTANCES}     onChange={setFilterDist} />
        </div>
        <button
          style={{ ...s.exportBtn, ...(filtered.length === 0 ? { opacity: 0.4, cursor: "not-allowed" } : {}) }}
          onClick={handleExportExcel}
          disabled={filtered.length === 0}
          title="Exporter en Excel (.xlsx)"
        >↓ Excel</button>
        <button
          style={{ ...s.exportBtn, ...(filtered.length === 0 ? { opacity: 0.4, cursor: "not-allowed" } : {}) }}
          onClick={handleExportPDF}
          disabled={filtered.length === 0}
          title="Exporter en PDF"
        >↓ PDF</button>
      </div>

      {/* ── Tableau ── */}
      <div style={s.tableWrap}>
        <table style={s.table} className="coach-table">
          <thead>
            <tr>
              <th style={s.th}>Date</th>
              <th style={s.th}>Archer</th>
              <th style={s.th}>Type</th>
              <th style={s.th}>Lieu</th>
              <th style={s.th}>Dist.</th>
              <th style={s.thR}>Paille</th>
              <th style={s.thR}>Blason</th>
              <th style={s.thR}>Compté</th>
              <th style={s.thR}>Score</th>
              <th style={s.thR}>Total</th>
              <th style={s.thR}>Moy./fl.</th>
              <th style={s.thR}>Score moy.</th>
              <th style={s.th}>Commentaire</th>
            </tr>
          </thead>
          <tbody>
            {groupedByMonth.length === 0 ? (
              <tr><td colSpan={13} style={s.empty}>Aucune séance trouvée.</td></tr>
            ) : groupedByMonth.map(({ month, rows }) => {
              const subP   = rows.reduce((n, s) => n + getPaille(s), 0);
              const subB   = rows.reduce((n, s) => n + getBlason(s), 0);
              const subC   = rows.reduce((n, s) => n + getCompte(s), 0);
              const subSc  = rows.reduce((n, s) => n + (s.score ?? 0), 0);
              const subTot = subP + subB + subC;
              const scored = rows.filter(s => getCompte(s) > 0 && (s.score ?? 0) > 0);
              const subMoy = scored.length > 0
                ? scored.reduce((sum, s) => sum + s.score / getCompte(s), 0) / scored.length
                : null;
              const subSm = scored.length > 0
                ? Math.round(scored.reduce((sum, s) => sum + (s.score / getCompte(s)) * normFactor(s.distance), 0) / scored.length)
                : null;
              return (
                <Fragment key={month}>
                  {rows.map(seance => {
                    const p   = getPaille(seance);
                    const b   = getBlason(seance);
                    const c   = getCompte(seance);
                    const sc  = seance.score ?? 0;
                    const tot = p + b + c;
                    const moy = c > 0 && sc > 0 ? sc / c : null;
                    const sm  = moy != null ? Math.round(moy * normFactor(seance.distance)) : null;
                    return (
                      <tr key={seance.id} style={s.tr}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = "#1f1f1f"}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}
                      >
                        <td style={s.td}>{fmtDate(seance.date)}</td>
                        <td style={{ ...s.td, fontWeight: "700" }}>{seance.archer || "—"}</td>
                        <td style={s.td}>
                          <span style={seance.type === "Compétition" ? s.typeComp : s.typeEntr}>
                            {seance.type || "—"}
                          </span>
                        </td>
                        <td style={{ ...s.td, color: "#666" }}>{seance.lieu || "—"}</td>
                        <td style={s.td}>
                          {seance.distance ? <span style={s.distBadge}>{seance.distance}</span> : "—"}
                        </td>
                        <td style={s.tdR}>{p > 0 ? p : "—"}</td>
                        <td style={s.tdR}>{b > 0 ? b : "—"}</td>
                        <td style={s.tdR}>{c > 0 ? c : "—"}</td>
                        <td style={{ ...s.tdR, fontWeight: "600" }}>{sc > 0 ? sc : "—"}</td>
                        <td style={s.tdR}>{tot > 0 ? tot : "—"}</td>
                        <td style={{ ...s.tdR, color: moy != null ? PRIMARY : "#555", fontWeight: "600" }}>
                          {moy != null ? moy.toFixed(2) : "—"}
                        </td>
                        <td style={{ ...s.tdR, fontWeight: sm != null ? "700" : "400", color: sm != null ? "#e8e8e8" : "#555" }}>
                          {sm != null ? sm : "—"}
                        </td>
                        <td style={{ ...s.td, color: "#999", minWidth: "160px", maxWidth: "320px", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "1.4" }}>
                          {seance.commentaire || "—"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr key={`sub-${month}`} style={s.trSub}>
                    <td style={{ ...s.tdSub, textAlign: "left" }}>{fmtMois(month)}</td>
                    <td style={{ ...s.tdSub, textAlign: "left" }}>{rows.length} séance{rows.length > 1 ? "s" : ""}</td>
                    <td style={s.tdSub} /><td style={s.tdSub} /><td style={s.tdSub} />
                    <td style={{ ...s.tdSub, textAlign: "right" }}>{subP > 0 ? subP : "—"}</td>
                    <td style={{ ...s.tdSub, textAlign: "right" }}>{subB > 0 ? subB : "—"}</td>
                    <td style={{ ...s.tdSub, textAlign: "right" }}>{subC > 0 ? subC : "—"}</td>
                    <td style={{ ...s.tdSub, textAlign: "right" }}>{subSc > 0 ? subSc : "—"}</td>
                    <td style={{ ...s.tdSub, textAlign: "right" }}>{subTot > 0 ? subTot : "—"}</td>
                    <td style={{ ...s.tdSub, textAlign: "right" }}>{subMoy != null ? subMoy.toFixed(2) : "—"}</td>
                    <td style={{ ...s.tdSub, textAlign: "right" }}>{subSm != null ? subSm : "—"}</td>
                    <td style={s.tdSub} />
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div style={s.count}>
          {filtered.length} séance{filtered.length > 1 ? "s" : ""}
          {filtered.length !== saisonSeances.length && ` (sur ${saisonSeances.length} cette saison)`}
        </div>
      )}
    </div>
  );
}

// ── Sous-composants ───────────────────────────────────────────────────────────

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

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
      stroke="#7ba7e0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8"  y1="2" x2="8"  y2="6" />
      <line x1="3"  y1="10" x2="21" y2="10" />
    </svg>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  page:   { display: "flex", flexDirection: "column", gap: "20px" },
  info:   { color: "#777", fontSize: "14px" },
  errMsg: {
    color: PRIMARY, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "rgba(255,0,122,0.1)", borderRadius: "8px", border: `1px solid ${PRIMARY}`,
  },

  saisonBar: {
    backgroundColor: "#1a2744", borderRadius: "10px",
    padding: "13px 18px",
    display: "flex", alignItems: "center", gap: "10px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
    alignSelf: "flex-start",
  },
  saisonLabel: {
    fontSize: "13px", fontWeight: "700", color: "#c8d8f0",
    textTransform: "uppercase", letterSpacing: "0.08em",
  },
  saisonSelect: {
    backgroundColor: "#243660", color: "#e0eaf8",
    border: "1px solid #2e4a80", borderRadius: "7px",
    padding: "7px 12px", fontSize: "14px", fontWeight: "600",
    outline: "none", fontFamily: "inherit", cursor: "pointer",
  },

  filterLabel: {
    fontSize: "12px", fontWeight: "600", color: "#777",
    textTransform: "uppercase", letterSpacing: "0.06em",
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
  th: {
    padding: "11px 12px", textAlign: "left",
    fontSize: "11px", fontWeight: "700", color: "#666",
    textTransform: "uppercase", letterSpacing: "0.07em",
    borderBottom: "1px solid #2a2a2a", whiteSpace: "nowrap",
    backgroundColor: "#1e1e1e",
  },
  thR: {
    padding: "11px 12px", textAlign: "right",
    fontSize: "11px", fontWeight: "700", color: "#666",
    textTransform: "uppercase", letterSpacing: "0.07em",
    borderBottom: "1px solid #2a2a2a", whiteSpace: "nowrap",
    backgroundColor: "#1e1e1e",
  },
  tr:  { borderBottom: "1px solid #1e1e1e", transition: "background-color 0.1s" },
  td:  { padding: "10px 12px", color: "#d0d0d0", whiteSpace: "nowrap" },
  tdR: { padding: "10px 12px", textAlign: "right", color: "#ccc", whiteSpace: "nowrap" },

  typeEntr: {
    backgroundColor: "rgba(255,0,122,0.15)", color: PRIMARY,
    borderRadius: "5px", padding: "2px 8px", fontSize: "11px", fontWeight: "600",
  },
  typeComp: {
    backgroundColor: "rgba(59,130,246,0.15)", color: BLUE,
    borderRadius: "5px", padding: "2px 8px", fontSize: "11px", fontWeight: "600",
  },
  distBadge: {
    backgroundColor: "#2a2a2a", borderRadius: "5px",
    padding: "2px 7px", fontSize: "11px", fontWeight: "600", color: "#bbb",
  },

  trSub: { backgroundColor: "#222", borderTop: "1px solid #2a2a2a", borderBottom: "1px solid #2a2a2a" },
  tdSub: { padding: "9px 12px", color: "#aaa", fontSize: "12px", fontWeight: "600", fontStyle: "italic" },

  empty: { padding: "40px", textAlign: "center", color: "#555", fontSize: "14px" },
  count: { fontSize: "12px", color: "#555", textAlign: "right" },
};
