import { Fragment, useState, useMemo, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useSeances } from "../../hooks/useSeances";
import { useObjectif } from "../../hooks/useObjectif";
import XLSX from "xlsx-js-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PRIMARY, BLUE, getPaille, getBlason, getCompte, normFactor, getSaison, CURRENT_SAISON, fmtDate, fmtYM, buildMonthTotals } from "../../utils/seances";
import FilterSelect from "../shared/FilterSelect";

const DISTANCES = ["Toutes", "5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const TYPES     = ["Tous", "Entraînement", "Compétition"];

const todayYM = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// ── Composant principal ───────────────────────────────────────────────────────

export default function MesSeances() {
  const { user }   = useAuth();
  const { seances, loading, error } = useSeances();
  const rawObjectif = useObjectif();

  const [filterDist,   setFilterDist]   = useState("Toutes");
  const [filterType,   setFilterType]   = useState("Tous");
  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);
  const [filterMois,   setFilterMois]   = useState("Tous");

  // volEntr pour la saison filtrée (rétrocompat ancien format)
  const volEntr = useMemo(() => {
    if (!rawObjectif) return null;
    if (rawObjectif.saisons?.[filterSaison]) return rawObjectif.saisons[filterSaison].volEntr ?? 0;
    if (rawObjectif.volEntr != null) return rawObjectif.volEntr;
    return null;
  }, [rawObjectif, filterSaison]);

  const currentYM = todayYM();

  const currentVolume = useMemo(() =>
    seances
      .filter(s => s.type === "Entraînement" && s.date?.startsWith(currentYM))
      .reduce((sum, s) => sum + getPaille(s) + getBlason(s) + getCompte(s), 0),
    [seances, currentYM]
  );

  const saisons = useMemo(() => {
    const set = new Set(seances.map(s => s.date ? getSaison(s.date) : null).filter(Boolean));
    return ["Toutes", ...[...set].sort((a, b) => b.localeCompare(a))];
  }, [seances]);

  const moisOptions = useMemo(() => {
    const base = seances.filter(s => {
      const okSaison = filterSaison === "Toutes" || (s.date && getSaison(s.date) === filterSaison);
      const okDist   = filterDist   === "Toutes" || s.distance === filterDist;
      const okType   = filterType   === "Tous"   || s.type     === filterType;
      return okSaison && okDist && okType && s.date;
    });
    const yms = [...new Set(base.map(s => s.date.slice(0, 7)))].sort((a, b) => b.localeCompare(a));
    return ["Tous", ...yms.map(ym => fmtYM(ym))];
  }, [seances, filterSaison, filterDist, filterType]);

  useEffect(() => { setFilterMois("Tous"); }, [filterSaison]);

  const filtered = useMemo(() =>
    seances.filter(s => {
      const okSaison = filterSaison === "Toutes" || (s.date && getSaison(s.date) === filterSaison);
      const okDist   = filterDist   === "Toutes" || s.distance === filterDist;
      const okType   = filterType   === "Tous"   || s.type     === filterType;
      const okMois   = filterMois   === "Tous"   || (s.date && fmtYM(s.date.slice(0, 7)) === filterMois);
      return okSaison && okDist && okType && okMois;
    }),
    [seances, filterSaison, filterDist, filterType, filterMois]
  );

  // Une ligne par jour : les exercices de même date (toutes séances confondues)
  // sont totalisés ensemble. Le détail par exercice se consulte dans l'onglet Journal.
  const parJour = useMemo(() => {
    const map = new Map();
    for (const doc of filtered) {
      if (!doc.date) continue;
      if (!map.has(doc.date)) map.set(doc.date, []);
      map.get(doc.date).push(doc);
    }
    return [...map.entries()].map(([date, docs]) => {
      const volumePaille = docs.reduce((n, x) => n + getPaille(x), 0);
      const volumeBlason = docs.reduce((n, x) => n + getBlason(x), 0);
      const volumeCompte = docs.reduce((n, x) => n + getCompte(x), 0);
      const scored = docs.filter(x => getCompte(x) > 0 && (x.score ?? 0) > 0);
      const score  = scored.reduce((n, x) => n + x.score, 0);
      const moy    = scored.length ? score / scored.reduce((n, x) => n + getCompte(x), 0) : null;
      const distinctDist = [...new Set(scored.map(x => x.distance))];
      const scoreMoy = moy != null && distinctDist.length === 1 ? Math.round(moy * normFactor(distinctDist[0])) : null;

      const types     = [...new Set(docs.map(x => x.type).filter(Boolean))];
      const distances = [...new Set(docs.map(x => x.distance).filter(Boolean))];
      const lieux     = [...new Set(docs.map(x => x.lieu).filter(Boolean))];

      return {
        date, nb: docs.length,
        type:     types.length === 1 ? types[0] : null,
        distance: distances.length === 1 ? distances[0] : null,
        lieu:     lieux.length === 1 ? lieux[0] : (lieux.length > 1 ? `${lieux.length} lieux` : null),
        volumePaille, volumeBlason, volumeCompte, score,
        total: volumePaille + volumeBlason + volumeCompte,
        moy, scoreMoy,
      };
    });
  }, [filtered]);

  const grouped = useMemo(() => {
    const map = new Map();
    parJour.forEach(j => {
      const ym = j.date.slice(0, 7);
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym).push(j);
    });
    for (const arr of map.values()) arr.sort((a, b) => b.date.localeCompare(a.date));
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [parJour]);

  // ── Helpers export ────────────────────────────────────────────────────────

  // ── Export Excel ──────────────────────────────────────────────────────────

  const handleExportExcel = () => {
    const COLS    = ["Date","Type","Lieu","Dist.","Paille","Blason","Compté","Score","Total fl.","Moy./fl.","Score moy."];
    const NC      = COLS.length;
    const archer  = user ? `${user.prenom} ${user.nom}` : "";

    const aoa      = [];
    const merges   = [];
    const rowMeta  = []; // { type: "title"|"month"|"header"|"data"|"total"|"empty", even? }

    // ── Titre ──
    aoa.push([`Mes séances — ${archer} — Saison ${filterSaison}`, ...Array(NC - 1).fill("")]);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: NC - 1 } });
    rowMeta.push({ type: "title" });
    aoa.push(Array(NC).fill(""));
    rowMeta.push({ type: "empty" });

    grouped.forEach(([ym, group]) => {
      // En-tête mois
      const mR = aoa.length;
      aoa.push([fmtYM(ym), ...Array(NC - 1).fill("")]);
      merges.push({ s: { r: mR, c: 0 }, e: { r: mR, c: NC - 1 } });
      rowMeta.push({ type: "month" });

      // En-tête colonnes
      aoa.push([...COLS]);
      rowMeta.push({ type: "header" });

      // Lignes données — une par jour
      group.forEach((j, i) => {
        aoa.push([
          j.date, j.type || "Mixte", j.lieu || "—", j.distance || "—",
          j.volumePaille, j.volumeBlason, j.volumeCompte, j.score || "", j.total,
          j.moy != null ? parseFloat(j.moy.toFixed(2)) : "",
          j.scoreMoy ?? "",
        ]);
        rowMeta.push({ type: "data", even: i % 2 === 0 });
      });

      // Ligne total
      const { tp, tb, tc, ts, tt, tmoy, tscoreMoy } = buildMonthTotals(group);
      aoa.push([
        `Total — ${fmtYM(ym)}`, "", "", "",
        tp, tb, tc, ts || "", tt || "",
        tmoy != null ? parseFloat(tmoy.toFixed(2)) : "",
        tscoreMoy ?? "",
      ]);
      rowMeta.push({ type: "total" });
      aoa.push(Array(NC).fill(""));
      rowMeta.push({ type: "empty" });
    });

    // ── Création feuille ──
    const ws      = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = merges;
    ws["!cols"]   = [
      { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 7 },
      { wch: 8  }, { wch: 8  }, { wch: 8  }, { wch: 8  },
      { wch: 10 }, { wch: 10 }, { wch: 12 },
    ];

    // ── Styles ──
    const numCols = [4, 5, 6, 7, 8, 9, 10]; // colonnes alignées à droite

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
      if (meta.type === "title") rowHeights[r] = { hpx: 28 };
      if (meta.type === "month") rowHeights[r] = { hpx: 20 };
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
    XLSX.writeFile(wb, `mes-seances-${filterSaison.replace("/", "-")}.xlsx`);
  };

  // ── Export PDF ────────────────────────────────────────────────────────────

  const handleExportPDF = () => {
    const pdf    = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const archer = user ? `${user.prenom} ${user.nom}` : "";
    const pw     = pdf.internal.pageSize.width;
    const ph     = pdf.internal.pageSize.height;
    const NC     = 11;
    const COL_HEADS = ["Date","Type","Lieu","Dist.","Paille","Blason","Compté","Score","Total fl.","Moy./fl.","Score moy."];
    const COL_W     = [22, 22, 28, 10, 12, 12, 12, 12, 12, 14, 16];
    const RIGHT_COLS = [4, 5, 6, 7, 8, 9, 10];

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
      pdf.text(`Mes séances — ${archer} — Saison ${filterSaison}`, 14, 9.5);
    };
    drawTitle();

    let startY = 18;

    grouped.forEach(([ym, group]) => {
      if (startY > ph - 30) {
        pdf.addPage();
        drawTitle();
        startY = 18;
      }

      const body = group.map(j => [
        fmtDate(j.date), j.type || "Mixte", j.lieu || "—", j.distance || "—",
        j.volumePaille || 0, j.volumeBlason || 0, j.volumeCompte || 0, j.score || "",
        j.total || "",
        j.moy != null ? j.moy.toFixed(2) : "",
        j.scoreMoy ?? "",
      ]);

      const { tp, tb, tc, ts, tt, tmoy, tscoreMoy } = buildMonthTotals(group);
      const totalRow = [
        `Total — ${fmtYM(ym)}`, "", "", "",
        tp, tb, tc, ts || "", tt || "",
        tmoy != null ? tmoy.toFixed(2) : "",
        tscoreMoy ?? "",
      ];

      autoTable(pdf, {
        head: [
          [{ content: fmtYM(ym).toUpperCase(), colSpan: NC, styles: {
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

    pdf.save(`mes-seances-${filterSaison.replace("/", "-")}.pdf`);
  };

  // ── Jauge ─────────────────────────────────────────────────────────────────

  const pct        = volEntr > 0 ? Math.min(100, Math.round(currentVolume / volEntr * 100)) : 0;
  const gaugeColor = pct >= 100 ? PRIMARY : pct >= 80 ? "#16a34a" : pct >= 50 ? "#f97316" : "#ef4444";

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>

      {/* En-tête */}
      <div className="ms-header">
        <h2 style={s.title}>Mes séances</h2>
        <div className="ms-controls">
          <FilterSelect label="Saison"   value={filterSaison} options={saisons}     onChange={setFilterSaison} className="ms-filter-select" />
          <FilterSelect label="Distance" value={filterDist}   options={DISTANCES}  onChange={setFilterDist}   className="ms-filter-select" />
          <FilterSelect label="Type"     value={filterType}   options={TYPES}      onChange={setFilterType}   className="ms-filter-select" />
          <FilterSelect label="Mois"     value={filterMois}   options={moisOptions} onChange={setFilterMois}   className="ms-filter-select" />
          <button
            style={{ ...s.exportBtn, ...(filtered.length === 0 ? { opacity: 0.4, cursor: "not-allowed" } : {}) }}
            onClick={handleExportExcel}
            disabled={filtered.length === 0}
            title="Exporter en Excel (.xlsx)"
          >
            ↓ Excel
          </button>
          <button
            style={{ ...s.exportBtn, ...(filtered.length === 0 ? { opacity: 0.4, cursor: "not-allowed" } : {}) }}
            onClick={handleExportPDF}
            disabled={filtered.length === 0}
            title="Exporter en PDF"
          >
            ↓ PDF
          </button>
        </div>
      </div>

      {/* Jauge volume mensuel */}
      <div className="ms-gauge-box">
        <div style={s.gaugeHeader}>
          <span style={s.gaugeLabel}>Volume entraînement ce mois</span>
          {volEntr > 0
            ? <span style={s.gaugeFigures}>
                {currentVolume} / {volEntr} flèches — <strong style={{ color: gaugeColor }}>{pct}%</strong>
              </span>
            : <span style={{ ...s.gaugeFigures, color: "var(--text-3)", fontStyle: "italic" }}>
                {currentVolume} flèche{currentVolume !== 1 ? "s" : ""} — objectif non défini par le coach
              </span>
          }
        </div>
        <div style={s.gaugeTrack}>
          {volEntr > 0 && <div style={{ ...s.gaugeBar, width: `${pct}%`, backgroundColor: gaugeColor }} />}
        </div>
      </div>

      <p style={s.aide}>
        Une ligne par jour, toutes séances confondues. Pour voir et modifier le détail d'une séance, direction l'onglet « Journal ».
      </p>

      {loading && <div style={s.info}>Chargement…</div>}
      {error   && <div style={s.errMsg}>{error}</div>}

      {!loading && !error && (
        <div style={s.tableWrap}>
          <table style={s.table} className="ms-table">
            <thead>
              <tr>
                <th style={s.th}>Date</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>Lieu</th>
                <th style={s.th}>Dist.</th>
                <th style={{ ...s.th, ...s.thR }}>Paille</th>
                <th style={{ ...s.th, ...s.thR }}>Blason</th>
                <th style={{ ...s.th, ...s.thR }}>Compté</th>
                <th style={{ ...s.th, ...s.thR }}>Score</th>
                <th style={{ ...s.th, ...s.thR }}>Total</th>
                <th style={{ ...s.th, ...s.thR }}>Moy./fl.</th>
                <th style={{ ...s.th, ...s.thR }}>Score moy.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} style={s.empty}>Aucune séance trouvée.</td>
                </tr>
              ) : (
                grouped.map(([ym, group]) => {
                  const { tp, tb, tc, ts, tt, tmoy, tscoreMoy } = buildMonthTotals(group);

                  return (
                    <Fragment key={ym}>
                      {group.map((jour) => {
                        const moyColor = jour.moy == null ? "var(--text-dim)" : (jour.type === "Compétition" ? BLUE : PRIMARY);
                        return (
                          <tr
                            key={jour.date}
                            style={s.tr}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--surface-raised)"; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; }}
                          >
                            <td style={s.td}>{fmtDate(jour.date)}</td>
                            <td style={s.td}>
                              {jour.type ? (
                                <span style={{ ...s.typeBadge, ...(jour.type === "Compétition" ? s.typeBadgeComp : {}) }}>
                                  {jour.type}
                                </span>
                              ) : <span style={s.mixteBadge}>Mixte</span>}
                              {jour.nb > 1 && <span style={s.protoBadge}>{jour.nb} entrées</span>}
                            </td>
                            <td style={{ ...s.td, color: "var(--text-muted)" }}>{jour.lieu || "—"}</td>
                            <td style={s.td}>{jour.distance ? <span style={s.distBadge}>{jour.distance}</span> : "—"}</td>
                            <td style={s.tdR}>{jour.volumePaille}</td>
                            <td style={s.tdR}>{jour.volumeBlason}</td>
                            <td style={s.tdR}>{jour.volumeCompte}</td>
                            <td style={{ ...s.tdR, fontWeight: "600" }}>{jour.score || "—"}</td>
                            <td style={s.tdR}>{jour.total || "—"}</td>
                            <td style={{ ...s.tdR, color: moyColor, fontWeight: "600" }}>
                              {jour.moy != null ? jour.moy.toFixed(2) : "—"}
                            </td>
                            <td style={{ ...s.tdR, fontWeight: "700", color: moyColor }}>
                              {jour.scoreMoy ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Ligne totaux mensuels */}
                      <tr style={s.trTotal}>
                        <td colSpan={4} style={s.tdMonthLabel}>{fmtYM(ym)}</td>
                        <td style={s.tdRTotal}>{tp}</td>
                        <td style={s.tdRTotal}>{tb}</td>
                        <td style={s.tdRTotal}>{tc}</td>
                        <td style={{ ...s.tdRTotal, fontWeight: "700" }}>{ts || "—"}</td>
                        <td style={s.tdRTotal}>{tt || "—"}</td>
                        <td style={{ ...s.tdRTotal, color: tmoy != null ? "var(--text)" : "var(--text-dim)" }}>
                          {tmoy != null ? tmoy.toFixed(2) : "—"}
                        </td>
                        <td style={{ ...s.tdRTotal, color: tscoreMoy != null ? "var(--text)" : "var(--text-dim)" }}>
                          {tscoreMoy ?? "—"}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && parJour.length > 0 && (
        <div style={s.count}>{parJour.length} jour{parJour.length > 1 ? "s" : ""} · {filtered.length} entrée{filtered.length > 1 ? "s" : ""}</div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  page:    { display: "flex", flexDirection: "column", gap: "16px" },
  header:  {},
  title:   { fontSize: "20px", fontWeight: "700", color: "var(--text)", margin: 0 },
  controls:{},

  filterLabel: {
    fontSize: "12px", fontWeight: "600", color: "var(--text-muted)",
    textTransform: "uppercase", letterSpacing: "0.06em",
  },
  filterSelect: {},
  exportBtn: {
    backgroundColor: "var(--border)", color: "var(--text)", border: "none",
    borderRadius: "7px", padding: "8px 14px", fontSize: "13px",
    fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
  },

  // jauge
  gaugeBox: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)",
    padding: "16px 20px", display: "flex", flexDirection: "column", gap: "10px",
  },
  gaugeHeader: { display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "6px 12px" },
  gaugeLabel:  { fontSize: "12px", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" },
  gaugeFigures:{ fontSize: "13px", color: "var(--text-3)" },
  gaugeTrack:  { height: "8px", borderRadius: "4px", backgroundColor: "var(--border)", overflow: "hidden" },
  gaugeBar:    { height: "100%", borderRadius: "4px", transition: "width 0.4s ease" },

  aide: { fontSize: "12px", color: "var(--text-dim)", fontStyle: "italic", margin: 0 },

  // tableau
  tableWrap: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)", overflowX: "auto",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th: {
    padding: "12px 12px", textAlign: "left",
    fontSize: "11px", fontWeight: "700", color: "var(--text-dim)",
    textTransform: "uppercase", letterSpacing: "0.07em",
    borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
    backgroundColor: "var(--surface-raised)",
  },
  thR:      { textAlign: "right" },
  tr:       { borderBottom: "1px solid var(--border)", transition: "background-color 0.1s" },
  td:       { padding: "10px 12px", color: "var(--text-2)", whiteSpace: "nowrap" },
  tdR:      { padding: "10px 12px", textAlign: "right", color: "var(--text-3)", whiteSpace: "nowrap" },

  // ligne totaux mensuels
  trTotal: {
    backgroundColor: "var(--surface-raised)",
    borderTop: "1px solid var(--border-3)",
    borderBottom: "1px solid var(--border-3)",
  },
  tdMonthLabel: {
    padding: "9px 12px", color: "var(--text-dim)",
    fontSize: "11px", fontWeight: "700", whiteSpace: "nowrap",
    textTransform: "uppercase", letterSpacing: "0.07em",
  },
  tdRTotal: {
    padding: "9px 12px", textAlign: "right",
    color: "var(--text-3)", whiteSpace: "nowrap",
    fontSize: "13px", fontWeight: "700",
  },

  distBadge: {
    backgroundColor: "var(--border)", borderRadius: "5px",
    padding: "2px 8px", fontSize: "12px", fontWeight: "600", color: "var(--text-3)",
  },
  typeBadge: {
    backgroundColor: "rgba(255,0,122,0.15)", color: PRIMARY,
    borderRadius: "5px", padding: "2px 8px", fontSize: "12px", fontWeight: "500",
  },
  typeBadgeComp: { backgroundColor: "rgba(59,130,246,0.15)", color: BLUE },
  mixteBadge: {
    backgroundColor: "var(--border)", color: "var(--text-muted)",
    borderRadius: "5px", padding: "2px 8px", fontSize: "12px", fontWeight: "500",
  },
  protoBadge: {
    marginLeft: "6px", backgroundColor: "var(--border)", color: "var(--text-muted)",
    borderRadius: "5px", padding: "2px 7px", fontSize: "11px", fontWeight: "600",
  },

  empty:  { padding: "40px", textAlign: "center", color: "var(--text-dim)", fontSize: "14px" },
  info:   { color: "var(--text-muted)", fontSize: "14px" },
  errMsg: {
    color: PRIMARY, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "rgba(255,0,122,0.1)", borderRadius: "8px", border: `1px solid ${PRIMARY}`,
  },
  count: { fontSize: "12px", color: "var(--text-dim)", textAlign: "right" },
};
