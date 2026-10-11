import { useState, useMemo } from "react";
import { useChartColors } from "../../../hooks/useChartColors";
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
import { useSeances } from "../../../hooks/useSeances";
import { useObjectif } from "../../../hooks/useObjectif";
import { PRIMARY, BLUE, getCompte, normFactor, getSaison, CURRENT_SAISON, nbSeances, libelleSaison, optionsDistances } from "../../../utils/seances";
import { scoreEpreuve } from "../../../utils/records";
import { DIST_ORDER } from "../../../utils/statsCalc";
import FilterSelect from "../../shared/FilterSelect";
import * as ui from "../styleArcher";

// Dessine une ligne horizontale en pointillé sur le canvas via afterDraw
const horizontalLinePlugin = {
  id: "horizontalLine",
  afterDraw(chart) {
    const cfg = chart.options.plugins?.horizontalLine;
    if (!cfg?.value) return;
    const { ctx, chartArea: { left, right }, scales: { y } } = chart;
    const yPx = y.getPixelForValue(cfg.value);
    ctx.save();
    ctx.strokeStyle = cfg.color ?? "#F59E0B";
    ctx.setLineDash([6, 3]);
    ctx.lineWidth = 2;
    ctx.globalAlpha = 1;
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

const OBJ_COLOR = "#d99a2b"; // ≈ var(--warn), littéral car dessiné sur canvas

const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const MONTHS_FR = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];
const fmtMonth = (ym) => {
  const [y, m] = ym.split("-");
  return `${MONTHS_FR[parseInt(m) - 1]} ${y.slice(2)}`;
};

const fmtSaison = (s) => "S" + libelleSaison(s);

// Une couleur par archer (vue club du coach).
const ARCHER_COLORS = [
  "#6366f1", "#22d3ee", "#a3e635", "#fb923c", "#e879f9",
  "#34d399", "#f472b6", "#60a5fa", "#fbbf24", "#a78bfa",
  "#f43f5e", "#0ea5e9", "#84cc16",
];

const makeDistBarOpts = (nf, colors) => ({
  responsive: true,
  maintainAspectRatio: false,
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
    legend: {
      labels: {
        font: { size: 12 }, color: colors.text, boxWidth: 12, padding: 14,
        generateLabels: (chart) => {
          const items = chart.data.datasets.map((ds, i) => ({
            text: ds.label, fillStyle: ds.backgroundColor, strokeStyle: ds.backgroundColor,
            lineDash: [], lineWidth: 0, hidden: !chart.isDatasetVisible(i), datasetIndex: i, fontColor: colors.text,
          }));
          const objCfg = chart.options.plugins?.horizontalLine;
          if (objCfg?.value) {
            items.push({ text: "Objectif", fillStyle: "transparent", strokeStyle: objCfg.color ?? OBJ_COLOR, lineDash: [6, 3], lineWidth: 2, hidden: false, fontColor: colors.text });
          }
          return items;
        },
      },
    },
    tooltip: { callbacks: { label: (ctx) => (ctx.parsed.y != null ? `${ctx.dataset.label} : ${ctx.parsed.y} pts` : null) } },
  },
});

// Courbes de l’archer connecté (onglet Progression), avec ses propres filtres.
export default function Courbes() {
  const { seances, loading, error } = useSeances();
  const rawObjectif = useObjectif();
  const [filterDist, setFilterDist] = useState("Toutes");
  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);

  const saisons = useMemo(() => {
    const set = new Set(seances.map((s) => (s.date ? getSaison(s.date) : null)).filter(Boolean));
    return ["Toutes", ...[...set].sort((a, b) => b.localeCompare(a))];
  }, [seances]);

  if (loading) return <div style={s.info}>Chargement…</div>;
  if (error) return <div style={s.errMsg}>{error}</div>;

  return (
    <div style={s.page}>
      <div style={s.filters}>
        <FilterSelect label="Saison" value={filterSaison} options={saisons} onChange={setFilterSaison} libelle={libelleSaison} />
        <FilterSelect label="Distance" value={filterDist} options={optionsDistances(seances, filterDist)} onChange={setFilterDist} />
      </div>
      <CourbesGraphiques seances={seances} rawObjectif={rawObjectif} filterSaison={filterSaison} filterDist={filterDist} />
    </div>
  );
}

// Les graphiques eux-mêmes, partagés avec la Progression club du coach : pour un
// archer, exactement les courbes qu’il voit ; pour tout le club (`parArcher`), les
// mêmes graphiques avec une courbe (ou une barre) par archer, pour les comparer.
export function CourbesGraphiques({ seances, rawObjectif, filterSaison, filterDist, parArcher = false }) {
  const colors = useChartColors();

  const objectives = useMemo(() => {
    if (!rawObjectif) return {};
    const sel = filterSaison === "Toutes" ? CURRENT_SAISON : filterSaison;
    if (rawObjectif.saisons?.[sel]) return rawObjectif.saisons[sel].distances ?? {};
    if (rawObjectif.distances) return rawObjectif.distances;
    return {};
  }, [rawObjectif, filterSaison]);

  const { lineData, lineOpts, hasLineData } = useMemo(() => {
    const src = seances
      .filter((s) => {
        if (!s.date) return false;
        const okSaison = filterSaison === "Toutes" || getSaison(s.date) === filterSaison;
        const okDist = filterDist === "Toutes" || s.distance === filterDist;
        return okSaison && okDist && getCompte(s) > 0 && (s.score ?? 0) > 0;
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const labels = src.map((s) => fmtDate(s.date));
    const entraData = src.map((s) => (s.type === "Entraînement" ? s.score / getCompte(s) : null));
    const compData = src.map((s) => (s.type === "Compétition" ? s.score / getCompte(s) : null));

    const datasets = [
      { label: "Entraînements", data: entraData, borderColor: PRIMARY, backgroundColor: "rgba(255,0,122,0.08)", pointBackgroundColor: PRIMARY, pointRadius: 5, pointHoverRadius: 7, tension: 0.3, spanGaps: true },
      { label: "Compétitions", data: compData, borderColor: BLUE, backgroundColor: "rgba(59,130,246,0.08)", pointBackgroundColor: BLUE, pointStyle: "rectRot", pointRadius: 6, pointHoverRadius: 8, borderDash: [6, 3], tension: 0.3, spanGaps: true },
    ];
    if (filterDist !== "Toutes" && objectives[filterDist] != null) {
      const objMoyFl = objectives[filterDist] / normFactor(filterDist);
      datasets.push({ label: "Objectif", data: labels.map(() => objMoyFl), borderColor: OBJ_COLOR, backgroundColor: "transparent", borderDash: [6, 3], borderWidth: 2, pointRadius: 0, fill: false, tension: 0, spanGaps: true });
    }

    const lineOpts = {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: { font: { size: 11 }, color: colors.dim, maxRotation: 45, autoSkip: true, maxTicksLimit: 24 }, grid: { color: colors.grid } },
        y: { beginAtZero: false, ticks: { font: { size: 11 }, color: colors.dim }, grid: { color: colors.grid }, title: { display: true, text: "Moy. / flèche", color: colors.dim, font: { size: 11 } } },
      },
      plugins: {
        legend: { labels: { font: { size: 12 }, color: colors.text, boxWidth: 18, padding: 18 } },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.label ?? "",
            label: (ctx) => {
              if (ctx.parsed.y == null) return null;
              if (ctx.dataset.label === "Objectif") return `Objectif : ${ctx.parsed.y.toFixed(2)} moy/fl`;
              const seance = src[ctx.dataIndex];
              if (!seance) return null;
              const c = getCompte(seance);
              return [`${ctx.dataset.label} : ${ctx.parsed.y.toFixed(2)} moy/fl`, `Score ${seance.score}  ·  ${c} fl. comptées  ·  ${seance.distance}`];
            },
          },
        },
      },
    };

    return { lineData: { labels, datasets }, lineOpts, hasLineData: entraData.some((v) => v !== null) || compData.some((v) => v !== null) };
  }, [seances, filterDist, filterSaison, objectives, colors.theme]);

  const { monthlyData, monthlyOpts, hasMonthlyData } = useMemo(() => {
    const src = seances
      .filter((s) => {
        if (!s.date) return false;
        const okSaison = filterSaison === "Toutes" || getSaison(s.date) === filterSaison;
        const okDist = filterDist === "Toutes" || s.distance === filterDist;
        return okSaison && okDist && getCompte(s) > 0 && (s.score ?? 0) > 0;
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const months = [...new Set(src.map((s) => s.date.slice(0, 7)))].sort();
    const avgByType = (type) => months.map((ym) => {
      const group = src.filter((s) => s.date.startsWith(ym) && s.type === type);
      if (!group.length) return null;
      const totSc = group.reduce((n, s) => n + s.score, 0);
      const totVol = group.reduce((n, s) => n + getCompte(s), 0);
      return totVol > 0 ? parseFloat((totSc / totVol).toFixed(2)) : null;
    });

    const entraData = avgByType("Entraînement");
    const compData = avgByType("Compétition");

    const datasets = [
      { label: "Entraînements", data: entraData, borderColor: PRIMARY, backgroundColor: "rgba(255,0,122,0.1)", pointBackgroundColor: PRIMARY, pointRadius: 5, pointHoverRadius: 7, tension: 0.35, fill: true, spanGaps: false },
      { label: "Compétitions", data: compData, borderColor: BLUE, backgroundColor: "rgba(59,130,246,0.1)", pointBackgroundColor: BLUE, pointStyle: "rectRot", pointRadius: 6, pointHoverRadius: 8, borderDash: [6, 3], tension: 0.35, fill: true, spanGaps: false },
    ];
    if (filterDist !== "Toutes" && objectives[filterDist] != null) {
      const objMoyFl = objectives[filterDist] / normFactor(filterDist);
      datasets.push({ label: "Objectif", data: months.map(() => objMoyFl), borderColor: OBJ_COLOR, backgroundColor: "transparent", borderDash: [6, 3], borderWidth: 2, pointRadius: 0, fill: false, tension: 0, spanGaps: true });
    }

    const opts = {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: { font: { size: 11 }, color: colors.dim, maxRotation: 45, autoSkip: true, maxTicksLimit: 18 }, grid: { color: colors.grid } },
        y: { beginAtZero: false, ticks: { font: { size: 11 }, color: colors.dim }, grid: { color: colors.grid }, title: { display: true, text: "Moy. / flèche", color: colors.dim, font: { size: 11 } } },
      },
      plugins: {
        legend: { labels: { font: { size: 12 }, color: colors.text, boxWidth: 18, padding: 18 } },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.label ?? "",
            label: (ctx) => {
              if (ctx.parsed.y == null) return null;
              if (ctx.dataset.label === "Objectif") return `Objectif : ${ctx.parsed.y.toFixed(2)} moy/fl`;
              const ym = months[ctx.dataIndex];
              const type = ctx.dataset.label === "Entraînements" ? "Entraînement" : "Compétition";
              const group = src.filter((s) => s.date.startsWith(ym) && s.type === type);
              const nb = nbSeances(group);
              return [`${ctx.dataset.label} : ${ctx.parsed.y.toFixed(2)} moy/fl`, `${nb} séance${nb > 1 ? "s" : ""} ce mois`];
            },
          },
        },
      },
    };

    return { monthlyData: { labels: months.map(fmtMonth), datasets }, monthlyOpts: opts, hasMonthlyData: entraData.some((v) => v !== null) || compData.some((v) => v !== null) };
  }, [seances, filterDist, filterSaison, objectives, colors.theme]);

  const distBarCharts = useMemo(() => {
    const allSaisons = [...new Set(seances.filter((s) => s.date).map((s) => getSaison(s.date)))].sort();
    return DIST_ORDER
      .map((dist) => {
        const src = seances.filter((s) => s.distance === dist && s.date && getCompte(s) > 0 && (s.score ?? 0) > 0);
        if (!src.length) return null;
        const nf = normFactor(dist);
        const top3avg = (type, saison) => {
          const scores = src.filter((s) => s.type === type && getSaison(s.date) === saison).map(scoreEpreuve).filter((v) => v != null).sort((a, b) => b - a).slice(0, 3);
          return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
        };
        const entrData = allSaisons.map((sn) => top3avg("Entraînement", sn));
        const compData = allSaisons.map((sn) => top3avg("Compétition", sn));
        if (!entrData.some((v) => v !== null) && !compData.some((v) => v !== null)) return null;
        const datasets = [
          { type: "bar", label: "Entr.", data: entrData, backgroundColor: "rgba(255,0,122,0.75)", borderRadius: 4 },
          { type: "bar", label: "Comp.", data: compData, backgroundColor: "rgba(59,130,246,0.75)", borderRadius: 4 },
        ];
        const objVal = objectives[dist];
        const baseOpts = makeDistBarOpts(nf, colors);
        const opts = objVal != null ? { ...baseOpts, plugins: { ...baseOpts.plugins, horizontalLine: { value: objVal, color: OBJ_COLOR } } } : baseOpts;
        return { dist, nf, data: { labels: allSaisons.map(fmtSaison), datasets }, opts, objVal };
      })
      .filter(Boolean);
  }, [seances, objectives, colors.theme]);

  // ── Club : une courbe par archer ──────────────────────────────────────────
  const club = useMemo(() => {
    if (!parArcher) return null;
    const tires = seances.filter((s) => s.date && s.archer && getCompte(s) > 0 && (s.score ?? 0) > 0);
    const src = tires
      .filter((s) => (filterSaison === "Toutes" || getSaison(s.date) === filterSaison) && (filterDist === "Toutes" || s.distance === filterDist))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const archers = [...new Set(tires.map((s) => s.archer))].sort();
    const couleur = (i) => ARCHER_COLORS[i % ARCHER_COLORS.length];
    const moy = (group) => {
      const vol = group.reduce((n, s) => n + getCompte(s), 0);
      return vol > 0 ? parseFloat((group.reduce((n, s) => n + s.score, 0) / vol).toFixed(2)) : null;
    };
    const courbe = (archer, i, data) => ({
      label: archer, data, borderColor: couleur(i), backgroundColor: couleur(i) + "22", pointBackgroundColor: couleur(i),
      pointRadius: 4, pointHoverRadius: 6, tension: 0.3, spanGaps: true,
    });
    const dates = [...new Set(src.map((s) => s.date))];
    const months = [...new Set(src.map((s) => s.date.slice(0, 7)))].sort();
    const ligne = archers.map((a, i) => courbe(a, i, dates.map((d) => moy(src.filter((s) => s.archer === a && s.date === d)))))
      .filter((ds) => ds.data.some((v) => v != null));
    const mois = archers.map((a, i) => courbe(a, i, months.map((ym) => moy(src.filter((s) => s.archer === a && s.date.startsWith(ym))))))
      .filter((ds) => ds.data.some((v) => v != null));
    const opts = (titreY) => ({
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: { font: { size: 11 }, color: colors.dim, maxRotation: 45, autoSkip: true, maxTicksLimit: 18 }, grid: { color: colors.grid } },
        y: { beginAtZero: false, ticks: { font: { size: 11 }, color: colors.dim }, grid: { color: colors.grid }, title: { display: true, text: titreY, color: colors.dim, font: { size: 11 } } },
      },
      plugins: {
        legend: { position: "bottom", labels: { font: { size: 12 }, color: colors.text, boxWidth: 14, padding: 16 } },
        tooltip: { callbacks: { label: (ctx) => (ctx.parsed.y != null ? `${ctx.dataset.label} : ${ctx.parsed.y.toFixed(2)} moy/fl` : null) } },
      },
    });

    // Meilleur score moyen par distance et par saison : une barre par archer.
    const allSaisons = [...new Set(tires.map((s) => getSaison(s.date)))].sort();
    const barres = DIST_ORDER.map((dist) => {
      const d = tires.filter((s) => s.distance === dist);
      if (!d.length) return null;
      const nf = normFactor(dist);
      const datasets = archers.map((a, i) => ({
        type: "bar", label: a, backgroundColor: couleur(i), borderRadius: 4,
        data: allSaisons.map((sn) => {
          const sc = d.filter((s) => s.archer === a && getSaison(s.date) === sn).map(scoreEpreuve)
            .filter((v) => v != null).sort((x, y) => y - x).slice(0, 3);
          return sc.length ? Math.round(sc.reduce((x, y) => x + y, 0) / sc.length) : null;
        }),
      })).filter((ds) => ds.data.some((v) => v != null));
      if (!datasets.length) return null;
      const base = makeDistBarOpts(nf, colors);
      const barOpts = { ...base, plugins: { ...base.plugins, legend: { position: "bottom", labels: { font: { size: 12 }, color: colors.text, boxWidth: 12, padding: 14 } } } };
      return { dist, nf, data: { labels: allSaisons.map(fmtSaison), datasets }, opts: barOpts, objVal: null };
    }).filter(Boolean);

    return {
      ligne: { data: { labels: dates.map(fmtDate), datasets: ligne }, opts: opts("Moy. / flèche"), ok: ligne.length > 0 },
      mois:  { data: { labels: months.map(fmtMonth), datasets: mois }, opts: opts("Moy. / flèche"), ok: mois.length > 0 },
      barres,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parArcher, seances, filterSaison, filterDist, colors.theme]);

  const g1 = club ? club.ligne : { data: lineData, opts: lineOpts, ok: hasLineData };
  const g2 = club ? club.mois : { data: monthlyData, opts: monthlyOpts, ok: hasMonthlyData };
  const barresAffichees = club ? club.barres : distBarCharts;

  return (
    <>
      <div style={s.card}>
        <div style={s.cardHeader}>
          <span style={s.cardTitle}>Évolution de la moyenne / flèche</span>
          {filterDist !== "Toutes" && <span style={s.distBadge}>{filterDist}</span>}
          <span style={s.hint}>1 point = 1 séance avec tir compté</span>
        </div>
        {!g1.ok ? <div style={s.empty}>Aucune séance avec tir compté pour cette sélection.</div> : <div style={{ height: 320 }}><Line data={g1.data} options={g1.opts} /></div>}
      </div>

      <div style={s.card}>
        <div style={s.cardHeader}>
          <span style={s.cardTitle}>Score moyen par mois</span>
          {filterDist !== "Toutes" && <span style={s.distBadge}>{filterDist}</span>}
          <span style={s.hint}>Moy./flèche agrégée par mois</span>
        </div>
        {!g2.ok ? <div style={s.empty}>Aucune séance avec tir compté pour cette sélection.</div> : <div style={{ height: 320 }}><Line data={g2.data} options={g2.opts} /></div>}
      </div>

      <div style={s.sectionCard}>
        <div style={s.sectionCardHeader}>
          <span style={s.sectionCardTitle}>Meilleur score moy. par distance — toutes saisons</span>
          <span style={s.hint}>Moyenne top 3 · ×60 (5m/18m) · ×72 autres</span>
        </div>
        {barresAffichees.length === 0 ? <div style={s.empty}>Aucune séance avec tir compté enregistrée.</div> : (
          <div style={s.distGrid}>
            {barresAffichees.map(({ dist, nf, data, opts, objVal }) => (
              <div key={dist} style={s.distCard}>
                <div style={s.cardHeader}>
                  <span style={s.cardTitle}>{dist} <span style={{ color: "var(--text-dim)", fontWeight: "400", fontSize: "12px" }}>(max {nf * 10} pts / {nf} fl.)</span></span>
                </div>
                <div key={`${dist}-${objVal ?? 0}`} style={{ height: 260 }}><ChartMixed type="bar" data={data} options={opts} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

const s = {
  page: { display: "flex", flexDirection: "column", gap: "18px" },
  filters: ui.filtres,
  card: { ...ui.carte, padding: "18px 20px 20px" },
  cardHeader: { display: "flex", alignItems: "baseline", gap: "6px 12px", marginBottom: "16px", flexWrap: "wrap" },
  cardTitle: { ...ui.titreSection, fontSize: "17px" },
  distBadge: { fontSize: "13px", fontWeight: "600", color: "var(--text-muted)" },
  hint: { ...ui.sousTitre, fontSize: "12px", marginLeft: "auto" },
  sectionCard: { ...ui.carte, padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: "16px" },
  sectionCardHeader: { display: "flex", alignItems: "baseline", gap: "6px 12px", flexWrap: "wrap" },
  sectionCardTitle: { ...ui.titreSection, fontSize: "17px" },
  distGrid: { display: "flex", flexDirection: "column", gap: "14px" },
  distCard: { backgroundColor: "var(--surface-sub)", borderRadius: "10px", border: "1px solid var(--border)", padding: "14px 16px 16px" },
  empty: { textAlign: "center", color: "var(--text-dim)", fontSize: "14px", padding: "48px 0" },
  info: ui.info,
  errMsg: ui.erreur,
};
