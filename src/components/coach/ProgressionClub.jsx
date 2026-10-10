import { useState, useMemo } from "react";
import { useAllSeances } from "../../hooks/useAllSeances";
import { useChartColors } from "../../hooks/useChartColors";
import { chargerExport } from "../../utils/exportLibs";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  LineController,
  BarController,
  Tooltip,
  Legend,
} from "chart.js";
import { Line, Chart as ChartMixed } from "react-chartjs-2";
import { PRIMARY, BLUE, getPaille, getBlason, getCompte, normFactor, getSaison, CURRENT_SAISON, MOIS, fmtDate, fmtYM, cleSeance, nbSeances } from "../../utils/seances";
import { scoreEpreuve } from "../../utils/records";
import FilterSelect from "../shared/FilterSelect";

const OBJ_COLOR = "#d99a2b"; // ≈ var(--warn), littéral car dessiné sur canvas

const horizontalLinePlugin = {
  id: "horizontalLine",
  afterDraw(chart) {
    const cfg = chart.options.plugins?.horizontalLine;
    if (!cfg?.value) return;
    const { ctx, chartArea: { left, right }, scales: { y } } = chart;
    const yPx = y.getPixelForValue(cfg.value);
    ctx.save();
    ctx.strokeStyle = cfg.color ?? OBJ_COLOR;
    ctx.setLineDash([6, 3]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left, yPx);
    ctx.lineTo(right, yPx);
    ctx.stroke();
    ctx.restore();
  },
};

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, LineController, BarController,
  Tooltip, Legend, horizontalLinePlugin
);

const DISTANCES      = ["Toutes", "5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const DIST_ONLY       = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const DIST_ORDER      = DIST_ONLY;
const TYPES           = ["Tous", "Entraînement", "Compétition"];
const GRAPH_DISTANCES = ["Toutes distances", ...DIST_ONLY];
const GRAPH_TYPES     = ["Entr. + Comp.", "Entraînement", "Compétition"];
const MONTHS_FR       = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];

const AVATAR_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#10b981",
  "#3b82f6", "#f59e0b", "#14b8a6", "#84cc16", "#ef4444",
];
const ARCHER_COLORS = [
  "#6366f1", "#22d3ee", "#a3e635", "#fb923c", "#e879f9",
  "#34d399", "#f472b6", "#60a5fa", "#fbbf24", "#a78bfa",
  "#f43f5e", "#0ea5e9", "#84cc16",
];

const fmtDec    = (v) => (v != null ? v.toFixed(2) : "—");
const fmtInt    = (v) => (v != null ? String(v) : "—");
const fmtSaison = (sn) => "S" + sn.split("/")[1];
const fmtMonth  = (ym) => { const [y, m] = ym.split("-"); return `${MONTHS_FR[parseInt(m) - 1]} ${y.slice(2)}`; };

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
  1: { backgroundColor: PRIMARY, color: "#fff" },
  2: { backgroundColor: "#8e8e8e", color: "#fff" },
  3: { backgroundColor: "#b06e30", color: "#fff" },
};

const makeDistBarOpts = (nf, colors) => ({
  responsive: true, maintainAspectRatio: false,
  scales: {
    x: { ticks: { font: { size: 12 }, color: colors.muted }, grid: { display: false } },
    y: {
      min: 0, max: nf * 10,
      ticks: { font: { size: 11 }, color: colors.dim, stepSize: 100 },
      grid: { color: colors.grid },
      title: { display: true, text: `/ ${nf * 10}`, color: colors.dim, font: { size: 11 } },
    },
  },
  plugins: {
    legend: { labels: { font: { size: 12 }, color: colors.text, boxWidth: 12, padding: 14 } },
    tooltip: { callbacks: { label: (ctx) => (ctx.parsed.y != null ? `${ctx.dataset.label} : ${ctx.parsed.y} pts` : null) } },
  },
});

// ── Composant principal ───────────────────────────────────────────────────────

export default function ProgressionClub() {
  const { seances, loading, error } = useAllSeances();
  const colors = useChartColors();

  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);

  const saisonOptions = useMemo(() => {
    const set = new Set(seances.filter(s => s.date).map(s => getSaison(s.date)));
    set.add(CURRENT_SAISON);
    return ["Toutes", ...[...set].sort((a, b) => b.localeCompare(a))];
  }, [seances]);

  const saisonSeances = useMemo(() =>
    seances.filter(s => s.date && (filterSaison === "Toutes" || getSaison(s.date) === filterSaison)),
    [seances, filterSaison]
  );

  const archerOptionsSaison = useMemo(() => {
    const names = [...new Set(saisonSeances.map(s => s.archer).filter(Boolean))].sort();
    return ["Tous", ...names];
  }, [saisonSeances]);

  // ── KPI club ───────────────────────────────────────────────────────────────

  const globalStats = useMemo(() => {
    const actifs  = new Set(saisonSeances.map(s => s.archer).filter(Boolean)).size;
    const fleches = saisonSeances.reduce((n, s) => n + getPaille(s) + getBlason(s) + getCompte(s), 0);
    const scored  = saisonSeances.filter(s => getCompte(s) > 0 && (s.score ?? 0) > 0);
    const distMap = {};
    for (const s of scored) {
      if (!s.distance) continue;
      if (!distMap[s.distance]) distMap[s.distance] = { scoreSum: 0, compteSum: 0 };
      distMap[s.distance].scoreSum  += s.score;
      distMap[s.distance].compteSum += getCompte(s);
    }
    const moyByDist = DIST_ORDER
      .filter(d => distMap[d]?.compteSum > 0)
      .map(d => ({ dist: d, moy: distMap[d].scoreSum / distMap[d].compteSum }));
    return {
      total: nbSeances(saisonSeances), actifs, fleches, moyByDist,
      entr: nbSeances(saisonSeances.filter(s => s.type === "Entraînement")),
      comp: nbSeances(saisonSeances.filter(s => s.type === "Compétition")),
    };
  }, [saisonSeances]);

  const archerCards = useMemo(() => {
    const map = {};
    for (const s of saisonSeances) {
      if (!s.archer) continue;
      if (!map[s.archer]) map[s.archer] = { name: s.archer, seances: new Set(), fleches: 0, distData: {} };
      map[s.archer].seances.add(cleSeance(s));
      map[s.archer].fleches += getPaille(s) + getBlason(s) + getCompte(s);
      const c = getCompte(s);
      if (c > 0 && (s.score ?? 0) > 0 && s.distance) {
        if (!map[s.archer].distData[s.distance]) map[s.archer].distData[s.distance] = { scoreSum: 0, compteSum: 0 };
        map[s.archer].distData[s.distance].scoreSum  += s.score;
        map[s.archer].distData[s.distance].compteSum += c;
      }
    }
    return Object.values(map)
      .map(a => ({ ...a, n: a.seances.size }))
      .sort((a, b) => b.n - a.n)
      .map(a => ({
        ...a,
        moysByDist: DIST_ORDER
          .filter(d => a.distData[d]?.compteSum > 0)
          .map(d => ({ dist: d, moy: a.distData[d].scoreSum / a.distData[d].compteSum })),
      }));
  }, [saisonSeances]);

  // ── Classement ─────────────────────────────────────────────────────────────

  const [rankPeriod, setRankPeriod] = useState("Toute la saison");
  const [rankDist,   setRankDist]   = useState("Toutes");
  const [rankType,   setRankType]   = useState("Tous");

  const periodOptions = useMemo(() => {
    if (filterSaison === "Toutes") return ["Toute la saison"];
    const months = new Set();
    saisonSeances.forEach(s => {
      const [y, m] = s.date.split("-").map(Number);
      months.add(`${y}-${String(m).padStart(2, "0")}`);
    });
    const labels = [...months].sort().reverse().map(ym => {
      const [y, m] = ym.split("-").map(Number);
      return `${MOIS[m - 1]} ${y}`;
    });
    return ["Toute la saison", ...labels];
  }, [saisonSeances, filterSaison]);

  const rankRows = useMemo(() => {
    const src = saisonSeances.filter(s => {
      if (!s.archer) return false;
      if (rankPeriod !== "Toute la saison") {
        const parts = rankPeriod.split(" ");
        const mIdx  = MOIS.indexOf(parts[0]);
        const ym    = `${parts[1]}-${String(mIdx + 1).padStart(2, "0")}`;
        if (!s.date.startsWith(ym)) return false;
      }
      if (rankDist !== "Toutes" && s.distance !== rankDist) return false;
      if (rankType !== "Tous"   && s.type     !== rankType) return false;
      return true;
    });

    const map = {};
    for (const sess of src) {
      if (!map[sess.archer]) map[sess.archer] = { archer: sess.archer, sessions: [] };
      map[sess.archer].sessions.push(sess);
    }

    const computed = Object.values(map).map(({ archer, sessions }) => {
      const nbSeancesArcher = nbSeances(sessions);
      const totalFleches = sessions.reduce((n, s) => n + getPaille(s) + getBlason(s) + getCompte(s), 0);
      const withCompte   = sessions.filter(s => getCompte(s) > 0 && (s.score ?? 0) > 0);
      const moyennes     = withCompte.map(s => s.score / getCompte(s));
      const avgMoy       = moyennes.length ? moyennes.reduce((a, b) => a + b, 0) / moyennes.length : null;
      const scoreMoy     = withCompte.length
        ? Math.round(withCompte.reduce((sum, s) => sum + (s.score / getCompte(s)) * normFactor(s.distance), 0) / withCompte.length)
        : null;
      let bestNorm = null;
      for (const s of withCompte) {
        const n = scoreEpreuve(s);
        if (n != null && (bestNorm === null || n > bestNorm)) bestNorm = n;
      }
      return { archer, nbSeances: nbSeancesArcher, totalFleches, avgMoy, scoreMoy, sigma: stdDev(moyennes), bestNorm };
    });

    computed.sort((a, b) => {
      const ma = a.avgMoy ?? -Infinity;
      const mb = b.avgMoy ?? -Infinity;
      return mb !== ma ? mb - ma : a.archer.localeCompare(b.archer);
    });
    for (let i = 0; i < computed.length; i++) {
      computed[i].rang = i > 0 && computed[i].avgMoy === computed[i - 1].avgMoy ? computed[i - 1].rang : i + 1;
    }
    return computed;
  }, [saisonSeances, rankPeriod, rankDist, rankType]);

  const rankExportTitle = (() => {
    let t = `Classement — Saison ${filterSaison}`;
    if (rankDist   !== "Toutes")          t += ` · ${rankDist}`;
    if (rankType   !== "Tous")            t += ` · ${rankType}`;
    if (rankPeriod !== "Toute la saison") t += ` · ${rankPeriod}`;
    return t;
  })();

  const rankRowArr = (r, asString = false) => [
    ordinal(r.rang), r.archer, r.nbSeances, r.totalFleches,
    r.avgMoy   != null ? (asString ? r.avgMoy.toFixed(2) : parseFloat(r.avgMoy.toFixed(2))) : "",
    r.scoreMoy ?? "",
    r.sigma    != null ? (asString ? r.sigma.toFixed(2)  : parseFloat(r.sigma.toFixed(2)))  : "",
    r.bestNorm ?? "",
  ];
  const RANK_COLS  = ["Rang", "Archer", "Séances", "Total fl.", "Moy./fl.", "Score moy.", "Régularité σ", "Meilleur score"];
  const RANK_RIGHT = [2, 3, 4, 5, 6, 7];

  const exportXlsx = async (title, cols, rightCols, rows, sheetName, fileName, colWidths) => {
    const { XLSX } = await chargerExport();
    const nc     = cols.length;
    const aoa    = [[title, ...Array(nc - 1).fill("")], Array(nc).fill(""), [...cols], ...rows];
    const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: nc - 1 } }];
    const ws      = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = merges;
    ws["!cols"]   = colWidths.map(wch => ({ wch }));

    const center = { horizontal: "center", vertical: "center" };
    const ST = {
      title:  { font: { bold: true, sz: 13, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { patternType: "solid", fgColor: { rgb: "B30057" } }, alignment: { horizontal: "left", vertical: "center" } },
      header: (c) => ({ font: { bold: true, sz: 9, color: { rgb: "000000" }, name: "Calibri" }, fill: { patternType: "solid", fgColor: { rgb: "FFCCE5" } }, alignment: rightCols.includes(c) ? { horizontal: "right", vertical: "center" } : center, border: { bottom: { style: "medium", color: { rgb: "FF007A" } } } }),
      dataEven: (c) => ({ font: { sz: 9, color: { rgb: "202020" }, name: "Calibri" }, fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } }, alignment: rightCols.includes(c) ? { horizontal: "right", vertical: "center" } : center }),
      dataOdd:  (c) => ({ font: { sz: 9, color: { rgb: "202020" }, name: "Calibri" }, fill: { patternType: "solid", fgColor: { rgb: "FFF0F6" } }, alignment: rightCols.includes(c) ? { horizontal: "right", vertical: "center" } : center }),
    };
    for (let r = 0; r < aoa.length; r++) {
      const isTitle  = r === 0;
      const isHeader = r === 2;
      const isEmpty  = r === 1;
      if (isEmpty) continue;
      for (let c = 0; c < nc; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { v: "", t: "s" };
        ws[addr].s = isTitle ? ST.title : isHeader ? ST.header(c) : (r % 2 === 1 ? ST.dataEven(c) : ST.dataOdd(c));
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
  };

  const exportPdf = async (title, cols, rightCols, body, colWidths, fileName) => {
    const { jsPDF, autoTable } = await chargerExport();
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw  = pdf.internal.pageSize.width;
    const ph  = pdf.internal.pageSize.height;
    const colStyles = colWidths.reduce((acc, w, i) => {
      acc[i] = w > 0 ? { cellWidth: w } : {};
      acc[i].halign = rightCols.includes(i) ? "right" : "center";
      return acc;
    }, {});
    const drawTitle = () => {
      pdf.setFillColor(179, 0, 87);
      pdf.rect(0, 0, pw, 14, "F");
      pdf.setFontSize(11); pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold");
      pdf.text(title, 14, 9.5);
    };
    drawTitle();
    autoTable(pdf, {
      head: [cols], body, startY: 18, margin: { left: 14, right: 14, top: 18 },
      styles: { fontSize: 8, cellPadding: 2.5, font: "helvetica" },
      headStyles: { fillColor: [255, 204, 229], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { textColor: [32, 32, 32], fillColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [255, 240, 246] },
      columnStyles: colStyles,
      didDrawPage: () => {
        drawTitle();
        pdf.setFontSize(8); pdf.setTextColor(180, 0, 86); pdf.setFont("helvetica", "normal");
        pdf.text(`Page ${pdf.internal.getNumberOfPages()}`, pw - 20, ph - 6);
      },
    });
    pdf.save(fileName);
  };

  const handleRankExportExcel = () => exportXlsx(
    rankExportTitle, RANK_COLS, RANK_RIGHT,
    rankRows.map((r, i) => ({ row: rankRowArr(r, false), i })).map(({ row }) => row),
    "Classement", `classement-${filterSaison.replace("/", "-")}.xlsx`,
    [8, 22, 10, 12, 10, 12, 14, 14]
  );
  const handleRankExportPDF = () => exportPdf(
    rankExportTitle, RANK_COLS, RANK_RIGHT,
    rankRows.map(r => rankRowArr(r, true)),
    [16, 60, 22, 24, 22, 24, 36, 0],
    `classement-${filterSaison.replace("/", "-")}.pdf`
  );

  // ── Tableau mensuel par archer ────────────────────────────────────────────

  const [tabArcher, setTabArcher] = useState("Tous");
  const [tabDist,   setTabDist]   = useState("Toutes");

  const monthlyRows = useMemo(() => {
    const src = saisonSeances.filter(s => {
      const okArcher = tabArcher === "Tous"   || s.archer   === tabArcher;
      const okDist   = tabDist   === "Toutes" || s.distance === tabDist;
      return okArcher && okDist;
    });
    const map = {};
    for (const s of src) {
      if (!s.date) continue;
      const month = s.date.slice(0, 7);
      const key   = `${month}__${s.archer ?? ""}__${s.distance}`;
      if (!map[key]) {
        map[key] = {
          month, archer: s.archer ?? "—", distance: s.distance,
          seancesEntr: new Set(), seancesComp: new Set(), paille: 0, blason: 0,
          compteTotal: 0, compteEntr: 0, scoreEntr: 0, compteComp: 0, scoreComp: 0,
        };
      }
      const g  = map[key];
      const p = getPaille(s), b = getBlason(s), c = getCompte(s), sc = s.score ?? 0;
      g.paille += p; g.blason += b; g.compteTotal += c;
      if (s.type === "Entraînement") { g.seancesEntr.add(cleSeance(s)); if (c > 0 && sc > 0) { g.compteEntr += c; g.scoreEntr += sc; } }
      else if (s.type === "Compétition") { g.seancesComp.add(cleSeance(s)); if (c > 0 && sc > 0) { g.compteComp += c; g.scoreComp += sc; } }
    }
    return Object.values(map)
      .map(g => {
        const nf = normFactor(g.distance);
        const moyEntr = g.compteEntr > 0 ? g.scoreEntr / g.compteEntr : null;
        const moyComp = g.compteComp > 0 ? g.scoreComp / g.compteComp : null;
        return {
          ...g, nbrEntr: g.seancesEntr.size, nbrComp: g.seancesComp.size, total: g.paille + g.blason + g.compteTotal, score: g.scoreEntr + g.scoreComp,
          moyEntr, scoreMoyEntr: moyEntr != null ? Math.round(moyEntr * nf) : null,
          moyComp, scoreMoyComp: moyComp != null ? Math.round(moyComp * nf) : null,
        };
      })
      .sort((a, b) => {
        const cm = b.month.localeCompare(a.month);
        if (cm !== 0) return cm;
        const ca = a.archer.localeCompare(b.archer);
        return ca !== 0 ? ca : DIST_ORDER.indexOf(a.distance) - DIST_ORDER.indexOf(b.distance);
      });
  }, [saisonSeances, tabArcher, tabDist]);

  const MONTH_COLS  = ["Mois", "Archer", "Distance", "Séances Entr.", "Séances Comp.", "Paille", "Blason", "Compté", "Score", "Total fl.", "Moy./fl. Entr.", "Score moy. Entr.", "Moy./fl. Comp.", "Score moy. Comp."];
  const MONTH_NC    = MONTH_COLS.length;
  const MONTH_RIGHT = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

  const monthRowArr = (row, asString = false) => [
    fmtYM(row.month), row.archer, row.distance, row.nbrEntr || "", row.nbrComp || "",
    row.paille || "", row.blason || "", row.compteTotal || "", row.score || "", row.total || "",
    row.moyEntr != null ? (asString ? row.moyEntr.toFixed(2) : parseFloat(row.moyEntr.toFixed(2))) : "",
    row.scoreMoyEntr ?? "",
    row.moyComp != null ? (asString ? row.moyComp.toFixed(2) : parseFloat(row.moyComp.toFixed(2))) : "",
    row.scoreMoyComp ?? "",
  ];

  const monthTotalArr = (asString = false) => {
    const t = monthlyRows.reduce((acc, row) => ({
      nbrEntr: acc.nbrEntr + row.nbrEntr, nbrComp: acc.nbrComp + row.nbrComp,
      paille: acc.paille + row.paille, blason: acc.blason + row.blason, compteTotal: acc.compteTotal + row.compteTotal,
      score: acc.score + row.score, total: acc.total + row.total,
      scoreEntr: acc.scoreEntr + row.scoreEntr, compteEntr: acc.compteEntr + row.compteEntr,
      scoreComp: acc.scoreComp + row.scoreComp, compteComp: acc.compteComp + row.compteComp,
    }), { nbrEntr: 0, nbrComp: 0, paille: 0, blason: 0, compteTotal: 0, score: 0, total: 0, scoreEntr: 0, compteEntr: 0, scoreComp: 0, compteComp: 0 });
    const moyEntr = t.compteEntr > 0 ? t.scoreEntr / t.compteEntr : null;
    const moyComp = t.compteComp > 0 ? t.scoreComp / t.compteComp : null;
    const fmt = (v) => v != null ? (asString ? v.toFixed(2) : parseFloat(v.toFixed(2))) : "";
    return [
      `Total — Saison ${filterSaison}`, "", "", t.nbrEntr || "", t.nbrComp || "",
      t.paille || "", t.blason || "", t.compteTotal || "", t.score || "", t.total || "",
      fmt(moyEntr), "", fmt(moyComp), "",
    ];
  };

  const monthExportTitle = tabArcher !== "Tous"
    ? `Stats mensuelles — ${tabArcher} — Saison ${filterSaison}`
    : `Stats mensuelles — club — Saison ${filterSaison}`;

  const handleMonthExportExcel = () => exportXlsx(
    monthExportTitle, MONTH_COLS, MONTH_RIGHT,
    [...monthlyRows.map(r => monthRowArr(r, false)), monthTotalArr(false)],
    "Stats", `stats-club-${filterSaison.replace("/", "-")}.xlsx`,
    [14, 16, 10, 14, 14, 8, 8, 8, 8, 10, 14, 18, 14, 18]
  );
  const handleMonthExportPDF = () => exportPdf(
    monthExportTitle, MONTH_COLS, MONTH_RIGHT,
    [...monthlyRows.map(r => monthRowArr(r, true)), monthTotalArr(true)],
    [22, 24, 10, 14, 14, 10, 10, 10, 10, 12, 18, 22, 18, 0],
    `stats-club-${filterSaison.replace("/", "-")}.pdf`
  );

  // ── Graphiques ─────────────────────────────────────────────────────────────

  const archerOptionsAll = useMemo(() => {
    const set = new Set(seances.filter(s => s.archer).map(s => s.archer));
    return ["Tous les archers", ...[...set].sort()];
  }, [seances]);

  const [g1Archer, setG1Archer] = useState("Tous les archers");
  const [g1Dist,   setG1Dist]   = useState("Toutes distances");

  const { g1Labels, g1Datasets } = useMemo(() => {
    const src = seances.filter(s => {
      if (!s.date || !s.archer) return false;
      if (filterSaison !== "Toutes" && getSaison(s.date) !== filterSaison) return false;
      if (!getCompte(s) || !(s.score > 0)) return false;
      if (g1Archer !== "Tous les archers" && s.archer !== g1Archer) return false;
      if (g1Dist   !== "Toutes distances" && s.distance !== g1Dist) return false;
      return true;
    });
    const sortedDates = [...new Set(src.map(s => s.date))].sort();
    const archers      = [...new Set(src.map(s => s.archer))].sort();
    const datasets = archers.map((archer, i) => {
      const color    = ARCHER_COLORS[i % ARCHER_COLORS.length];
      const byArcher = src.filter(s => s.archer === archer);
      const data = sortedDates.map(d => {
        const hits = byArcher.filter(s => s.date === d);
        if (!hits.length) return null;
        const vals = hits.map(s => s.score / getCompte(s)).filter(v => isFinite(v));
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      });
      return { label: archer, data, borderColor: color, backgroundColor: color + "22", pointBackgroundColor: color, pointRadius: 4, pointHoverRadius: 6, tension: 0.3, spanGaps: true };
    });
    return { g1Labels: sortedDates.map(fmtDate), g1Datasets: datasets };
  }, [seances, filterSaison, g1Archer, g1Dist]);
  const hasG1 = g1Datasets.some(d => d.data.some(v => v !== null));

  const [g2Archer, setG2Archer] = useState("Tous les archers");
  const [g2Dist,   setG2Dist]   = useState("Toutes distances");
  const [g2Type,   setG2Type]   = useState("Entr. + Comp.");

  const { g2Labels, g2Datasets } = useMemo(() => {
    const src = seances.filter(s => {
      if (!s.date || !s.archer) return false;
      if (!getCompte(s) || !(s.score > 0)) return false;
      if (g2Archer !== "Tous les archers" && s.archer !== g2Archer) return false;
      if (g2Dist   !== "Toutes distances" && s.distance !== g2Dist) return false;
      if (g2Type   !== "Entr. + Comp."    && s.type     !== g2Type) return false;
      return true;
    });
    const saisons = [...new Set(src.map(s => getSaison(s.date)))].sort();
    const archers = [...new Set(src.map(s => s.archer))].sort();
    const datasets = archers.map((archer, i) => {
      const color = ARCHER_COLORS[i % ARCHER_COLORS.length];
      const data  = saisons.map(saison => {
        let best = null;
        for (const s of src) {
          if (s.archer !== archer || getSaison(s.date) !== saison) continue;
          const n = scoreEpreuve(s);
          if (n != null && (best === null || n > best)) best = n;
        }
        return best;
      });
      return { label: archer, data, borderColor: color, backgroundColor: color + "22", pointBackgroundColor: color, pointRadius: 5, pointHoverRadius: 7, tension: 0.3, spanGaps: true };
    });
    return { g2Labels: saisons, g2Datasets: datasets };
  }, [seances, g2Archer, g2Dist, g2Type]);
  const hasG2 = g2Datasets.some(d => d.data.some(v => v !== null));

  const [g3Archer, setG3Archer] = useState("Tous les archers");
  const [g3Dist,   setG3Dist]   = useState("Toutes distances");

  const { g3Data, g3Opts, hasG3 } = useMemo(() => {
    const src = seances
      .filter(s => {
        if (!s.date || !s.archer) return false;
        const okSaison = filterSaison === "Toutes" || getSaison(s.date) === filterSaison;
        const okArcher = g3Archer === "Tous les archers" || s.archer === g3Archer;
        const okDist   = g3Dist   === "Toutes distances" || s.distance === g3Dist;
        return okSaison && okArcher && okDist && getCompte(s) > 0 && (s.score ?? 0) > 0;
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const months = [...new Set(src.map(s => s.date.slice(0, 7)))].sort();
    const avgByType = (type) => months.map(ym => {
      const group = src.filter(s => s.date.startsWith(ym) && s.type === type);
      if (!group.length) return null;
      const totSc  = group.reduce((n, s) => n + s.score, 0);
      const totVol = group.reduce((n, s) => n + getCompte(s), 0);
      return totVol > 0 ? parseFloat((totSc / totVol).toFixed(2)) : null;
    });
    const entraData = avgByType("Entraînement");
    const compData  = avgByType("Compétition");
    const datasets = [
      { label: "Entraînements", data: entraData, borderColor: PRIMARY, backgroundColor: "rgba(255,0,122,0.1)", pointBackgroundColor: PRIMARY, pointRadius: 5, pointHoverRadius: 7, tension: 0.35, fill: true, spanGaps: false },
      { label: "Compétitions", data: compData, borderColor: BLUE, backgroundColor: "rgba(59,130,246,0.1)", pointBackgroundColor: BLUE, pointStyle: "rectRot", pointRadius: 6, pointHoverRadius: 8, borderDash: [6, 3], tension: 0.35, fill: true, spanGaps: false },
    ];
    const opts = {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: { font: { size: 11 }, color: colors.dim, maxRotation: 45, autoSkip: true, maxTicksLimit: 18 }, grid: { color: colors.grid } },
        y: { beginAtZero: false, ticks: { font: { size: 11 }, color: colors.dim }, grid: { color: colors.grid }, title: { display: true, text: "Moy. / flèche", color: colors.dim, font: { size: 11 } } },
      },
      plugins: {
        legend: { labels: { font: { size: 12 }, color: colors.text, boxWidth: 18, padding: 18 } },
        tooltip: { callbacks: {
          title: (items) => items[0]?.label ?? "",
          label: (ctx) => {
            if (ctx.parsed.y == null) return null;
            const ym    = months[ctx.dataIndex];
            const type  = ctx.dataset.label === "Entraînements" ? "Entraînement" : "Compétition";
            const group = src.filter(s => s.date.startsWith(ym) && s.type === type);
            return [`${ctx.dataset.label} : ${ctx.parsed.y.toFixed(2)} moy/fl`, `${nbSeances(group)} séance${nbSeances(group) > 1 ? "s" : ""} ce mois`];
          },
        } },
      },
    };
    return { g3Data: { labels: months.map(fmtMonth), datasets }, g3Opts: opts, hasG3: entraData.some(v => v !== null) || compData.some(v => v !== null) };
  }, [seances, filterSaison, g3Archer, g3Dist, colors.theme]);

  const [g4Archer, setG4Archer] = useState("Tous les archers");

  const distBarCharts = useMemo(() => {
    const allSaisons = [...new Set(seances.filter(s => s.date).map(s => getSaison(s.date)))].sort();
    return DIST_ONLY.map(dist => {
      const src = seances.filter(s =>
        s.distance === dist && s.date && s.archer && getCompte(s) > 0 && (s.score ?? 0) > 0 &&
        (g4Archer === "Tous les archers" || s.archer === g4Archer)
      );
      if (!src.length) return null;
      const nf = normFactor(dist);
      const top3avg = (type, saison) => {
        const scores = src.filter(s => s.type === type && getSaison(s.date) === saison)
          .map(scoreEpreuve).filter(v => v != null).sort((a, b) => b - a).slice(0, 3);
        return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      };
      const entrData = allSaisons.map(sn => top3avg("Entraînement", sn));
      const compData = allSaisons.map(sn => top3avg("Compétition", sn));
      if (!entrData.some(v => v !== null) && !compData.some(v => v !== null)) return null;
      const datasets = [
        { type: "bar", label: "Entr.", data: entrData, backgroundColor: "rgba(255,0,122,0.75)", borderRadius: 4 },
        { type: "bar", label: "Comp.", data: compData, backgroundColor: "rgba(59,130,246,0.75)", borderRadius: 4 },
      ];
      return { dist, nf, data: { labels: allSaisons.map(fmtSaison), datasets }, opts: makeDistBarOpts(nf, colors) };
    }).filter(Boolean);
  }, [seances, g4Archer, colors.theme]);

  const g1Opts = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: "bottom", labels: { font: { size: 12 }, color: colors.text2, boxWidth: 14, padding: 18 } }, tooltip: { callbacks: { label: ctx => ctx.parsed.y != null ? `${ctx.dataset.label} : ${ctx.parsed.y.toFixed(2)} moy/fl.` : null } } },
    scales: {
      x: { ticks: { font: { size: 10 }, color: colors.dim, maxRotation: 45, maxTicksLimit: 18 }, grid: { color: colors.grid } },
      y: { beginAtZero: false, ticks: { font: { size: 11 }, color: colors.dim }, grid: { color: colors.grid }, title: { display: true, text: "Moy. / flèche", color: colors.dim, font: { size: 11 } } },
    },
  }), [colors.theme]);

  const g2Opts = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: "bottom", labels: { font: { size: 12 }, color: colors.text2, boxWidth: 14, padding: 18 } }, tooltip: { callbacks: { label: ctx => ctx.parsed.y != null ? `${ctx.dataset.label} : ${ctx.parsed.y} pts` : null } } },
    scales: {
      x: { ticks: { font: { size: 12 }, color: colors.muted }, grid: { color: colors.grid } },
      y: { beginAtZero: false, ticks: { font: { size: 11 }, color: colors.dim }, grid: { color: colors.grid }, title: { display: true, text: "Meilleur score normalisé", color: colors.dim, font: { size: 11 } } },
    },
  }), [colors.theme]);

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (loading) return <div style={s.info}>Chargement…</div>;
  if (error)   return <div style={s.errMsg}>{error}</div>;

  return (
    <div style={s.page}>

      {/* ── Saison (contrôle partagé) ── */}
      <div style={s.saisonBar}>
        <span style={s.saisonLabel}>Saison</span>
        <select value={filterSaison} onChange={e => setFilterSaison(e.target.value)} style={s.saisonSelect}>
          {saisonOptions.map(sn => <option key={sn}>{sn}</option>)}
        </select>
      </div>

      {/* ── KPI club ── */}
      <div className="coach-cards-grid">
        <StatCard label="Total séances"  value={globalStats.total} sub={`${globalStats.entr} entr. · ${globalStats.comp} comp.`} />
        <StatCard label="Archers actifs" value={globalStats.actifs} />
        <StatCard label="Total flèches"  value={globalStats.fleches.toLocaleString("fr-FR")} />
        <MoyDistCard moyByDist={globalStats.moyByDist} />
      </div>

      {/* ── Macarons archers ── */}
      {archerCards.length > 0 && (
        <div style={s.archerGrid}>
          {archerCards.map(a => {
            const col = archerColor(a.name);
            return (
              <div key={a.name} style={s.archerCard}>
                <div style={{ ...s.avatar, backgroundColor: col + "22", color: col }}>{initiales(a.name)}</div>
                <div style={s.archerInfo}>
                  <div style={s.archerName}>{a.name}</div>
                  <div style={s.archerMeta}>{a.n} séance{a.n > 1 ? "s" : ""} · {a.fleches.toLocaleString("fr-FR")} fl.</div>
                  {a.moysByDist.length > 0 && (
                    <div style={s.archerMoy}>{a.moysByDist.map(d => `${d.dist} : ${d.moy.toFixed(2)}`).join(" | ")}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Classement ── */}
      <div style={s.sectionHead}>
        <h2 style={s.sectionTitle}>Classement</h2>
        <div style={s.filters}>
          <FilterSelect label="Période"  value={rankPeriod} options={periodOptions} onChange={setRankPeriod} />
          <FilterSelect label="Distance" value={rankDist}   options={DISTANCES}     onChange={setRankDist} />
          <FilterSelect label="Type"     value={rankType}   options={TYPES}         onChange={setRankType} />
          <ExportButtons disabled={rankRows.length === 0} onExcel={handleRankExportExcel} onPDF={handleRankExportPDF} />
        </div>
      </div>
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
            {rankRows.length === 0 ? (
              <tr><td colSpan={8} style={s.empty}>Aucune séance pour cette sélection.</td></tr>
            ) : rankRows.map(r => {
              const top = r.rang <= 3;
              return (
                <tr key={r.archer} style={{ ...s.tr, ...(top ? s.trTop : {}) }}>
                  <td style={s.td}><RankBadge rang={r.rang} /></td>
                  <td style={{ ...s.td, fontWeight: top ? "700" : "400", color: "var(--text)" }}>{r.archer}</td>
                  <td style={s.tdR}>{r.nbSeances}</td>
                  <td style={s.tdR}>{r.totalFleches.toLocaleString("fr-FR")}</td>
                  <td style={{ ...s.tdR, color: PRIMARY, fontWeight: "700" }}>{r.avgMoy != null ? r.avgMoy.toFixed(2) : "—"}</td>
                  <td style={s.tdR}>{r.scoreMoy ?? "—"}</td>
                  <td style={s.tdR}>
                    {r.sigma != null
                      ? <span style={{ color: "var(--warn)", fontWeight: "600" }}>{r.sigma.toFixed(2)} <span style={s.regTag}>{regulariteLabel(r.sigma)}</span></span>
                      : "—"}
                  </td>
                  <td style={{ ...s.tdR, fontWeight: "600", color: "var(--text)" }}>{r.bestNorm ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Tableau mensuel par archer ── */}
      <div style={s.sectionHead}>
        <h2 style={s.sectionTitle}>Stats mensuelles — club</h2>
        <div style={s.filters}>
          <FilterSelect label="Archer"   value={tabArcher} options={archerOptionsSaison} onChange={setTabArcher} />
          <FilterSelect label="Distance" value={tabDist}   options={DISTANCES}           onChange={setTabDist} />
          <ExportButtons disabled={monthlyRows.length === 0} onExcel={handleMonthExportExcel} onPDF={handleMonthExportPDF} />
        </div>
      </div>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}  rowSpan={2}>Mois</th>
              <th style={s.th}  rowSpan={2}>Archer</th>
              <th style={s.th}  rowSpan={2}>Distance</th>
              <th style={s.thGrpSeance} colSpan={2}>Séances</th>
              <th style={s.thGrpVol}    colSpan={3}>Volumes</th>
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
            {monthlyRows.length === 0 ? (
              <tr><td colSpan={MONTH_NC} style={s.empty}>Aucune séance trouvée.</td></tr>
            ) : monthlyRows.map((row, i) => {
              const entrMoyColor = row.moyEntr == null ? "var(--text-dim)" : PRIMARY;
              const compMoyColor = row.moyComp == null ? "var(--text-dim)" : BLUE;
              return (
                <tr key={i} style={s.tr}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--surface-raised)"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}
                >
                  <td style={{ ...s.td, fontWeight: "500" }}>{fmtYM(row.month)}</td>
                  <td style={{ ...s.td, fontWeight: "700" }}>{row.archer}</td>
                  <td style={s.td}><span style={s.badge}>{row.distance}</span></td>
                  <td style={{ ...s.tdNum, color: row.nbrEntr ? PRIMARY : "var(--text-dim)", fontWeight: "600" }}>{row.nbrEntr || "—"}</td>
                  <td style={{ ...s.tdNum, color: row.nbrComp ? BLUE    : "var(--text-dim)", fontWeight: "600" }}>{row.nbrComp || "—"}</td>
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
      {monthlyRows.length > 0 && <div style={s.count}>{monthlyRows.length} ligne{monthlyRows.length > 1 ? "s" : ""}</div>}

      {/* ── Graphiques ── */}
      <div style={s.card}>
        <div style={s.cardHead}>
          <span style={s.cardTitle}>Progression par archer</span>
          <div style={s.cardFilters}>
            <FilterSelect label="Archer"   value={g1Archer} options={archerOptionsAll} onChange={setG1Archer} />
            <FilterSelect label="Distance" value={g1Dist}   options={GRAPH_DISTANCES}  onChange={setG1Dist} />
          </div>
        </div>
        {hasG1
          ? <div style={{ height: 320, marginTop: "20px" }}><Line data={{ labels: g1Labels, datasets: g1Datasets }} options={g1Opts} /></div>
          : <div style={s.empty}>Aucune séance avec tir compté pour cette sélection.</div>}
      </div>

      <div style={s.card}>
        <div style={s.cardHead}>
          <span style={s.cardTitle}>Score moyen par mois</span>
          <div style={s.cardFilters}>
            <FilterSelect label="Archer"   value={g3Archer} options={archerOptionsAll} onChange={setG3Archer} />
            <FilterSelect label="Distance" value={g3Dist}   options={GRAPH_DISTANCES}  onChange={setG3Dist} />
          </div>
        </div>
        {hasG3
          ? <div style={{ height: 320, marginTop: "20px" }}><Line data={g3Data} options={g3Opts} /></div>
          : <div style={s.empty}>Aucune séance avec tir compté pour cette sélection.</div>}
      </div>

      <div style={s.card}>
        <div style={s.cardHead}>
          <span style={s.cardTitle}>Évolution des records par saison</span>
          <div style={s.cardFilters}>
            <FilterSelect label="Archer"   value={g2Archer} options={archerOptionsAll} onChange={setG2Archer} />
            <FilterSelect label="Distance" value={g2Dist}   options={GRAPH_DISTANCES}  onChange={setG2Dist} />
            <FilterSelect label="Type"     value={g2Type}   options={GRAPH_TYPES}      onChange={setG2Type} />
          </div>
        </div>
        {hasG2
          ? <div style={{ height: 320, marginTop: "20px" }}><Line data={{ labels: g2Labels, datasets: g2Datasets }} options={g2Opts} /></div>
          : <div style={s.empty}>Aucune donnée pour cette sélection.</div>}
      </div>

      {distBarCharts.length > 0 && (
        <div style={s.sectionCard}>
          <div style={s.sectionCardHeader}>
            <span style={s.cardTitle}>Meilleur score moy. par distance — toutes saisons</span>
            <div style={{ marginLeft: "auto" }}>
              <FilterSelect label="Archer" value={g4Archer} options={archerOptionsAll} onChange={setG4Archer} />
            </div>
            <span style={s.hint}>Moyenne top 3 · ×60 (5m/18m) · ×72 autres</span>
          </div>
          <div style={s.distGrid}>
            {distBarCharts.map(({ dist, nf, data, opts }) => (
              <div key={dist} style={s.distCard}>
                <div style={s.distCardTitle}>
                  {dist} <span style={{ color: "var(--text-dim)", fontWeight: "400", fontSize: "12px" }}>(max {nf * 10} pts / {nf} fl.)</span>
                </div>
                <div style={{ height: 260 }}><ChartMixed type="bar" data={data} options={opts} /></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sous-composants ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }) {
  return (
    <div style={s.statCard}>
      <div style={s.statLabel}>{label}</div>
      <div className="num" style={s.statValue}>{value}</div>
      {sub && <div style={s.statSub}>{sub}</div>}
    </div>
  );
}

function MoyDistCard({ moyByDist }) {
  return (
    <div style={{ ...s.statCard, gap: "8px" }}>
      <div style={s.statLabel}>Moy. club / flèche</div>
      {moyByDist.length === 0 ? (
        <div style={{ fontSize: "13px", color: "var(--text-dim)" }}>—</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "2px" }}>
          {moyByDist.map(({ dist, moy }) => (
            <div key={dist} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: "600" }}>{dist}</span>
              <span className="num" style={{ fontSize: "16px", fontWeight: "700", color: PRIMARY, letterSpacing: "-0.01em" }}>{moy.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RankBadge({ rang }) {
  const extra = RANK_STYLE[rang] ?? { backgroundColor: "var(--input-bg)", color: "var(--text-dim)" };
  return <span style={{ ...s.rankBadge, ...extra }}>{ordinal(rang)}</span>;
}

function ExportButtons({ disabled, onExcel, onPDF }) {
  return (
    <div style={{ display: "flex", gap: "6px" }}>
      <button style={{ ...s.exportBtn, ...(disabled ? s.off : {}) }} onClick={onExcel} disabled={disabled} title="Exporter en Excel (.xlsx)">↓ Excel</button>
      <button style={{ ...s.exportBtn, ...(disabled ? s.off : {}) }} onClick={onPDF}   disabled={disabled} title="Exporter en PDF">↓ PDF</button>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const thBase = {
  padding: "10px 12px", fontSize: "11px", fontWeight: "700",
  textTransform: "uppercase", letterSpacing: "0.06em",
  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
  backgroundColor: "var(--surface-raised)", color: "var(--text-dim)",
};

const s = {
  page: { display: "flex", flexDirection: "column", gap: "18px" },
  info: { color: "var(--text-muted)", fontSize: "14px" },
  errMsg: { color: PRIMARY, fontSize: "13px", padding: "10px 14px", backgroundColor: "var(--pink-soft)", borderRadius: "8px", border: `1px solid ${PRIMARY}` },

  saisonBar: {
    backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px",
    padding: "13px 18px", display: "flex", alignItems: "center", gap: "10px",
    boxShadow: "var(--shadow-card)", alignSelf: "flex-start",
  },
  saisonLabel: { fontSize: "13px", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" },
  saisonSelect: {
    backgroundColor: "var(--input-bg)", color: "var(--text-2)", border: "1.5px solid var(--border-2)", borderRadius: "7px",
    padding: "7px 12px", fontSize: "14px", fontWeight: "600", outline: "none", fontFamily: "inherit", cursor: "pointer",
  },

  statCard: { backgroundColor: "var(--surface)", borderRadius: "12px", boxShadow: "var(--shadow-card)", padding: "18px 20px", display: "flex", flexDirection: "column", gap: "4px" },
  statLabel: { fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em" },
  statValue: { fontSize: "28px", fontWeight: "700", color: "var(--text)", letterSpacing: "-0.01em", lineHeight: "1.1" },
  statSub: { fontSize: "12px", color: "var(--text-dim)" },

  archerGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" },
  archerCard: { backgroundColor: "var(--surface)", borderRadius: "10px", boxShadow: "var(--shadow-card)", padding: "14px 16px", display: "flex", alignItems: "center", gap: "13px" },
  avatar: { width: "42px", height: "42px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", fontWeight: "700", flexShrink: 0 },
  archerInfo: { display: "flex", flexDirection: "column", gap: "3px" },
  archerName: { fontSize: "14px", fontWeight: "700", color: "var(--text)" },
  archerMeta: { fontSize: "11px", color: "var(--text-dim)" },
  archerMoy:  { fontFamily: "var(--mono)", fontVariantNumeric: "tabular-nums", fontSize: "12px", fontWeight: "600", color: PRIMARY },

  sectionHead:  { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" },
  sectionTitle: { fontFamily: "var(--display)", fontSize: "17px", fontWeight: "600", color: "var(--text)", margin: 0 },
  filters: { display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" },
  exportBtn: { backgroundColor: "var(--border)", color: "var(--text)", border: "none", borderRadius: "7px", padding: "8px 14px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" },
  off: { opacity: 0.4, cursor: "not-allowed" },

  tableWrap: { backgroundColor: "var(--surface)", borderRadius: "12px", boxShadow: "var(--shadow-card)", overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th:  { ...thBase, textAlign: "left" },
  thR: { ...thBase, textAlign: "right" },
  thGrpSeance: { ...thBase, textAlign: "center", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" },
  thGrpVol:    { ...thBase, textAlign: "center", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" },
  thGrpEntr:   { ...thBase, textAlign: "center", color: PRIMARY, backgroundColor: "var(--pink-soft)", borderLeft: "2px solid var(--pink-line)" },
  thGrpComp:   { ...thBase, textAlign: "center", color: BLUE,    backgroundColor: "var(--blue-soft)", borderLeft: "2px solid var(--blue-line)" },
  thSub:       { ...thBase, fontWeight: "600", color: "var(--text-dim)" },
  thSubEntr:   { ...thBase, fontWeight: "600", color: PRIMARY, backgroundColor: "var(--pink-soft)" },
  thSubComp:   { ...thBase, fontWeight: "600", color: BLUE,    backgroundColor: "var(--blue-soft)" },

  tr: { borderBottom: "1px solid var(--border)", transition: "background-color 0.1s" },
  trTop: { backgroundColor: "var(--pink-soft)" },
  td:    { padding: "10px 12px", color: "var(--text-2)", whiteSpace: "nowrap" },
  tdR:   { padding: "10px 12px", textAlign: "right", color: "var(--text-3)", whiteSpace: "nowrap" },
  tdNum: { padding: "10px 12px", textAlign: "right", color: "var(--text-3)", whiteSpace: "nowrap", fontFamily: "var(--mono)", fontVariantNumeric: "tabular-nums" },
  badge: { backgroundColor: "var(--border)", borderRadius: "5px", padding: "2px 8px", fontSize: "12px", fontWeight: "600", color: "var(--text-3)" },
  rankBadge: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "36px", height: "24px", borderRadius: "12px", fontSize: "12px", fontWeight: "700", padding: "0 8px" },
  regTag: { fontSize: "10px", fontWeight: "600", backgroundColor: "var(--warn-soft)", borderRadius: "4px", padding: "1px 5px", color: "var(--warn)" },

  empty: { padding: "40px", textAlign: "center", color: "var(--text-dim)", fontSize: "14px" },
  count: { fontSize: "12px", color: "var(--text-dim)", textAlign: "right" },

  card: { backgroundColor: "var(--surface)", borderRadius: "12px", boxShadow: "var(--shadow-card)", padding: "20px 24px 28px" },
  cardHead: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "12px" },
  cardTitle: { fontFamily: "var(--display)", fontSize: "15px", fontWeight: "600", color: "var(--text-2)", paddingTop: "5px" },
  cardFilters: { display: "flex", gap: "12px", flexWrap: "wrap" },

  sectionCard: { backgroundColor: "var(--surface)", borderRadius: "12px", boxShadow: "var(--shadow-card)", padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: "20px" },
  sectionCardHeader: { display: "flex", alignItems: "center", gap: "10px", paddingBottom: "16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" },
  hint: { fontSize: "11px", color: "var(--text-dim)", fontStyle: "italic" },
  distGrid: { display: "flex", flexDirection: "column", gap: "16px" },
  distCard: { backgroundColor: "var(--surface-sub)", borderRadius: "10px", border: "1px solid var(--border)", padding: "16px 20px 20px" },
  distCardTitle: { fontSize: "13px", fontWeight: "600", color: "var(--text-2)", marginBottom: "14px" },
};
