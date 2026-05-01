import { Fragment, useState, useMemo, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../hooks/useAuth";
import { useSeances } from "../../hooks/useSeances";
import XLSX from "xlsx-js-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PRIMARY   = "#FF007A";
const BLUE      = "#3b82f6";
const DISTANCES = ["Toutes", "5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const DIST_OPTS = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const TYPES     = ["Tous", "Entraînement", "Compétition"];
const MOIS      = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

const normFactor = (dist) => (dist === "5m" || dist === "18m") ? 60 : 72;

const getPaille = s => s.paille  ?? s.volumePaille  ?? 0;
const getBlason = s => s.blason  ?? s.volumeBlason  ?? 0;
const getCompte = s => s.compte  ?? s.volumeCompte  ?? 0;

const fmtYM = (ym) => {
  if (!ym || ym === "0000-00") return "Date inconnue";
  const [y, m] = ym.split("-");
  return `${MOIS[parseInt(m) - 1]} ${y}`;
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

const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const todayYM = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// ── Composant principal ───────────────────────────────────────────────────────

export default function MesSeances() {
  const { user }   = useAuth();
  const { seances, loading, error, deleteSeance, updateSeance } = useSeances();

  const [filterDist,   setFilterDist]   = useState("Toutes");
  const [filterType,   setFilterType]   = useState("Tous");
  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);
  const [confirmId,  setConfirmId]  = useState(null);
  const [editId,     setEditId]     = useState(null);
  const [editData,   setEditData]   = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [volEntr,    setVolEntr]    = useState(null);

  useEffect(() => {
    if (!user) return;
    const archerId = user.id ?? `${user.prenom.toLowerCase()}_${user.nom.toLowerCase()}`;
    const unsub = onSnapshot(doc(db, "objectifs", archerId), (snap) => {
      setVolEntr(snap.exists() ? (snap.data().volEntr || 0) : null);
    });
    return () => unsub();
  }, [user]);

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

  const filtered = useMemo(() =>
    seances.filter(s => {
      const okSaison = filterSaison === "Toutes" || (s.date && getSaison(s.date) === filterSaison);
      const okDist   = filterDist   === "Toutes" || s.distance === filterDist;
      const okType   = filterType   === "Tous"   || s.type     === filterType;
      return okSaison && okDist && okType;
    }),
    [seances, filterSaison, filterDist, filterType]
  );

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach(s => {
      const ym = s.date ? s.date.slice(0, 7) : "0000-00";
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym).push(s);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  // ── Édition ───────────────────────────────────────────────────────────────

  const startEdit = (seance) => {
    setEditId(seance.id);
    setEditData({
      date:         seance.date         || "",
      distance:     seance.distance     || "18m",
      type:         seance.type         || "Entraînement",
      lieu:         seance.lieu         || "",
      volumePaille: String(getPaille(seance)),
      volumeBlason: String(getBlason(seance)),
      volumeCompte: String(getCompte(seance)),
      score:        String(seance.score ?? ""),
      commentaire:  seance.commentaire  || "",
    });
    setConfirmId(null);
  };

  const cancelEdit = () => { setEditId(null); setEditData(null); };

  const setEditField = (field) => (e) =>
    setEditData(prev => ({ ...prev, [field]: e.target.value }));

  const saveEdit = async () => {
    setEditSaving(true);
    try {
      const p  = parseInt(editData.volumePaille) || 0;
      const b  = parseInt(editData.volumeBlason)  || 0;
      const c  = parseInt(editData.volumeCompte)  || 0;
      const sc = parseInt(editData.score)          || 0;
      await updateSeance(editId, {
        date:         editData.date,
        distance:     editData.distance,
        type:         editData.type,
        lieu:         editData.lieu.trim() || null,
        paille:       p,
        blason:       b,
        compte:       c,
        volumePaille: p,
        volumeBlason: b,
        volumeCompte: c,
        score:        sc,
        totalFleches: p + b + c,
        moyenne:      c > 0 ? parseFloat((sc / c).toFixed(2)) : null,
        saison:       editData.date ? getSaison(editData.date) : undefined,
        commentaire:  editData.commentaire.trim() || null,
      });
      cancelEdit();
    } catch (err) {
      console.error("[MesSeances] erreur modification :", err);
    } finally {
      setEditSaving(false);
    }
  };

  // ── Suppression ───────────────────────────────────────────────────────────

  const handleDelete = async (id) => {
    await deleteSeance(id);
    setConfirmId(null);
    if (editId === id) cancelEdit();
  };

  // ── Helpers export ────────────────────────────────────────────────────────

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

  // ── Export Excel ──────────────────────────────────────────────────────────

  const handleExportExcel = () => {
    const COLS    = ["Date","Type","Lieu","Dist.","Paille","Blason","Compté","Score","Total fl.","Moy./fl.","Score moy.","Commentaire"];
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

      // Lignes données
      group.forEach((s, i) => {
        const p = getPaille(s); const b = getBlason(s); const c = getCompte(s);
        const moy = c > 0 && (s.score ?? 0) > 0 ? s.score / c : null;
        aoa.push([
          s.date || "", s.type || "", s.lieu || "", s.distance || "",
          p, b, c, s.score ?? "", p + b + c,
          moy != null ? parseFloat(moy.toFixed(2)) : "",
          moy != null ? Math.round(moy * normFactor(s.distance)) : "",
          s.commentaire || "",
        ]);
        rowMeta.push({ type: "data", even: i % 2 === 0 });
      });

      // Ligne total
      const { tp, tb, tc, ts, tt, tmoy, tscoreMoy } = buildMonthTotals(group);
      aoa.push([
        `Total — ${fmtYM(ym)}`, "", "", "",
        tp, tb, tc, ts || "", tt || "",
        tmoy != null ? parseFloat(tmoy.toFixed(2)) : "",
        tscoreMoy ?? "", "",
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
      { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 34 },
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
    const NC     = 12;
    const COL_HEADS = ["Date","Type","Lieu","Dist.","Paille","Blason","Compté","Score","Total fl.","Moy./fl.","Score moy.","Commentaire"];
    const COL_W     = [22, 22, 28, 10, 12, 12, 12, 12, 12, 14, 16, 0];
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

      const body = group.map(s => {
        const p = getPaille(s); const b = getBlason(s); const c = getCompte(s);
        const moy = c > 0 && (s.score ?? 0) > 0 ? s.score / c : null;
        return [
          fmtDate(s.date), s.type || "", s.lieu || "", s.distance || "",
          p || 0, b || 0, c || 0, s.score ?? "",
          p + b + c || "",
          moy != null ? moy.toFixed(2) : "",
          moy != null ? Math.round(moy * normFactor(s.distance)) : "",
          s.commentaire || "",
        ];
      });

      const { tp, tb, tc, ts, tt, tmoy, tscoreMoy } = buildMonthTotals(group);
      const totalRow = [
        `Total — ${fmtYM(ym)}`, "", "", "",
        tp, tb, tc, ts || "", tt || "",
        tmoy != null ? tmoy.toFixed(2) : "",
        tscoreMoy ?? "", "",
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
          <FilterSelect label="Saison"   value={filterSaison} options={saisons}    onChange={setFilterSaison} />
          <FilterSelect label="Distance" value={filterDist}   options={DISTANCES} onChange={setFilterDist} />
          <FilterSelect label="Type"     value={filterType}   options={TYPES}     onChange={setFilterType} />
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

      {/* Formulaire d'édition */}
      {editId && editData && (
        <div style={s.editCard} className="edit-form">
          <div style={s.editHeader}>
            <span style={s.editTitle}>Modifier la séance</span>
            <button style={s.editClose} onClick={cancelEdit}>✕</button>
          </div>
          <div className="edit-grid-4">
            <EditField label="Date">
              <input type="date" value={editData.date}
                onChange={setEditField("date")} style={s.editInput} />
            </EditField>
            <EditField label="Distance">
              <select value={editData.distance}
                onChange={setEditField("distance")} style={s.editInput}>
                {DIST_OPTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </EditField>
            <EditField label="Type">
              <select value={editData.type}
                onChange={setEditField("type")} style={s.editInput}>
                <option>Entraînement</option>
                <option>Compétition</option>
              </select>
            </EditField>
            <EditField label="Lieu">
              <input type="text" value={editData.lieu}
                onChange={setEditField("lieu")} style={s.editInput} placeholder="—" />
            </EditField>
            <EditField label="Vol. paille">
              <input type="number" min="0" value={editData.volumePaille}
                onChange={setEditField("volumePaille")} style={s.editInput} />
            </EditField>
            <EditField label="Vol. blason">
              <input type="number" min="0" value={editData.volumeBlason}
                onChange={setEditField("volumeBlason")} style={s.editInput} />
            </EditField>
            <EditField label="Vol. compté">
              <input type="number" min="0" value={editData.volumeCompte}
                onChange={setEditField("volumeCompte")} style={s.editInput} />
            </EditField>
            <EditField label="Score">
              <input type="number" min="0" value={editData.score}
                onChange={setEditField("score")} style={s.editInput} />
            </EditField>
            <EditField label="Commentaire" wide>
              <input type="text" value={editData.commentaire}
                onChange={setEditField("commentaire")} style={s.editInput} placeholder="—" />
            </EditField>
          </div>
          <div style={s.editFooter}>
            <button style={s.cancelBtn} onClick={cancelEdit}>Annuler</button>
            <button
              style={{ ...s.saveBtn, ...(editSaving ? { opacity: 0.6, cursor: "not-allowed" } : {}) }}
              onClick={saveEdit}
              disabled={editSaving}
            >
              {editSaving ? "Enregistrement…" : "Sauvegarder"}
            </button>
          </div>
        </div>
      )}

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
                <th style={s.th}>Commentaire</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={13} style={s.empty}>Aucune séance trouvée.</td>
                </tr>
              ) : (
                grouped.map(([ym, group]) => {
                  const tp = group.reduce((n, x) => n + getPaille(x), 0);
                  const tb = group.reduce((n, x) => n + getBlason(x), 0);
                  const tt = tp + tb + group.reduce((n, x) => n + getCompte(x), 0);
                  // totaux : seulement les séances avec compte ET score > 0
                  const scored = group.filter(x => getCompte(x) > 0 && (x.score ?? 0) > 0);
                  const tc = scored.reduce((n, x) => n + getCompte(x), 0);
                  const ts = scored.reduce((n, x) => n + x.score, 0);
                  const tmoy = tc > 0 ? ts / tc : null;
                  const distinctDist = [...new Set(scored.map(x => x.distance))];
                  const tscoreMoy = tmoy != null && distinctDist.length === 1
                    ? Math.round(tmoy * normFactor(distinctDist[0]))
                    : null;
                  return (
                    <Fragment key={ym}>
                      {group.map((seance) => {
                        const p = getPaille(seance);
                        const b = getBlason(seance);
                        const c = getCompte(seance);
                        const total = p + b + c;
                        const moy = c > 0 && (seance.score ?? 0) > 0 ? seance.score / c : null;
                        const scoreMoy = moy != null ? Math.round(moy * normFactor(seance.distance)) : null;
                        const typeColor = seance.type === "Compétition" ? BLUE : PRIMARY;
                        const moyColor  = moy == null ? "var(--text-dim)" : typeColor;
                        const isEditing = editId === seance.id;
                        const isConfirm = confirmId === seance.id;
                        return (
                          <tr
                            key={seance.id}
                            style={{ ...s.tr, ...(isEditing ? { backgroundColor: "rgba(255,0,122,0.07)" } : {}) }}
                            onMouseEnter={e => { if (!isEditing) e.currentTarget.style.backgroundColor = "var(--surface-raised)"; }}
                            onMouseLeave={e => { if (!isEditing) e.currentTarget.style.backgroundColor = ""; }}
                          >
                            <td style={s.td}>{fmtDate(seance.date)}</td>
                            <td style={s.td}>
                              <span style={{ ...s.typeBadge, ...(seance.type === "Compétition" ? s.typeBadgeComp : {}) }}>
                                {seance.type}
                              </span>
                            </td>
                            <td style={{ ...s.td, color: "var(--text-muted)" }}>{seance.lieu || "—"}</td>
                            <td style={s.td}><span style={s.distBadge}>{seance.distance}</span></td>
                            <td style={s.tdR}>{p}</td>
                            <td style={s.tdR}>{b}</td>
                            <td style={s.tdR}>{c}</td>
                            <td style={{ ...s.tdR, fontWeight: "600" }}>{seance.score ?? "—"}</td>
                            <td style={s.tdR}>{total || "—"}</td>
                            <td style={{ ...s.tdR, color: moyColor, fontWeight: "600" }}>
                              {moy != null ? moy.toFixed(2) : "—"}
                            </td>
                            <td style={{ ...s.tdR, fontWeight: "700", color: moyColor }}>
                              {scoreMoy ?? "—"}
                            </td>
                            <td style={{ ...s.td, color: "var(--text-muted)", whiteSpace: "normal", minWidth: "120px", maxWidth: "280px", wordBreak: "break-word" }}>
                              {seance.commentaire || "—"}
                            </td>
                            <td style={s.tdAction}>
                              {isConfirm ? (
                                <div style={s.confirmRow}>
                                  <button style={s.btnOui} onClick={() => handleDelete(seance.id)}>Oui</button>
                                  <button style={s.btnNon} onClick={() => setConfirmId(null)}>Non</button>
                                </div>
                              ) : (
                                <div style={{ display: "flex", gap: "2px", justifyContent: "flex-end" }}>
                                  <button
                                    style={{ ...s.iconBtn, color: isEditing ? PRIMARY : "var(--text-3)" }}
                                    title="Modifier"
                                    onClick={() => isEditing ? cancelEdit() : startEdit(seance)}
                                  >
                                    <PencilIcon />
                                  </button>
                                  <button
                                    style={{ ...s.iconBtn, fontSize: "15px" }}
                                    title="Supprimer"
                                    onClick={() => { setConfirmId(seance.id); cancelEdit(); }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              )}
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
                        <td colSpan={2} style={s.tdMonthLabel}></td>
                      </tr>
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={s.count}>{filtered.length} séance{filtered.length > 1 ? "s" : ""}</div>
      )}
    </div>
  );
}

// ── Sous-composants ───────────────────────────────────────────────────────────

function FilterSelect({ label, value, options, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={s.filterLabel}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="ms-filter-select">
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function EditField({ label, children, wide }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: "5px",
      ...(wide ? { gridColumn: "span 2" } : {}),
    }}>
      <label className="edit-label-cls" style={s.editLabel}>{label}</label>
      {children}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
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

  // formulaire d'édition
  editCard: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)",
    padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px",
    borderTop: `3px solid ${PRIMARY}`,
  },
  editHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  editTitle:  { fontSize: "14px", fontWeight: "700", color: "var(--text)" },
  editClose:  {
    background: "none", border: "none", cursor: "pointer",
    color: "var(--text-dim)", fontSize: "16px", padding: "2px 6px",
    borderRadius: "4px", fontFamily: "inherit",
  },
  editGrid:  {},
  editLabel: {
    fontSize: "11px", fontWeight: "600", color: "var(--text-muted)",
    textTransform: "uppercase", letterSpacing: "0.07em",
  },
  editInput: {
    padding: "8px 10px", border: "var(--border-2)", borderRadius: "7px",
    fontSize: "13px", color: "var(--text)", fontFamily: "inherit",
    outline: "none", backgroundColor: "var(--input-bg)",
    width: "100%", boxSizing: "border-box",
  },
  editFooter: { display: "flex", justifyContent: "flex-end", gap: "10px" },
  cancelBtn:  {
    background: "none", border: "var(--border-strong)", borderRadius: "7px",
    padding: "8px 16px", fontSize: "13px", color: "var(--text-muted)",
    cursor: "pointer", fontFamily: "inherit",
  },
  saveBtn: {
    backgroundColor: PRIMARY, color: "#fff", border: "none",
    borderRadius: "7px", padding: "8px 20px", fontSize: "13px",
    fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
  },

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
    borderBottom: "var(--border)", whiteSpace: "nowrap",
    backgroundColor: "var(--surface-raised)",
  },
  thR:      { textAlign: "right" },
  tr:       { borderBottom: "1px solid #1e1e1e", transition: "background-color 0.1s" },
  td:       { padding: "10px 12px", color: "var(--text-2)", whiteSpace: "nowrap" },
  tdR:      { padding: "10px 12px", textAlign: "right", color: "var(--text-3)", whiteSpace: "nowrap" },
  tdAction: { padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" },

  // ligne totaux mensuels
  trTotal: {
    backgroundColor: "var(--surface-raised)",
    borderTop: "var(--border-3)",
    borderBottom: "var(--border-3)",
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

  iconBtn: {
    background: "none", border: "none", cursor: "pointer",
    color: "var(--text-dim)", padding: "4px 5px", borderRadius: "4px",
    display: "inline-flex", alignItems: "center",
    transition: "color 0.15s", fontFamily: "inherit",
  },
  confirmRow: { display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" },
  btnOui: {
    backgroundColor: PRIMARY, color: "#fff", border: "none",
    borderRadius: "5px", padding: "4px 10px", fontSize: "12px",
    fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
  },
  btnNon: {
    backgroundColor: "var(--border)", color: "var(--text-muted)", border: "none",
    borderRadius: "5px", padding: "4px 10px", fontSize: "12px",
    cursor: "pointer", fontFamily: "inherit",
  },

  empty:  { padding: "40px", textAlign: "center", color: "var(--text-dim)", fontSize: "14px" },
  info:   { color: "var(--text-muted)", fontSize: "14px" },
  errMsg: {
    color: PRIMARY, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "rgba(255,0,122,0.1)", borderRadius: "8px", border: `1px solid ${PRIMARY}`,
  },
  count: { fontSize: "12px", color: "var(--text-dim)", textAlign: "right" },
};
