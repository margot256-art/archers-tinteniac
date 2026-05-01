import { useState, useMemo } from "react";
import { useAllSeances } from "../../hooks/useAllSeances";
import XLSX from "xlsx-js-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

  // ── Export helpers ────────────────────────────────────────────────────────

  const EXPORT_COLS = [
    "Mois", "Archer", "Distance", "Séances Entr.", "Séances Comp.",
    "Paille", "Blason", "Compté", "Score", "Total fl.",
    "Moy./fl. Entr.", "Score moy. Entr.",
    "Moy./fl. Comp.", "Score moy. Comp.",
  ];
  const EXPORT_NC       = EXPORT_COLS.length; // 14
  const EXPORT_NUM_COLS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

  const rowToArr = (row, asString = false) => [
    fmtMois(row.month),
    row.archer,
    row.distance,
    row.nbrEntr     || "",
    row.nbrComp     || "",
    row.paille      || "",
    row.blason      || "",
    row.compteTotal || "",
    row.score       || "",
    row.total       || "",
    row.moyEntr  != null ? (asString ? row.moyEntr.toFixed(2) : parseFloat(row.moyEntr.toFixed(2))) : "",
    row.scoreMoyEntr ?? "",
    row.moyComp  != null ? (asString ? row.moyComp.toFixed(2) : parseFloat(row.moyComp.toFixed(2))) : "",
    row.scoreMoyComp ?? "",
  ];

  const buildTotalRow = (asString = false) => {
    const t = rows.reduce((acc, row) => ({
      nbrEntr:     acc.nbrEntr     + row.nbrEntr,
      nbrComp:     acc.nbrComp     + row.nbrComp,
      paille:      acc.paille      + row.paille,
      blason:      acc.blason      + row.blason,
      compteTotal: acc.compteTotal + row.compteTotal,
      score:       acc.score       + row.score,
      total:       acc.total       + row.total,
      scoreEntr:   acc.scoreEntr   + row.scoreEntr,
      compteEntr:  acc.compteEntr  + row.compteEntr,
      scoreComp:   acc.scoreComp   + row.scoreComp,
      compteComp:  acc.compteComp  + row.compteComp,
    }), { nbrEntr:0, nbrComp:0, paille:0, blason:0, compteTotal:0, score:0, total:0, scoreEntr:0, compteEntr:0, scoreComp:0, compteComp:0 });
    const moyEntr = t.compteEntr > 0 ? t.scoreEntr / t.compteEntr : null;
    const moyComp = t.compteComp > 0 ? t.scoreComp / t.compteComp : null;
    const fmt = (v) => v != null ? (asString ? v.toFixed(2) : parseFloat(v.toFixed(2))) : "";
    return [
      `Total — Saison ${filterSaison}`, "", "",
      t.nbrEntr  || "", t.nbrComp  || "",
      t.paille   || "", t.blason   || "", t.compteTotal || "",
      t.score    || "", t.total    || "",
      fmt(moyEntr), "", fmt(moyComp), "",
    ];
  };

  const exportTitle = filterArcher !== "Tous"
    ? `Stats mensuelles — ${filterArcher} — Saison ${filterSaison}`
    : `Stats mensuelles — club — Saison ${filterSaison}`;

  // ── Export Excel ──────────────────────────────────────────────────────────

  const handleExportExcel = () => {
    const NC      = EXPORT_NC;
    const numCols = EXPORT_NUM_COLS;
    const center  = { horizontal: "center", vertical: "center" };

    const aoa     = [];
    const merges  = [];
    const rowMeta = [];

    aoa.push([exportTitle, ...Array(NC - 1).fill("")]);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: NC - 1 } });
    rowMeta.push({ type: "title" });
    aoa.push(Array(NC).fill(""));
    rowMeta.push({ type: "empty" });

    aoa.push([...EXPORT_COLS]);
    rowMeta.push({ type: "header" });

    rows.forEach((row, i) => {
      aoa.push(rowToArr(row, false));
      rowMeta.push({ type: "data", even: i % 2 === 0 });
    });

    aoa.push(buildTotalRow(false));
    rowMeta.push({ type: "total" });

    const ws      = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = merges;
    ws["!cols"]   = [
      { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
      { wch: 8  }, { wch: 8  }, { wch: 8  }, { wch: 8  }, { wch: 10 },
      { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 18 },
    ];

    const ST = {
      title: {
        font: { bold: true, sz: 13, color: { rgb: "FFFFFF" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "B30057" } },
        alignment: { horizontal: "left", vertical: "center" },
      },
      header: {
        font: { bold: true, sz: 9, color: { rgb: "000000" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "FFCCE5" } },
        alignment: center,
        border: { bottom: { style: "medium", color: { rgb: "FF007A" } } },
      },
      dataEven: {
        font: { sz: 9, color: { rgb: "202020" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } },
        alignment: center,
      },
      dataOdd: {
        font: { sz: 9, color: { rgb: "202020" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "FFF0F6" } },
        alignment: center,
      },
      total: {
        font: { bold: true, sz: 9, color: { rgb: "FFFFFF" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "FF007A" } },
        alignment: center,
        border: { top: { style: "medium", color: { rgb: "B30057" } } },
      },
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
          meta.type === "title"  ? ST.title  :
          meta.type === "header" ? ST.header :
          meta.type === "total"  ? ST.total  :
          meta.even              ? ST.dataEven : ST.dataOdd;
      }
    });
    ws["!rows"] = rowHeights;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stats");
    XLSX.writeFile(wb, `stats-club-${filterSaison.replace("/", "-")}.xlsx`);
  };

  // ── Export PDF ────────────────────────────────────────────────────────────

  const handleExportPDF = () => {
    const pdf   = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw    = pdf.internal.pageSize.width;
    const ph    = pdf.internal.pageSize.height;
    // Mois(22) Archer(24) Dist(10) SéEntr(14) SéComp(14) Paille(10) Blason(10) Compté(10) Score(10) Total(12) MoyEntr(18) ScMoyEntr(22) MoyComp(18) ScMoyComp(auto)
    const COL_W = [22, 24, 10, 14, 14, 10, 10, 10, 10, 12, 18, 22, 18, 0];

    const colStyles = COL_W.reduce((acc, w, i) => {
      acc[i] = { halign: "center" };
      if (w > 0) acc[i].cellWidth = w;
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

    const body     = rows.map(row => rowToArr(row, true));
    const totalRow = buildTotalRow(true);

    autoTable(pdf, {
      head: [EXPORT_COLS],
      body: [...body, totalRow],
      startY: 18,
      margin: { left: 14, right: 14, top: 18 },
      styles: { fontSize: 7.5, cellPadding: 2, font: "helvetica", halign: "center" },
      headStyles: {
        fillColor: [255, 204, 229], textColor: [0, 0, 0],
        fontStyle: "bold", fontSize: 8, halign: "center",
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

    pdf.save(`stats-club-${filterSaison.replace("/", "-")}.pdf`);
  };

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
          <div style={{ display: "flex", gap: "6px" }}>
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
                  const entrMoyColor = row.moyEntr == null ? "var(--text-dim)" : PRIMARY;
                  const compMoyColor = row.moyComp == null ? "var(--text-dim)" : BLUE;
                  return (
                    <tr key={i} style={s.tr}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--surface-raised)"}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}
                    >
                      <td style={{ ...s.td, fontWeight: "500" }}>{fmtMois(row.month)}</td>
                      <td style={{ ...s.td, fontWeight: "700" }}>{row.archer}</td>
                      <td style={s.td}><span style={s.badge}>{row.distance}</span></td>
                      <td style={{ ...s.tdNum, color: row.nbrEntr ? PRIMARY : "var(--text-dim)", fontWeight: "600" }}>{row.nbrEntr || "—"}</td>
                      <td style={{ ...s.tdNum, color: row.nbrComp ? BLUE    : "var(--text-dim)", fontWeight: "600" }}>{row.nbrComp || "—"}</td>
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
        <div style={{ fontSize: "13px", color: "var(--text-dim)" }}>—</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "2px" }}>
          {moyByDist.map(({ dist, moy }) => (
            <div key={dist} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: "600" }}>{dist}</span>
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
  borderBottom: "var(--border)", whiteSpace: "nowrap",
  backgroundColor: "var(--surface-raised)", color: "var(--text-dim)",
};

const s = {
  page:   { display: "flex", flexDirection: "column", gap: "16px" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" },
  title:  { fontSize: "20px", fontWeight: "700", color: "var(--text)", margin: 0 },
  filters:{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" },
  exportBtn: {
    backgroundColor: "var(--border)", color: "var(--text)", border: "none",
    borderRadius: "7px", padding: "8px 14px", fontSize: "13px",
    fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
  },
  filterLabel: {
    fontSize: "12px", fontWeight: "600", color: "var(--text-muted)",
    textTransform: "uppercase", letterSpacing: "0.06em",
  },

  saisonBar: {
    display: "flex", alignItems: "center", gap: "10px",
    alignSelf: "flex-start",
  },
  saisonBarLabel: {
    fontSize: "12px", fontWeight: "700", color: "var(--text-dim)",
    textTransform: "uppercase", letterSpacing: "0.08em",
  },
  saisonSelect: {
    padding: "7px 12px", borderRadius: "8px",
    border: "var(--border-2)",
    backgroundColor: "var(--surface-raised)", color: "var(--blue-soft)",
    fontSize: "14px", fontWeight: "600",
    cursor: "pointer", outline: "none", fontFamily: "inherit",
  },

  // stat cards
  statCard: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)",
    padding: "18px 20px",
    display: "flex", flexDirection: "column", gap: "4px",
  },
  statLabel: {
    fontSize: "11px", fontWeight: "700", color: "var(--text-dim)",
    textTransform: "uppercase", letterSpacing: "0.07em",
  },
  statValue: {
    fontSize: "28px", fontWeight: "800", color: "var(--text)",
    letterSpacing: "-0.02em", lineHeight: "1.1",
  },
  statSub: { fontSize: "12px", color: "var(--text-dim)" },

  // macarons archers
  archerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "12px",
  },
  archerCard: {
    backgroundColor: "var(--surface)", borderRadius: "10px",
    boxShadow: "var(--shadow-card)",
    padding: "14px 16px",
    display: "flex", alignItems: "center", gap: "13px",
  },
  avatar: {
    width: "42px", height: "42px", borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "15px", fontWeight: "800", flexShrink: 0,
  },
  archerInfo: { display: "flex", flexDirection: "column", gap: "3px" },
  archerName: { fontSize: "14px", fontWeight: "700", color: "var(--text)" },
  archerMeta: { fontSize: "11px", color: "var(--text-dim)" },
  archerMoy:  { fontSize: "12px", fontWeight: "600", color: PRIMARY },

  // tableau
  tableWrap: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)", overflowX: "auto",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },

  th:         { ...thBase, textAlign: "left" },
  thR:        { ...thBase, textAlign: "right" },
  thGrpSeance:{ ...thBase, textAlign: "center", borderLeft: "var(--border)", borderRight: "var(--border)" },
  thGrpVol:   { ...thBase, textAlign: "center", borderLeft: "var(--border)", borderRight: "var(--border)" },
  thGrpEntr:  { ...thBase, textAlign: "center", color: PRIMARY, backgroundColor: "rgba(255,0,122,0.1)", borderLeft: "2px solid rgba(255,0,122,0.3)" },
  thGrpComp:  { ...thBase, textAlign: "center", color: BLUE,    backgroundColor: "rgba(59,130,246,0.1)", borderLeft: "2px solid rgba(59,130,246,0.3)" },
  thSub:      { ...thBase, fontWeight: "600", color: "var(--text-dim)" },
  thSubEntr:  { ...thBase, fontWeight: "600", color: PRIMARY, backgroundColor: "rgba(255,0,122,0.1)" },
  thSubComp:  { ...thBase, fontWeight: "600", color: BLUE,    backgroundColor: "rgba(59,130,246,0.1)" },

  tr:    { borderBottom: "1px solid #1e1e1e", transition: "background-color 0.1s" },
  td:    { padding: "10px 12px", color: "var(--text-2)", whiteSpace: "nowrap" },
  tdNum: { padding: "10px 12px", textAlign: "right", color: "var(--text-3)", whiteSpace: "nowrap" },
  badge: {
    backgroundColor: "var(--border)", borderRadius: "5px",
    padding: "2px 8px", fontSize: "12px", fontWeight: "600", color: "var(--text-3)",
  },
  empty:  { padding: "40px", textAlign: "center", color: "var(--text-dim)", fontSize: "14px" },
  info:   { color: "var(--text-muted)", fontSize: "14px" },
  errMsg: {
    color: PRIMARY, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "rgba(255,0,122,0.1)", borderRadius: "8px", border: `1px solid ${PRIMARY}`,
  },
  count: { fontSize: "12px", color: "var(--text-dim)", textAlign: "right" },
};
