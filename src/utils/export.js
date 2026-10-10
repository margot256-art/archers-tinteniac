// Export Excel/PDF générique pour les tableaux "titre + colonnes + lignes + total",
// factorisé depuis StatsMensuelles.jsx / MesSeances.jsx / SeancesArchers.jsx /
// StatsCoach.jsx / Classement.jsx qui réimplémentaient chacun les mêmes styles.
import { chargerExport } from "./exportLibs";

const ROSE = "FF007A";
const ROSE_FONCE = "B30057";
const ROSE_CLAIR = "FFCCE5";

/**
 * @param {object} opts
 * @param {string} opts.titre
 * @param {string[]} opts.colonnes
 * @param {Array<Array<string|number>>} opts.lignes
 * @param {Array<string|number>} [opts.ligneTotal]
 * @param {string} opts.fichier - nom de fichier sans extension
 * @param {number[]} [opts.colonnesNumeriques] - indices alignés à droite
 * @param {Array<{wch:number}>} [opts.largeurs]
 */
export async function exporterExcel({ titre, colonnes, lignes, ligneTotal, fichier, colonnesNumeriques = [], largeurs }) {
  const { XLSX } = await chargerExport();
  const NC = colonnes.length;
  const aoa = [];
  const rowMeta = [];

  aoa.push([titre, ...Array(NC - 1).fill("")]);
  rowMeta.push({ type: "title" });
  aoa.push(Array(NC).fill(""));
  rowMeta.push({ type: "empty" });

  aoa.push([...colonnes]);
  rowMeta.push({ type: "header" });

  lignes.forEach((ligne, i) => {
    aoa.push(ligne);
    rowMeta.push({ type: "data", even: i % 2 === 0 });
  });

  if (ligneTotal) {
    aoa.push(ligneTotal);
    rowMeta.push({ type: "total" });
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: NC - 1 } }];
  if (largeurs) ws["!cols"] = largeurs;

  const align = (c) => ({ horizontal: colonnesNumeriques.includes(c) ? "right" : "left", vertical: "center" });
  const ST = {
    title: {
      font: { bold: true, sz: 13, color: { rgb: "FFFFFF" }, name: "Calibri" },
      fill: { patternType: "solid", fgColor: { rgb: ROSE_FONCE } },
      alignment: { horizontal: "left", vertical: "center" },
    },
    header: (c) => ({
      font: { bold: true, sz: 9, color: { rgb: "000000" }, name: "Calibri" },
      fill: { patternType: "solid", fgColor: { rgb: ROSE_CLAIR } },
      alignment: align(c),
      border: { bottom: { style: "medium", color: { rgb: ROSE } } },
    }),
    dataEven: (c) => ({
      font: { sz: 9, color: { rgb: "202020" }, name: "Calibri" },
      fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } },
      alignment: align(c),
    }),
    dataOdd: (c) => ({
      font: { sz: 9, color: { rgb: "202020" }, name: "Calibri" },
      fill: { patternType: "solid", fgColor: { rgb: "FFF0F6" } },
      alignment: align(c),
    }),
    total: (c) => ({
      font: { bold: true, sz: 9, color: { rgb: "FFFFFF" }, name: "Calibri" },
      fill: { patternType: "solid", fgColor: { rgb: ROSE } },
      alignment: align(c),
      border: { top: { style: "medium", color: { rgb: ROSE_FONCE } } },
    }),
  };

  const rowHeights = [];
  rowMeta.forEach((meta, r) => {
    if (meta.type === "empty") return;
    if (meta.type === "title") rowHeights[r] = { hpx: 28 };
    if (meta.type === "header") rowHeights[r] = { hpx: 18 };
    for (let c = 0; c < NC; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { v: "", t: "s" };
      ws[addr].s =
        meta.type === "title" ? ST.title :
        meta.type === "header" ? ST.header(c) :
        meta.type === "total" ? ST.total(c) :
        meta.even ? ST.dataEven(c) : ST.dataOdd(c);
    }
  });
  ws["!rows"] = rowHeights;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Export");
  XLSX.writeFile(wb, `${fichier}.xlsx`);
}

/**
 * @param {object} opts - mêmes champs que exporterExcel, plus :
 * @param {number[]} [opts.largeursColonnes] - largeur mm par colonne (0 = flexible)
 */
export async function exporterPDF({ titre, colonnes, lignes, ligneTotal, fichier, colonnesNumeriques = [], largeursColonnes }) {
  const { jsPDF, autoTable } = await chargerExport();
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pw = pdf.internal.pageSize.width;
  const ph = pdf.internal.pageSize.height;

  const colStyles = (largeursColonnes ?? []).reduce((acc, w, i) => {
    acc[i] = w > 0 ? { cellWidth: w } : {};
    if (colonnesNumeriques.includes(i)) acc[i].halign = "right";
    return acc;
  }, {});

  const drawTitle = () => {
    pdf.setFillColor(179, 0, 87);
    pdf.rect(0, 0, pw, 14, "F");
    pdf.setFontSize(11);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.text(titre, 14, 9.5);
  };
  drawTitle();

  const body = ligneTotal ? [...lignes, ligneTotal] : lignes;

  autoTable(pdf, {
    head: [colonnes],
    body,
    startY: 18,
    margin: { left: 14, right: 14, top: 18 },
    styles: { fontSize: 7.5, cellPadding: 2, font: "helvetica" },
    headStyles: { fillColor: [255, 204, 229], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8 },
    bodyStyles: { textColor: [32, 32, 32], fillColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [255, 240, 246] },
    columnStyles: colStyles,
    didParseCell: ({ row, cell, section }) => {
      if (ligneTotal && section === "body" && row.index === lignes.length) {
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

  pdf.save(`${fichier}.pdf`);
}
