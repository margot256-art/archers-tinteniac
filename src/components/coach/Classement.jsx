import { useState, useMemo } from "react";
import { useAllSeances } from "../../hooks/useAllSeances";
import XLSX from "xlsx-js-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { PRIMARY, getCompte, normFactor, getSaison, CURRENT_SAISON, MOIS, fmtYM } from "../../utils/seances";
import { useChartColors } from "../../hooks/useChartColors";
import FilterSelect from "../shared/FilterSelect";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

// ── Constants ──────────────────────────────────────────────────────────────────

const ORANGE  = "#f97316";

const DISTANCES   = ["Toutes", "5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const TYPES       = ["Tous", "Entraînement", "Compétition"];
const GRAPH_TYPES = ["Entr. + Comp.", "Entraînement", "Compétition"];

const ARCHER_COLORS = [
  "#6366f1", "#22d3ee", "#a3e635", "#fb923c", "#e879f9",
  "#34d399", "#f472b6", "#60a5fa", "#fbbf24", "#a78bfa",
  "#f43f5e", "#0ea5e9", "#84cc16",
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const sumFleches = (s)   => s.totalFleches != null
  ? s.totalFleches
  : (s.paille ?? s.volumePaille ?? 0) + (s.blason ?? s.volumeBlason ?? 0) + getCompte(s);

function stdDev(vals) {
  if (vals.length < 2) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / vals.length);
}

function ordinal(n) {
  if (n === 1) return "1er";
  if (n === 2) return "2e";
  if (n === 3) return "3e";
  return `${n}`;
}

function regulariteLabel(sigma) {
  if (sigma < 0.5) return "Très régulier";
  if (sigma < 1.0) return "Régulier";
  return "Irrégulier";
}

const RANK_STYLE = {
  1: { backgroundColor: PRIMARY,   color: "#fff" },
  2: { backgroundColor: "#8e8e8e", color: "#fff" },
  3: { backgroundColor: "#b06e30", color: "#fff" },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function RangBadge({ rang }) {
  const extra = RANK_STYLE[rang] ?? { backgroundColor: "var(--input-bg)", color: "var(--text-dim)" };
  return <span style={{ ...s.rankBadge, ...extra }}>{ordinal(rang)}</span>;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Classement() {
  const { seances, loading, error } = useAllSeances();
  const colors = useChartColors();

  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);
  const [filterPeriod, setFilterPeriod] = useState("Toute la saison");
  const [filterDist,   setFilterDist]   = useState("Toutes");
  const [filterType,   setFilterType]   = useState("Tous");

  const [graphArcher, setGraphArcher] = useState("Tous les archers");
  const [graphDist,   setGraphDist]   = useState("Toutes distances");
  const [graphType,   setGraphType]   = useState("Entr. + Comp.");

  const saisonOptions = useMemo(() => {
    const set = new Set(seances.filter(s => s.date).map(s => getSaison(s.date)));
    set.add(CURRENT_SAISON);
    return ["Toutes", ...[...set].sort().reverse()];
  }, [seances]);

  const periodOptions = useMemo(() => {
    if (filterSaison === "Toutes") return ["Toute la saison"];
    const months = new Set();
    seances
      .filter(s => s.date && getSaison(s.date) === filterSaison)
      .forEach(s => {
        const [y, m] = s.date.split("-").map(Number);
        months.add(`${y}-${String(m).padStart(2, "0")}`);
      });
    const labels = [...months].sort().reverse().map(ym => {
      const [y, m] = ym.split("-").map(Number);
      return `${MOIS[m - 1]} ${y}`;
    });
    return ["Toute la saison", ...labels];
  }, [seances, filterSaison]);

  const rows = useMemo(() => {
    const src = seances.filter(s => {
      if (!s.date || !s.archer) return false;
      if (filterSaison !== "Toutes" && getSaison(s.date) !== filterSaison) return false;
      if (filterPeriod !== "Toute la saison") {
        const parts = filterPeriod.split(" ");
        const mIdx  = MOIS.indexOf(parts[0]);
        const ym    = `${parts[1]}-${String(mIdx + 1).padStart(2, "0")}`;
        if (!s.date.startsWith(ym)) return false;
      }
      if (filterDist !== "Toutes" && s.distance !== filterDist) return false;
      if (filterType !== "Tous"   && s.type     !== filterType)  return false;
      return true;
    });

    const map = {};
    for (const sess of src) {
      if (!map[sess.archer]) map[sess.archer] = { archer: sess.archer, sessions: [] };
      map[sess.archer].sessions.push(sess);
    }

    const computed = Object.values(map).map(({ archer, sessions }) => {
      const nbSeances    = sessions.length;
      const totalFleches = sessions.reduce((n, s) => n + sumFleches(s), 0);
      const withCompte   = sessions.filter(s => getCompte(s) > 0 && (s.score ?? 0) > 0);
      const moyennes     = withCompte.map(s => s.score / getCompte(s));
      const avgMoy       = moyennes.length
        ? moyennes.reduce((a, b) => a + b, 0) / moyennes.length
        : null;
      const scoreMoy     = withCompte.length
        ? Math.round(withCompte.reduce((sum, s) => sum + (s.score / getCompte(s)) * normFactor(s.distance), 0) / withCompte.length)
        : null;
      let bestNorm = null;
      for (const s of withCompte) {
        const n = Math.round((s.score / getCompte(s)) * normFactor(s.distance));
        if (bestNorm === null || n > bestNorm) bestNorm = n;
      }
      return { archer, nbSeances, totalFleches, avgMoy, scoreMoy, sigma: stdDev(moyennes), bestNorm };
    });

    computed.sort((a, b) => {
      const ma = a.avgMoy ?? -Infinity;
      const mb = b.avgMoy ?? -Infinity;
      return mb !== ma ? mb - ma : a.archer.localeCompare(b.archer);
    });

    for (let i = 0; i < computed.length; i++) {
      computed[i].rang = i > 0 && computed[i].avgMoy === computed[i - 1].avgMoy
        ? computed[i - 1].rang
        : i + 1;
    }

    return computed;
  }, [seances, filterSaison, filterPeriod, filterDist, filterType]);

  const allArchers = useMemo(() => {
    const set = new Set(seances.filter(s => s.archer).map(s => s.archer));
    return ["Tous les archers", ...[...set].sort()];
  }, [seances]);

  const graphDistOptions = useMemo(() => {
    const set = new Set(seances.filter(s => s.distance).map(s => s.distance));
    const ordered = DISTANCES.slice(1).filter(d => set.has(d));
    return ["Toutes distances", ...ordered];
  }, [seances]);

  const { chartData, chartOptions } = useMemo(() => {
    const saisonsSet = new Set(seances.filter(s => s.date).map(s => getSaison(s.date)));
    const allSaisons = [...saisonsSet].sort();

    const archerList = graphArcher === "Tous les archers"
      ? [...new Set(seances.filter(s => s.archer).map(s => s.archer))].sort()
      : [graphArcher];

    const datasets = archerList.map((archer, idx) => {
      const color = ARCHER_COLORS[idx % ARCHER_COLORS.length];
      const data  = allSaisons.map(saison => {
        const src = seances.filter(s => {
          if (!s.date || s.archer !== archer) return false;
          if (getSaison(s.date) !== saison)   return false;
          if (graphDist !== "Toutes distances" && s.distance !== graphDist) return false;
          if (graphType === "Entraînement" && s.type !== "Entraînement") return false;
          if (graphType === "Compétition"  && s.type !== "Compétition")  return false;
          return getCompte(s) > 0 && (s.score ?? 0) > 0;
        });
        if (!src.length) return null;
        return Math.max(...src.map(s => Math.round((s.score / getCompte(s)) * normFactor(s.distance))));
      });
      return {
        label: archer,
        data,
        borderColor: color,
        backgroundColor: color + "22",
        pointBackgroundColor: color,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        spanGaps: true,
      };
    });

    const chartData = { labels: allSaisons, datasets };

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            font: { size: 12 }, color: colors.text2,
            boxWidth: 14, padding: 18,
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => ctx.parsed.y != null ? `${ctx.dataset.label} : ${ctx.parsed.y} pts` : null,
          },
        },
      },
      scales: {
        x: {
          ticks: { font: { size: 12 }, color: colors.muted },
          grid: { color: colors.grid },
        },
        y: {
          beginAtZero: false,
          ticks: { font: { size: 11 }, color: colors.dim },
          grid: { color: colors.grid },
          title: { display: true, text: "Meilleur score normalisé", color: colors.dim, font: { size: 11 } },
        },
      },
    };

    return { chartData, chartOptions };
  }, [seances, graphArcher, graphDist, graphType, colors]);

  const hasGraphData = chartData.datasets.some(ds => ds.data.some(v => v !== null));

  const COL_HEADS  = ["Rang", "Archer", "Séances", "Total fl.", "Moy./fl.", "Score moy.", "Régularité σ", "Meilleur score"];
  const NC         = COL_HEADS.length; // 8
  const RIGHT_COLS = [2, 3, 4, 5, 6, 7];

  const exportTitle = (() => {
    let t = `Classement — Saison ${filterSaison}`;
    if (filterDist   !== "Toutes")           t += ` · ${filterDist}`;
    if (filterType   !== "Tous")             t += ` · ${filterType}`;
    if (filterPeriod !== "Toute la saison")  t += ` · ${filterPeriod}`;
    return t;
  })();

  const rowToArr = (r, asString = false) => [
    ordinal(r.rang),
    r.archer,
    r.nbSeances,
    r.totalFleches,
    r.avgMoy   != null ? (asString ? r.avgMoy.toFixed(2)  : parseFloat(r.avgMoy.toFixed(2)))  : "",
    r.scoreMoy ?? "",
    r.sigma    != null ? (asString ? r.sigma.toFixed(2)   : parseFloat(r.sigma.toFixed(2)))   : "",
    r.bestNorm ?? "",
  ];

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

    aoa.push([...COL_HEADS]);
    rowMeta.push({ type: "header" });

    rows.forEach((r, i) => {
      aoa.push(rowToArr(r, false));
      rowMeta.push({ type: "data", even: i % 2 === 0 });
    });

    const ws      = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = merges;
    ws["!cols"]   = [
      { wch: 8 }, { wch: 22 }, { wch: 10 }, { wch: 12 },
      { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
    ];

    const center = { horizontal: "center", vertical: "center" };
    const ST = {
      title: {
        font: { bold: true, sz: 13, color: { rgb: "FFFFFF" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "B30057" } },
        alignment: { horizontal: "left", vertical: "center" },
      },
      header: (c) => ({
        font: { bold: true, sz: 9, color: { rgb: "000000" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "FFCCE5" } },
        alignment: numCols.includes(c) ? { horizontal: "right", vertical: "center" } : center,
        border: { bottom: { style: "medium", color: { rgb: "FF007A" } } },
      }),
      dataEven: (c) => ({
        font: { sz: 9, color: { rgb: "202020" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } },
        alignment: numCols.includes(c) ? { horizontal: "right", vertical: "center" } : center,
      }),
      dataOdd: (c) => ({
        font: { sz: 9, color: { rgb: "202020" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "FFF0F6" } },
        alignment: numCols.includes(c) ? { horizontal: "right", vertical: "center" } : center,
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
    XLSX.utils.book_append_sheet(wb, ws, "Classement");
    XLSX.writeFile(wb, `classement-${filterSaison.replace("/", "-")}.xlsx`);
  };

  const handleExportPDF = () => {
    const pdf   = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw    = pdf.internal.pageSize.width;
    const ph    = pdf.internal.pageSize.height;
    // Rang(16) Archer(60) Séances(22) Total fl.(24) Moy./fl.(22) Score moy.(24) Régularité(36) Meilleur(auto)
    const COL_W = [16, 60, 22, 24, 22, 24, 36, 0];

    const colStyles = COL_W.reduce((acc, w, i) => {
      acc[i] = w > 0 ? { cellWidth: w } : {};
      acc[i].halign = RIGHT_COLS.includes(i) ? "right" : "center";
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

    autoTable(pdf, {
      head: [COL_HEADS],
      body: rows.map(r => rowToArr(r, true)),
      startY: 18,
      margin: { left: 14, right: 14, top: 18 },
      styles: { fontSize: 8, cellPadding: 2.5, font: "helvetica" },
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

    pdf.save(`classement-${filterSaison.replace("/", "-")}.pdf`);
  };

  return (
    <div style={s.page}>

      {/* ── Season bar ── */}
      <div style={s.saisonBar}>
        <span style={s.saisonBarLabel}>Saison</span>
        <select
          value={filterSaison}
          onChange={e => { setFilterSaison(e.target.value); setFilterPeriod("Toute la saison"); }}
          style={s.saisonSelect}
        >
          {saisonOptions.map(sn => <option key={sn}>{sn}</option>)}
        </select>
      </div>

      {/* ── Filters row ── */}
      <div style={s.filtersRow}>
        <FilterSelect label="Période"  value={filterPeriod} options={periodOptions} onChange={setFilterPeriod} />
        <FilterSelect label="Distance" value={filterDist}   options={DISTANCES}     onChange={setFilterDist} />
        <FilterSelect label="Type"     value={filterType}   options={TYPES}         onChange={setFilterType} />
        <div style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
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

      {/* ── Ranking table ── */}
      {!loading && !error && (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Rang</th>
                <th style={s.th}>Archer</th>
                <th style={{ ...s.th, ...s.thR }}>Séances</th>
                <th style={{ ...s.th, ...s.thR }}>Total fl.</th>
                <th style={{ ...s.th, ...s.thR }}>Moy./fl.</th>
                <th style={{ ...s.th, ...s.thR }}>Score moy.</th>
                <th style={{ ...s.th, ...s.thR }}>Régularité</th>
                <th style={{ ...s.th, ...s.thR }}>Meilleur score</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} style={s.empty}>Aucune séance pour cette sélection.</td></tr>
              ) : rows.map(r => {
                const top = r.rang <= 3;
                return (
                  <tr key={r.archer} style={{ ...s.tr, ...(top ? s.trTop : {}) }}>
                    <td style={s.td}><RangBadge rang={r.rang} /></td>
                    <td style={{ ...s.td, fontWeight: top ? "700" : "400", color: "var(--text)" }}>
                      {r.archer}
                    </td>
                    <td style={s.tdR}>{r.nbSeances}</td>
                    <td style={s.tdR}>{r.totalFleches.toLocaleString("fr-FR")}</td>
                    <td style={{ ...s.tdR, color: PRIMARY, fontWeight: "700" }}>
                      {r.avgMoy != null ? r.avgMoy.toFixed(2) : "—"}
                    </td>
                    <td style={s.tdR}>
                      {r.scoreMoy != null ? r.scoreMoy : "—"}
                    </td>
                    <td style={s.tdR}>
                      {r.sigma != null ? (
                        <span style={{ color: ORANGE, fontWeight: "600" }}>
                          {r.sigma.toFixed(2)}{" "}
                          <span style={s.regTag}>{regulariteLabel(r.sigma)}</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ ...s.tdR, fontWeight: "600", color: "var(--text)" }}>
                      {r.bestNorm ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Evolution chart ── */}
      {!loading && !error && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <span style={s.cardTitle}>Évolution des records par saison</span>
          </div>
          <div style={s.graphFilters}>
            <FilterSelect label="Archers"  value={graphArcher} options={allArchers}      onChange={setGraphArcher} />
            <FilterSelect label="Distance" value={graphDist}   options={graphDistOptions} onChange={setGraphDist} />
            <FilterSelect label="Type"     value={graphType}   options={GRAPH_TYPES}      onChange={setGraphType} />
          </div>
          {hasGraphData ? (
            <div style={{ height: 320, marginTop: "20px" }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          ) : (
            <div style={s.empty}>Aucune donnée pour cette sélection.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = {
  page: { display: "flex", flexDirection: "column", gap: "16px" },

  saisonBar: {
    display: "flex", alignItems: "center", gap: "16px",
    backgroundColor: "var(--blue-deep)",
    borderRadius: "12px",
    padding: "14px 20px",
    boxShadow: "var(--shadow-card)",
    flexWrap: "wrap",
  },
  saisonBarLabel: {
    fontSize: "11px", fontWeight: "700", color: "var(--blue-dark)",
    textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap",
  },
  saisonSelect: {
    backgroundColor: "var(--blue-mid)", color: "var(--blue-text)",
    border: "1px solid #2e4a80", borderRadius: "7px",
    padding: "7px 12px", fontSize: "14px", fontWeight: "600",
    outline: "none", fontFamily: "inherit", cursor: "pointer",
  },

  filtersRow: {
    display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap",
    backgroundColor: "var(--surface)", borderRadius: "10px",
    padding: "12px 16px",
    boxShadow: "0 1px 6px rgba(0,0,0,0.2)",
  },
  filterWrap: { display: "flex", alignItems: "center", gap: "8px" },
  filterLabel: {
    fontSize: "12px", fontWeight: "600", color: "var(--text-muted)",
    textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap",
  },
  filterSelect: {
    padding: "6px 10px", border: "1.5px solid var(--border-2)", borderRadius: "7px",
    fontSize: "13px", color: "var(--text)", backgroundColor: "var(--surface-raised)",
    outline: "none", fontFamily: "inherit", cursor: "pointer",
  },
  exportBtn: {
    backgroundColor: "var(--border)", color: "var(--text)", border: "none",
    borderRadius: "7px", padding: "8px 14px", fontSize: "13px",
    fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
  },

  tableWrap: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)", overflowX: "auto",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th: {
    padding: "11px 14px", textAlign: "left",
    fontSize: "11px", fontWeight: "700", color: "var(--text-dim)",
    textTransform: "uppercase", letterSpacing: "0.07em",
    borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
    backgroundColor: "var(--surface-raised)",
  },
  thR:   { textAlign: "right" },
  tr:    { borderBottom: "1px solid var(--border)", transition: "background 0.1s" },
  trTop: { backgroundColor: "rgba(255,0,122,0.07)" },
  td:    { padding: "11px 14px", color: "var(--text-2)", whiteSpace: "nowrap" },
  tdR:   { padding: "11px 14px", textAlign: "right", color: "var(--text-3)", whiteSpace: "nowrap" },
  rankBadge: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: "36px", height: "24px", borderRadius: "12px",
    fontSize: "12px", fontWeight: "700", padding: "0 8px",
  },
  regTag: {
    fontSize: "10px", fontWeight: "600",
    backgroundColor: "rgba(249,115,22,0.12)",
    borderRadius: "4px", padding: "1px 5px",
    color: ORANGE,
  },
  empty:  { padding: "40px", textAlign: "center", color: "var(--text-dim)", fontSize: "14px" },
  info:   { color: "var(--text-muted)", fontSize: "14px" },
  errMsg: {
    color: PRIMARY, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "rgba(255,0,122,0.1)", borderRadius: "8px", border: `1px solid ${PRIMARY}`,
  },

  card: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)",
    padding: "20px 24px 28px",
  },
  cardHead: { display: "flex", alignItems: "center", marginBottom: "16px" },
  cardTitle: { fontSize: "14px", fontWeight: "600", color: "var(--text-2)" },
  graphFilters: { display: "flex", gap: "16px", flexWrap: "wrap" },
};
