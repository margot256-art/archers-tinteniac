import { useState, useMemo, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAllSeances } from "../../hooks/useAllSeances";
import { chargerExport } from "../../utils/exportLibs";
import { PRIMARY, BLUE, getPaille, getBlason, getCompte, normFactor, getSaison, CURRENT_SAISON, MOIS, fmtYM, nbSeances, cleSeance, libelleSaison, optionsDistances } from "../../utils/seances";
import { scoreEpreuve } from "../../utils/records";
import FilterSelect from "../shared/FilterSelect";
import { CourbesGraphiques } from "../archer/progression/Courbes";
import * as ui from "../archer/styleArcher";

const DIST_ONLY  = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const DIST_ORDER = DIST_ONLY;
const TYPES      = ["Tous", "Entraînement", "Compétition"];

const fmtDec    = (v) => (v != null ? v.toFixed(2) : "—");
const fmtInt    = (v) => (v != null ? String(v) : "—");

function stdDev(vals) {
  if (vals.length < 2) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / vals.length);
}
function ordinal(n) {
  if (n === 1) return "1er";
  return `${n}e`;
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

// ── Composant principal ───────────────────────────────────────────────────────

export default function ProgressionClub() {
  const { seances, loading, error } = useAllSeances();
  // Objectifs des archers : ligne d’objectif sur les courbes de l’archer choisi.
  const [objectifs, setObjectifs] = useState([]);
  useEffect(() => onSnapshot(collection(db, "objectifs"),
    (snap) => setObjectifs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))), []);

  // Un seul jeu de filtres pour toute la page. Le classement compare toujours tous
  // les archers (l'archer choisi y est surligné) ; l'évolution des records couvre
  // toutes les saisons.
  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);
  const [filterArcher, setFilterArcher] = useState("Tous");
  const [filterDist,   setFilterDist]   = useState("Toutes");
  const [filterType,   setFilterType]   = useState("Tous");
  // Deux vues, comme la Progression de l'archer : Totaux (chiffres, classement,
  // stats mensuelles) et Courbes. Les filtres sont communs aux deux.
  const [vue, setVue] = useState("totaux");

  const saisonOptions = useMemo(() => {
    const set = new Set(seances.filter(s => s.date).map(s => getSaison(s.date)));
    set.add(CURRENT_SAISON);
    return ["Toutes", ...[...set].sort((a, b) => b.localeCompare(a))];
  }, [seances]);

  const okDistType = (s) =>
    (filterDist === "Toutes" || s.distance === filterDist) && (filterType === "Tous" || s.type === filterType);
  const okArcher = (s) => filterArcher === "Tous" || s.archer === filterArcher;

  const saisonSeances = useMemo(() =>
    seances.filter(s => s.date && (filterSaison === "Toutes" || getSaison(s.date) === filterSaison)),
    [seances, filterSaison]
  );
  // Séances de la saison aux distance et type choisis (tous archers).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const base = useMemo(() => saisonSeances.filter(okDistType), [saisonSeances, filterDist, filterType]);
  // … et de l'archer choisi.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selection = useMemo(() => base.filter(okArcher), [base, filterArcher]);

  const archerOptions = useMemo(() => {
    const names = new Set(seances.map(s => s.archer).filter(Boolean));
    return ["Tous", ...[...names].sort()];
  }, [seances]);

  // ── Chiffres clés ──────────────────────────────────────────────────────────

  const globalStats = useMemo(() => {
    const actifs  = new Set(selection.map(s => s.archer).filter(Boolean)).size;
    const fleches = selection.reduce((n, s) => n + getPaille(s) + getBlason(s) + getCompte(s), 0);
    const distMap = {};
    for (const s of selection) {
      if (!s.distance || !(getCompte(s) > 0 && (s.score ?? 0) > 0)) continue;
      if (!distMap[s.distance]) distMap[s.distance] = { scoreSum: 0, compteSum: 0 };
      distMap[s.distance].scoreSum  += s.score;
      distMap[s.distance].compteSum += getCompte(s);
    }
    const moyByDist = DIST_ORDER
      .filter(d => distMap[d]?.compteSum > 0)
      .map(d => ({ dist: d, moy: distMap[d].scoreSum / distMap[d].compteSum }));
    return {
      total: nbSeances(selection), actifs, fleches, moyByDist,
      entr: nbSeances(selection.filter(s => s.type === "Entraînement")),
      comp: nbSeances(selection.filter(s => s.type === "Compétition")),
    };
  }, [selection]);

  // ── Classement ─────────────────────────────────────────────────────────────

  const [rankPeriod, setRankPeriod] = useState("Toute la saison");

  const periodOptions = useMemo(() => {
    if (filterSaison === "Toutes") return ["Toute la saison"];
    const months = new Set(saisonSeances.map(s => s.date.slice(0, 7)));
    const labels = [...months].sort().reverse().map(ym => {
      const [y, m] = ym.split("-").map(Number);
      return `${MOIS[m - 1]} ${y}`;
    });
    return ["Toute la saison", ...labels];
  }, [saisonSeances, filterSaison]);
  const periode = periodOptions.includes(rankPeriod) ? rankPeriod : "Toute la saison";

  const rankRows = useMemo(() => {
    const src = base.filter(s => {
      if (!s.archer) return false;
      if (periode !== "Toute la saison") {
        const [mois, annee] = periode.split(" ");
        if (!s.date.startsWith(`${annee}-${String(MOIS.indexOf(mois) + 1).padStart(2, "0")}`)) return false;
      }
      return true;
    });

    const map = {};
    for (const sess of src) {
      if (!map[sess.archer]) map[sess.archer] = { archer: sess.archer, sessions: [] };
      map[sess.archer].sessions.push(sess);
    }

    const computed = Object.values(map).map(({ archer, sessions }) => {
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
      return { archer, nbSeances: nbSeances(sessions), totalFleches, avgMoy, scoreMoy, sigma: stdDev(moyennes), bestNorm };
    });

    // Rang seulement pour les archers qui ont un tir compté ; les autres suivent, sans rang.
    computed.sort((a, b) => {
      const ma = a.avgMoy ?? -Infinity;
      const mb = b.avgMoy ?? -Infinity;
      return mb !== ma ? mb - ma : a.archer.localeCompare(b.archer);
    });
    for (let i = 0; i < computed.length; i++) {
      if (computed[i].avgMoy == null) { computed[i].rang = null; continue; }
      computed[i].rang = i > 0 && computed[i].avgMoy === computed[i - 1].avgMoy ? computed[i - 1].rang : i + 1;
    }
    return computed;
  }, [base, periode]);

  const suffixeFiltres = [
    filterDist !== "Toutes" && filterDist,
    filterType !== "Tous" && filterType,
  ].filter(Boolean).map((t) => ` · ${t}`).join("");

  const rankExportTitle = `Classement — Saison ${libelleSaison(filterSaison)}${suffixeFiltres}${periode !== "Toute la saison" ? ` · ${periode}` : ""}`;

  const rankRowArr = (r, asString = false) => [
    r.rang ? ordinal(r.rang) : "", r.archer, r.nbSeances, r.totalFleches,
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
    rankRows.map(r => rankRowArr(r, false)),
    "Classement", `classement-saison-${libelleSaison(filterSaison)}.xlsx`,
    [8, 22, 10, 12, 10, 12, 14, 14]
  );
  const handleRankExportPDF = () => exportPdf(
    rankExportTitle, RANK_COLS, RANK_RIGHT,
    rankRows.map(r => rankRowArr(r, true)),
    [16, 60, 22, 24, 22, 24, 36, 0],
    `classement-saison-${libelleSaison(filterSaison)}.pdf`
  );

  // ── Tableau mensuel par archer ────────────────────────────────────────────

  const monthlyRows = useMemo(() => {
    const map = {};
    for (const s of selection) {
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
          ...g, nbrEntr: g.seancesEntr.size, nbrComp: g.seancesComp.size, total: g.paille + g.blason + g.compteTotal,
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
  }, [selection]);

  const MONTH_COLS  = ["Mois", "Archer", "Distance", "Séances Entr.", "Séances Comp.", "Paille", "Blason", "Compté", "Total fl.", "Moy./fl. Entr.", "Score moy. Entr.", "Moy./fl. Comp.", "Score moy. Comp."];
  const MONTH_NC    = MONTH_COLS.length;
  const MONTH_RIGHT = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const monthRowArr = (row, asString = false) => [
    fmtYM(row.month), row.archer, row.distance, row.nbrEntr || "", row.nbrComp || "",
    row.paille || "", row.blason || "", row.compteTotal || "", row.total || "",
    row.moyEntr != null ? (asString ? row.moyEntr.toFixed(2) : parseFloat(row.moyEntr.toFixed(2))) : "",
    row.scoreMoyEntr ?? "",
    row.moyComp != null ? (asString ? row.moyComp.toFixed(2) : parseFloat(row.moyComp.toFixed(2))) : "",
    row.scoreMoyComp ?? "",
  ];

  const monthTotalArr = (asString = false) => {
    const t = monthlyRows.reduce((acc, row) => ({
      nbrEntr: acc.nbrEntr + row.nbrEntr, nbrComp: acc.nbrComp + row.nbrComp,
      paille: acc.paille + row.paille, blason: acc.blason + row.blason, compteTotal: acc.compteTotal + row.compteTotal,
      total: acc.total + row.total,
      scoreEntr: acc.scoreEntr + row.scoreEntr, compteEntr: acc.compteEntr + row.compteEntr,
      scoreComp: acc.scoreComp + row.scoreComp, compteComp: acc.compteComp + row.compteComp,
    }), { nbrEntr: 0, nbrComp: 0, paille: 0, blason: 0, compteTotal: 0, total: 0, scoreEntr: 0, compteEntr: 0, scoreComp: 0, compteComp: 0 });
    const moyEntr = t.compteEntr > 0 ? t.scoreEntr / t.compteEntr : null;
    const moyComp = t.compteComp > 0 ? t.scoreComp / t.compteComp : null;
    const fmt = (v) => v != null ? (asString ? v.toFixed(2) : parseFloat(v.toFixed(2))) : "";
    return [
      `Total — Saison ${libelleSaison(filterSaison)}`, "", "", t.nbrEntr || "", t.nbrComp || "",
      t.paille || "", t.blason || "", t.compteTotal || "", t.total || "",
      fmt(moyEntr), "", fmt(moyComp), "",
    ];
  };

  const monthExportTitle = `Stats mensuelles — ${filterArcher !== "Tous" ? filterArcher : "club"} — Saison ${libelleSaison(filterSaison)}${suffixeFiltres}`;

  const handleMonthExportExcel = () => exportXlsx(
    monthExportTitle, MONTH_COLS, MONTH_RIGHT,
    [...monthlyRows.map(r => monthRowArr(r, false)), monthTotalArr(false)],
    "Stats", `stats-club-saison-${libelleSaison(filterSaison)}.xlsx`,
    [14, 16, 10, 14, 14, 8, 8, 8, 10, 14, 18, 14, 18]
  );
  const handleMonthExportPDF = () => exportPdf(
    monthExportTitle, MONTH_COLS, MONTH_RIGHT,
    [...monthlyRows.map(r => monthRowArr(r, true)), monthTotalArr(true)],
    [22, 24, 10, 14, 14, 10, 10, 10, 12, 18, 22, 18, 0],
    `stats-club-saison-${libelleSaison(filterSaison)}.pdf`
  );

  // ── Courbes : les mêmes graphiques que la Progression de l’archer ─────────
  // Séances de l’archer choisi (ou de tout le club) au type choisi ; la saison et la
  // distance sont appliquées par les graphiques eux-mêmes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const seancesCourbes = useMemo(() => seances.filter((s) => okArcher(s) && (filterType === "Tous" || s.type === filterType)), [seances, filterArcher, filterType]);
  const objectifArcher = filterArcher === "Tous" ? null
    : objectifs.find((o) => o.archer === filterArcher || o.id === seances.find((s) => s.archer === filterArcher)?.archerId) ?? null;

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (loading) return <div style={ui.info}>Chargement…</div>;
  if (error)   return <div style={ui.erreur}>{error}</div>;

  return (
    <div style={{ ...ui.pageLarge, gap: "22px" }}>

      <div style={{ ...ui.bascule, alignSelf: "flex-start" }} role="tablist" aria-label="Vue">
        {[["totaux", "Totaux"], ["courbes", "Courbes"]].map(([id, label]) => (
          <button
            key={id} role="tab" aria-selected={vue === id}
            style={{ ...ui.basculeBtn, ...(vue === id ? ui.basculeBtnActif : {}) }}
            onClick={() => setVue(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Filtres de la page ── */}
      <div style={ui.filtres}>
        <FilterSelect label="Saison"   value={filterSaison} options={saisonOptions} onChange={setFilterSaison} libelle={libelleSaison} />
        <FilterSelect label="Archer"   value={filterArcher} options={archerOptions} onChange={setFilterArcher} />
        <FilterSelect label="Distance" value={filterDist}   options={optionsDistances(seances.filter(okArcher), filterSaison, filterDist)} onChange={setFilterDist} />
        <FilterSelect label="Type"     value={filterType}   options={TYPES}         onChange={setFilterType} />
      </div>

      {vue === "totaux" && <>
      {/* ── Chiffres clés ── */}
      <div className="coach-cards-grid">
        <Kpi label="Séances"  value={globalStats.total} sub={`${globalStats.entr} entr. · ${globalStats.comp} comp.`} />
        <Kpi label={filterArcher === "Tous" ? "Archers actifs" : "Archer"} value={filterArcher === "Tous" ? globalStats.actifs : filterArcher.split(" ")[0]} />
        <Kpi label="Flèches"  value={globalStats.fleches.toLocaleString("fr-FR")} />
        <div style={ui.kpi}>
          <div style={ui.kpiLabel}>Moyenne par flèche</div>
          {globalStats.moyByDist.length === 0 ? (
            <div style={ui.kpiValeur}>—</div>
          ) : globalStats.moyByDist.map(({ dist, moy }) => (
            <div key={dist} style={s.moyDist}>
              <span style={s.moyDistLabel}>{dist}</span>
              <span style={s.moyDistValeur}>{moy.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Classement ── */}
      <section style={s.section}>
        <div style={ui.barre}>
          <div>
            <h3 style={ui.titreSection}>Classement</h3>
            <p style={{ ...ui.sousTitre, marginTop: "2px" }}>Par moyenne par flèche · tous les archers{filterArcher !== "Tous" ? ` (${filterArcher} surligné)` : ""}</p>
          </div>
          <div style={ui.filtres}>
            <FilterSelect label="Période" value={periode} options={periodOptions} onChange={setRankPeriod} />
            <ExportButtons disabled={rankRows.length === 0} onExcel={handleRankExportExcel} onPDF={handleRankExportPDF} />
          </div>
        </div>
        <div style={ui.tableauCadre}>
          <table style={ui.tableau}>
            <thead>
              <tr>
                <th style={ui.th}>Rang</th>
                <th style={ui.th}>Archer</th>
                <th style={ui.thNum}>Séances</th>
                <th style={ui.thNum}>Total fl.</th>
                <th style={ui.thNum}>Moy./fl.</th>
                <th style={ui.thNum}>Score moy.</th>
                <th style={ui.thNum}>Régularité</th>
                <th style={ui.thNum}>Meilleur score</th>
              </tr>
            </thead>
            <tbody>
              {rankRows.length === 0 ? (
                <tr><td colSpan={8} style={s.empty}>Aucune séance pour cette sélection.</td></tr>
              ) : rankRows.map(r => {
                const choisi = r.archer === filterArcher;
                return (
                  <tr key={r.archer} style={choisi ? s.trChoisi : undefined}>
                    <td style={ui.td}>{r.rang ? <RankBadge rang={r.rang} /> : <span style={s.sansRang}>—</span>}</td>
                    <td style={{ ...ui.td, fontWeight: "600", color: "var(--text)" }}>{r.archer}</td>
                    <td style={ui.tdNum}>{r.nbSeances}</td>
                    <td style={ui.tdNum}>{r.totalFleches.toLocaleString("fr-FR")}</td>
                    <td style={{ ...ui.tdNum, color: r.avgMoy != null ? PRIMARY : "var(--text-dim)", fontWeight: "700" }}>{fmtDec(r.avgMoy)}</td>
                    <td style={ui.tdNum}>{r.scoreMoy ?? "—"}</td>
                    <td style={ui.tdNum}>
                      {r.sigma != null
                        ? <>{r.sigma.toFixed(2)} <span style={s.regTag}>{regulariteLabel(r.sigma)}</span></>
                        : "—"}
                    </td>
                    <td style={{ ...ui.tdNum, fontWeight: "600", color: "var(--text)" }}>{r.bestNorm ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Tableau mensuel ── */}
      <section style={s.section}>
        <div style={ui.barre}>
          <div>
            <h3 style={ui.titreSection}>Stats mensuelles</h3>
            <p style={{ ...ui.sousTitre, marginTop: "2px" }}>{filterArcher === "Tous" ? "Tout le club" : filterArcher}, par mois et par distance</p>
          </div>
          <ExportButtons disabled={monthlyRows.length === 0} onExcel={handleMonthExportExcel} onPDF={handleMonthExportPDF} />
        </div>
        <div style={ui.tableauCadre}>
          <table style={ui.tableau}>
            <thead>
              <tr>
                <th style={ui.th} rowSpan={2}>Mois</th>
                <th style={ui.th} rowSpan={2}>Archer</th>
                <th style={ui.th} rowSpan={2}>Dist.</th>
                <th style={s.thGroupe} colSpan={2}>Séances</th>
                <th style={s.thGroupe} colSpan={3}>Volumes</th>
                <th style={ui.thNum} rowSpan={2}>Total fl.</th>
                <th style={{ ...s.thGroupe, color: PRIMARY }} colSpan={2}><span style={ui.point(PRIMARY)} /> Entraînement</th>
                <th style={{ ...s.thGroupe, color: BLUE }} colSpan={2}><span style={ui.point(BLUE)} /> Compétition</th>
              </tr>
              <tr>
                <th style={ui.thNum}>Entr.</th>
                <th style={ui.thNum}>Comp.</th>
                <th style={ui.thNum}>Paille</th>
                <th style={ui.thNum}>Blason</th>
                <th style={ui.thNum}>Compté</th>
                <th style={ui.thNum}>Moy./fl.</th>
                <th style={ui.thNum}>Score moy.</th>
                <th style={ui.thNum}>Moy./fl.</th>
                <th style={ui.thNum}>Score moy.</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRows.length === 0 ? (
                <tr><td colSpan={MONTH_NC} style={s.empty}>Aucune séance trouvée.</td></tr>
              ) : monthlyRows.map((row, i) => {
                const entrMoyColor = row.moyEntr == null ? "var(--text-dim)" : PRIMARY;
                const compMoyColor = row.moyComp == null ? "var(--text-dim)" : BLUE;
                return (
                  <tr key={i}>
                    <td style={ui.td}>{fmtYM(row.month)}</td>
                    <td style={{ ...ui.td, fontWeight: "600", color: "var(--text)" }}>{row.archer}</td>
                    <td style={ui.td}>{row.distance}</td>
                    <td style={ui.tdNum}>{row.nbrEntr || "—"}</td>
                    <td style={ui.tdNum}>{row.nbrComp || "—"}</td>
                    <td style={ui.tdNum}>{row.paille || "—"}</td>
                    <td style={ui.tdNum}>{row.blason || "—"}</td>
                    <td style={ui.tdNum}>{row.compteTotal || "—"}</td>
                    <td style={{ ...ui.tdNum, fontWeight: "700", color: "var(--text)" }}>{row.total || "—"}</td>
                    <td style={{ ...ui.tdNum, color: entrMoyColor, fontWeight: "600" }}>{fmtDec(row.moyEntr)}</td>
                    <td style={{ ...ui.tdNum, color: entrMoyColor, fontWeight: "700" }}>{fmtInt(row.scoreMoyEntr)}</td>
                    <td style={{ ...ui.tdNum, color: compMoyColor, fontWeight: "600" }}>{fmtDec(row.moyComp)}</td>
                    <td style={{ ...ui.tdNum, color: compMoyColor, fontWeight: "700" }}>{fmtInt(row.scoreMoyComp)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      </>}

      {vue === "courbes" && <>
      {filterArcher === "Tous" && (
        <p style={ui.sousTitre}>Tout le club : une courbe par archer. Choisissez un archer pour voir ses courbes comme il les voit, avec ses objectifs.</p>
      )}
      <CourbesGraphiques
        seances={seancesCourbes} rawObjectif={objectifArcher}
        filterSaison={filterSaison} filterDist={filterDist === "Toutes" ? "Toutes" : filterDist}
        parArcher={filterArcher === "Tous"}
      />
      </>}
    </div>
  );
}

// ── Sous-composants ───────────────────────────────────────────────────────────

function Kpi({ label, value, sub }) {
  return (
    <div style={ui.kpi}>
      <div style={ui.kpiLabel}>{label}</div>
      <div style={ui.kpiValeur}>{value}</div>
      {sub && <div style={s.kpiSub}>{sub}</div>}
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
      <button style={{ ...ui.boutonSecondaire, ...(disabled ? s.off : {}) }} onClick={onExcel} disabled={disabled} title="Exporter en Excel (.xlsx)">↓ Excel</button>
      <button style={{ ...ui.boutonSecondaire, ...(disabled ? s.off : {}) }} onClick={onPDF}   disabled={disabled} title="Exporter en PDF">↓ PDF</button>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  section: { display: "flex", flexDirection: "column", gap: "10px" },
  kpiSub:  { fontSize: "12px", color: "var(--text-dim)" },
  moyDist:       { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  moyDistLabel:  { fontSize: "13px", color: "var(--text-muted)" },
  moyDistValeur: { fontFamily: "var(--display)", fontSize: "20px", fontWeight: "600", color: PRIMARY, fontVariantNumeric: "tabular-nums" },

  off: { opacity: 0.4, cursor: "not-allowed" },

  thGroupe: { ...ui.th, textAlign: "center", borderLeft: "1px solid var(--border)" },
  trChoisi: { backgroundColor: "var(--pink-soft)" },
  rankBadge: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "36px", height: "24px", borderRadius: "12px", fontSize: "12px", fontWeight: "700", padding: "0 8px" },
  sansRang:  { color: "var(--text-dim)" },
  regTag: { fontSize: "11px", fontWeight: "600", color: "var(--text-muted)" },

  carteGraph: { ...ui.carte, padding: "18px 22px 24px" },
  empty: { padding: "40px", textAlign: "center", color: "var(--text-dim)", fontSize: "14px" },
};
