import { useState, useMemo, Fragment } from "react";
import { useAllSeances } from "../../hooks/useAllSeances";
import { useAuth } from "../../hooks/useAuth";
import { chargerExport } from "../../utils/exportLibs";
import { PRIMARY, BLUE, getCompte, getSaison, CURRENT_SAISON, fmtDateCourte, fmtYM, buildMonthTotals, parOrdreDeTir, libelleSaison } from "../../utils/seances";
import { regrouperParJour, statsTir, somme, aCommenter, debutACommenter, JOURS_A_COMMENTER } from "../../utils/journalCoach";
import FilterSelect from "../shared/FilterSelect";
import DetailJour from "./DetailJour";
import * as ui from "../archer/styleArcher";

const fmtMoyenne = (st) => (st.moyenne != null ? st.moyenne.toFixed(2) : "");
const fmtRamene  = (st) => (st.ramene != null ? st.ramene : "");
const sansAccents = (txt) => txt.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const DISTANCES = ["Toutes", "5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const TYPES     = ["Tous", "Entraînement", "Compétition"];
// Vues du journal : toutes les séances, celles que l'archer a commentées, celles
// qui attendent un retour du coach.
const VUES = [
  { id: "toutes",     label: "Toutes" },
  { id: "commentees", label: "Commentées par l'archer" },
  { id: "aCommenter", label: "À commenter" },
];

// ── Composant principal ───────────────────────────────────────────────────────

/** initial : { archer?, filtre?, ouvrir? } quand le Journal est ouvert depuis le tableau de bord. */
export default function CoachJournal({ initial }) {
  const { seances, loading, error, updateRetourCoach } = useAllSeances();
  const { user } = useAuth();
  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);
  const [filterArcher, setFilterArcher] = useState(initial?.archer ?? "Tous");
  const [filterType,   setFilterType]   = useState("Tous");
  const [filterDist,   setFilterDist]   = useState("Toutes");
  const [vue,          setVue]          = useState(initial?.filtre ?? "toutes");
  const [recherche,    setRecherche]    = useState("");
  const [ouverte,      setOuverte]      = useState(initial?.ouvrir ?? null); // id de la ligne (jour + archer) ouverte en détail

  const saisons = useMemo(() => {
    const set = new Set(seances.filter(s => s.date).map(s => getSaison(s.date)));
    set.add(CURRENT_SAISON);
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [seances]);

  const saisonSeances = useMemo(() =>
    seances.filter(s => s.date && getSaison(s.date) === filterSaison),
    [seances, filterSaison]
  );

  const archerOptions = useMemo(() => {
    const names = new Set(saisonSeances.map(s => s.archer).filter(Boolean));
    if (filterArcher !== "Tous") names.add(filterArcher);
    return ["Tous", ...[...names].sort()];
  }, [saisonSeances, filterArcher]);

  const filtered = useMemo(() =>
    saisonSeances.filter(s => {
      const okA = filterArcher === "Tous"   || s.archer   === filterArcher;
      const okT = filterType   === "Tous"   || s.type     === filterType;
      const okD = filterDist   === "Toutes" || s.distance === filterDist;
      return okA && okT && okD;
    }),
    [saisonSeances, filterArcher, filterType, filterDist]
  );

  const lignes = useMemo(() => {
    const cherche = sansAccents(recherche.trim());
    return regrouperParJour(filtered).filter((l) => {
      if (vue === "commentees" && !l.commentaire) return false;
      if (vue === "aCommenter" && !aCommenter(l, user?.id)) return false;
      if (cherche && !sansAccents(`${l.commentaire}\n${l.retourCoach}`).includes(cherche)) return false;
      return true;
    });
  }, [filtered, vue, recherche, user?.id]);
  const nbJoursSaison = useMemo(() => regrouperParJour(saisonSeances).length, [saisonSeances]);

  const groupedByMonth = useMemo(() => {
    const map = {};
    for (const s of lignes) {
      if (!s.date) continue;
      const month = s.date.slice(0, 7);
      if (!map[month]) map[month] = [];
      map[month].push(s);
    }
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, rows]) => ({
        month,
        rows: rows.sort((a, b) =>
          b.date.localeCompare(a.date)
          || (a.archer ?? "").localeCompare(b.archer ?? "")
          || parOrdreDeTir(a.docs[0], b.docs[0])),
      }));
  }, [lignes]);

  // ── Export helpers ────────────────────────────────────────────────────────

  const COL_HEADS  = ["Date", "Archer", "Type", "Dist.", "Paille", "Blason", "Compté", "Total", "Moy.", "Score moy.", "Commentaire"];
  const NC         = 11;
  const RIGHT_COLS = [4, 5, 6, 7, 8, 9];
  const WRAP_COLS  = [0, 10];

  const exportTitle = filterArcher !== "Tous"
    ? `Journal — ${filterArcher} — Saison ${libelleSaison(filterSaison)}`
    : `Journal — Saison ${libelleSaison(filterSaison)}`;

  const rowCells = (l) => [
    [l.date, l.lieu].filter(Boolean).join("\n"), l.archer || "", l.type || "", l.distance || "",
    l.paille, l.blason, l.compte, l.paille + l.blason + l.compte,
    fmtMoyenne(l.tir), fmtRamene(l.tir),
    [l.commentaire, l.retourCoach && `Coach – ${l.retourCoach}`].filter(Boolean).join("\n"),
  ];

  // Les totaux mensuels se calculent sur les exercices, pas sur les lignes regroupées.
  const docsDe = (group) => group.flatMap((l) => l.docs);
  const ligneTotal = (month, group) => {
    const docs = docsDe(group);
    const { tp, tb, tt } = buildMonthTotals(docs);
    const st = statsTir(docs);
    return [
      `Total — ${fmtYM(month)}`, "", "", "",
      tp, tb, somme(docs, getCompte), tt, fmtMoyenne(st), fmtRamene(st), "",
    ];
  };

  const handleExportExcel = async () => {
    const { XLSX } = await chargerExport();
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
      aoa.push([fmtYM(month), ...Array(NC - 1).fill("")]);
      merges.push({ s: { r: mR, c: 0 }, e: { r: mR, c: NC - 1 } });
      rowMeta.push({ type: "month" });

      aoa.push([...COL_HEADS]);
      rowMeta.push({ type: "header" });

      group.forEach((s, i) => {
        aoa.push(rowCells(s));
        rowMeta.push({ type: "data", even: i % 2 === 0 });
      });

      aoa.push(ligneTotal(month, group));
      rowMeta.push({ type: "total" });
      aoa.push(Array(NC).fill(""));
      rowMeta.push({ type: "empty" });
    });

    const ws      = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = merges;
    ws["!cols"]   = [
      { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 7 },
      { wch: 8  }, { wch: 8  }, { wch: 8  }, { wch: 8  }, { wch: 7 }, { wch: 11 }, { wch: 44 },
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
        alignment: { horizontal: RIGHT_COLS.includes(c) ? "right" : "left", vertical: "center", wrapText: WRAP_COLS.includes(c) },
        border: { bottom: { style: "medium", color: { rgb: "FF007A" } } },
      }),
      dataEven: (c) => ({
        font: { sz: 9, color: { rgb: "202020" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } },
        alignment: { horizontal: RIGHT_COLS.includes(c) ? "right" : "left", vertical: "center", wrapText: WRAP_COLS.includes(c) },
      }),
      dataOdd: (c) => ({
        font: { sz: 9, color: { rgb: "202020" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "FFF0F6" } },
        alignment: { horizontal: RIGHT_COLS.includes(c) ? "right" : "left", vertical: "center", wrapText: WRAP_COLS.includes(c) },
      }),
      total: (c) => ({
        font: { bold: true, sz: 9, color: { rgb: "FFFFFF" }, name: "Calibri" },
        fill: { patternType: "solid", fgColor: { rgb: "FF007A" } },
        alignment: { horizontal: RIGHT_COLS.includes(c) ? "right" : "left", vertical: "center", wrapText: WRAP_COLS.includes(c) },
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
    XLSX.utils.book_append_sheet(wb, ws, "Journal");
    XLSX.writeFile(wb, `journal-coach-saison-${libelleSaison(filterSaison)}.xlsx`);
  };

  const handleExportPDF = async () => {
    const { jsPDF, autoTable } = await chargerExport();
    const pdf   = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw    = pdf.internal.pageSize.width;
    const ph    = pdf.internal.pageSize.height;
    const COL_W = [26, 26, 20, 10, 12, 12, 12, 12, 11, 17, 0];

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

      const body = group.map(rowCells);

      const totalRow = ligneTotal(month, group);

      autoTable(pdf, {
        head: [
          [{ content: fmtYM(month).toUpperCase(), colSpan: NC, styles: {
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

    pdf.save(`journal-coach-saison-${libelleSaison(filterSaison)}.pdf`);
  };

  if (loading) return <div style={ui.info}>Chargement…</div>;
  if (error)   return <div style={ui.erreur}>{error}</div>;

  // Cherchée dans toutes les séances (pas seulement celles de la saison ou des
  // filtres), pour que le détail reste ouvert même si un filtre change entre-temps.
  const ligneOuverte = ouverte && regrouperParJour(seances.filter((s) => ouverte.startsWith(`${s.date}|`) || ouverte === `comp|${s.id}`))
    .find((l) => l.id === ouverte);
  if (ligneOuverte) {
    // Enchaîner les retours : la séance suivante qui attend un retour, s'il y en a une.
    const debut = debutACommenter();
    const suivante = regrouperParJour(seances.filter((s) => s.date >= debut))
      .filter((l) => l.id !== ligneOuverte.id && aCommenter(l, user?.id))
      .sort((a, b) => b.date.localeCompare(a.date) || (a.archer ?? "").localeCompare(b.archer ?? ""))[0];
    return (
      <DetailJour
        key={ligneOuverte.id}
        ligne={ligneOuverte}
        onRetour={() => setOuverte(null)}
        onEnregistrerRetour={(texte) => updateRetourCoach(ligneOuverte.docs.map((d) => d.id), texte)}
        onSuivante={suivante ? () => { setOuverte(suivante.id); window.scrollTo(0, 0); } : null}
      />
    );
  }

  return (
    <div style={ui.pageLarge}>

      {/* ── Filtres + Export ── */}
      <div style={ui.barre}>
        <div style={ui.filtres}>
          <FilterSelect label="Saison"   value={filterSaison} options={saisons} libelle={libelleSaison}
            onChange={(v) => { setFilterSaison(v); setFilterArcher("Tous"); }} />
          <FilterSelect label="Archer"   value={filterArcher} options={archerOptions} onChange={setFilterArcher} />
          <FilterSelect label="Type"     value={filterType}   options={TYPES}         onChange={setFilterType} />
          <FilterSelect label="Distance" value={filterDist}   options={DISTANCES}     onChange={setFilterDist} />
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            style={{ ...ui.boutonSecondaire, ...(filtered.length === 0 ? s.off : {}) }}
            onClick={handleExportExcel}
            disabled={filtered.length === 0}
            title="Exporter en Excel (.xlsx)"
          >↓ Excel</button>
          <button
            style={{ ...ui.boutonSecondaire, ...(filtered.length === 0 ? s.off : {}) }}
            onClick={handleExportPDF}
            disabled={filtered.length === 0}
            title="Exporter en PDF"
          >↓ PDF</button>
        </div>
      </div>

      <div style={ui.filtres}>
        <div style={ui.bascule} role="group" aria-label="Séances affichées">
          {VUES.map((v) => (
            <button key={v.id} type="button" aria-pressed={vue === v.id}
              style={{ ...ui.basculeBtn, ...(vue === v.id ? ui.basculeBtnActif : {}) }}
              onClick={() => setVue(v.id)}
            >{v.label}</button>
          ))}
        </div>
        <input
          type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher dans les commentaires…" style={s.searchInput}
        />
      </div>
      {vue === "aCommenter" && (
        <p style={ui.sousTitre}>
          Séances des {JOURS_A_COMMENTER} derniers jours sans retour du coach (les vôtres n'y sont pas).
        </p>
      )}

      {/* ── Tableau ── */}
      <div style={ui.tableauCadre}>
        <table style={ui.tableau}>
          <thead>
            <tr>
              <th style={ui.th}>Date</th>
              <th style={ui.th}>Archer</th>
              <th style={ui.th}>Type</th>
              <th style={ui.th}>Dist.</th>
              <th style={ui.thNum}>Paille</th>
              <th style={ui.thNum}>Blason</th>
              <th style={ui.thNum}>Compté</th>
              <th style={ui.thNum}>Total</th>
              <th style={ui.thNum}>Moy.</th>
              <th style={ui.thNum}>Score moy.</th>
              <th style={ui.th}>Commentaire</th>
            </tr>
          </thead>
          <tbody>
            {groupedByMonth.length === 0 ? (
              <tr><td colSpan={NC} style={s.empty}>
                {vue === "aCommenter" ? "Rien à commenter : toutes les séances récentes ont un retour." : "Aucune séance trouvée."}
              </td></tr>
            ) : groupedByMonth.map(({ month, rows }) => {
              const subP   = somme(rows, (l) => l.paille);
              const subB   = somme(rows, (l) => l.blason);
              const subC   = somme(rows, (l) => l.compte);
              const subTot = subP + subB + subC;
              const subTir = statsTir(rows.flatMap((l) => l.docs));
              return (
                <Fragment key={month}>
                  {rows.map(ligne => (
                    <tr key={ligne.id} style={s.tr} onClick={() => setOuverte(ligne.id)} title="Voir le détail"
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--surface-raised)"}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}
                    >
                      <td style={ui.td}>
                        {fmtDateCourte(ligne.date)}
                        {ligne.lieu && <div style={s.lieu}>{ligne.lieu}</div>}
                      </td>
                      <td style={{ ...ui.td, fontWeight: "600", color: "var(--text)" }}>{ligne.archer || "—"}</td>
                      <td style={ui.td}>
                        <span style={s.type}>
                          <span style={ui.point(ligne.type === "Compétition" ? BLUE : PRIMARY)} />
                          {ligne.type || "—"}
                        </span>
                      </td>
                      <td style={ui.td}>{ligne.distance || "—"}</td>
                      <td style={ui.tdNum}>{ligne.paille > 0 ? ligne.paille : "—"}</td>
                      <td style={ui.tdNum}>{ligne.blason > 0 ? ligne.blason : "—"}</td>
                      <td style={ui.tdNum}>{ligne.compte > 0 ? ligne.compte : "—"}</td>
                      <td style={{ ...ui.tdNum, fontWeight: "700", color: "var(--text)" }}>{ligne.paille + ligne.blason + ligne.compte || "—"}</td>
                      <td style={ui.tdNum}>{fmtMoyenne(ligne.tir) || "—"}</td>
                      <td style={{ ...ui.tdNum, fontWeight: "700", color: ligne.tir.ramene != null ? (ligne.type === "Compétition" ? BLUE : PRIMARY) : "var(--text-dim)" }}>
                        {fmtRamene(ligne.tir) || "—"}
                      </td>
                      <td style={s.tdComment}>
                        {ligne.commentaire || (ligne.retourCoach ? "" : "—")}
                        {ligne.retourCoach && (
                          <div style={s.retourCoach}>Coach – {ligne.retourCoach}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr key={`sub-${month}`} style={s.trSub}>
                    <td style={s.tdSub}>{fmtYM(month)}</td>
                    <td style={s.tdSub}>{rows.length} séance{rows.length > 1 ? "s" : ""}</td>
                    <td style={s.tdSub} /><td style={s.tdSub} />
                    <td style={s.tdSubNum}>{subP > 0 ? subP : "—"}</td>
                    <td style={s.tdSubNum}>{subB > 0 ? subB : "—"}</td>
                    <td style={s.tdSubNum}>{subC > 0 ? subC : "—"}</td>
                    <td style={s.tdSubNum}>{subTot > 0 ? subTot : "—"}</td>
                    <td style={s.tdSubNum}>{fmtMoyenne(subTir) || "—"}</td>
                    <td style={s.tdSubNum}>{fmtRamene(subTir) || "—"}</td>
                    <td style={s.tdSub} />
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {lignes.length > 0 && (
        <div style={s.count}>
          {lignes.length} séance{lignes.length > 1 ? "s" : ""}
          {lignes.length !== nbJoursSaison && ` (sur ${nbJoursSaison} cette saison)`}
        </div>
      )}

    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  off: { opacity: 0.4, cursor: "not-allowed" },

  searchInput: {
    padding: "8px 12px", border: "1.5px solid var(--border-2)", borderRadius: "8px",
    fontSize: "13px", color: "var(--text-2)", outline: "none", minWidth: "240px",
    fontFamily: "inherit", backgroundColor: "var(--input-bg)",
  },

  tr:   { transition: "background-color 0.1s", cursor: "pointer" },
  type: { display: "inline-flex", alignItems: "center", gap: "6px" },
  lieu: { fontSize: "12px", color: "var(--text-dim)", marginTop: "2px" },
  tdComment: {
    ...ui.td, color: "var(--text-muted)", minWidth: "180px", maxWidth: "420px",
    whiteSpace: "pre-line", wordBreak: "break-word", lineHeight: "1.4",
  },
  retourCoach: { marginTop: "4px", color: PRIMARY, fontWeight: "600" },

  trSub:    { backgroundColor: "var(--surface-raised)" },
  tdSub:    { ...ui.td, color: "var(--text-muted)", fontSize: "12px", fontWeight: "600" },
  tdSubNum: { ...ui.tdNum, color: "var(--text-muted)", fontSize: "12px", fontWeight: "600" },

  empty: { padding: "40px", textAlign: "center", color: "var(--text-dim)", fontSize: "14px" },
  count: { fontSize: "12px", color: "var(--text-dim)", textAlign: "right" },
};
