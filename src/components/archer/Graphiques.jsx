import { useState, useMemo } from "react";
import { useChartColors } from "../../hooks/useChartColors";
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
import { useAuth } from "../../hooks/useAuth";
import { useSeances } from "../../hooks/useSeances";
import { useObjectif } from "../../hooks/useObjectif";
import { PRIMARY, BLUE, getCompte, normFactor, getSaison, CURRENT_SAISON } from "../../utils/seances";
import FilterSelect from "../shared/FilterSelect";

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

const OBJ_COLOR = "#F59E0B";
const DISTANCES = ["Toutes", "5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const DIST_ONLY = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];

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

const fmtSaison  = s => "S" + s.split("/")[1];

const makeDistBarOpts = (nf, colors) => ({
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      ticks: { font: { size: 12 }, color: colors.muted },
      grid: { display: false },
    },
    y: {
      min: 0,
      max: nf * 10,
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
            text: ds.label,
            fillStyle: ds.backgroundColor,
            strokeStyle: ds.backgroundColor,
            lineDash: [],
            lineWidth: 0,
            hidden: !chart.isDatasetVisible(i),
            datasetIndex: i,
            fontColor: colors.text,
          }));
          const objCfg = chart.options.plugins?.horizontalLine;
          if (objCfg?.value) {
            items.push({
              text: "Objectif",
              fillStyle: "transparent",
              strokeStyle: objCfg.color ?? OBJ_COLOR,
              lineDash: [6, 3],
              lineWidth: 2,
              hidden: false,
              fontColor: colors.text,
            });
          }
          return items;
        },
      },
    },
    tooltip: {
      callbacks: {
        label: (ctx) =>
          ctx.parsed.y != null ? `${ctx.dataset.label} : ${ctx.parsed.y} pts` : null,
      },
    },
  },
});



export default function Graphiques() {
  const { user }                        = useAuth();
  const { seances, loading, error }     = useSeances();
  const rawObjectif                     = useObjectif();
  const colors                          = useChartColors();
  const [filterDist,   setFilterDist]   = useState("Toutes");
  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);

  // Objectifs pour la saison sélectionnée (rétrocompat ancien format)
  const objectives = useMemo(() => {
    if (!rawObjectif) return {};
    const s = filterSaison === "Toutes" ? CURRENT_SAISON : filterSaison;
    if (rawObjectif.saisons?.[s]) return rawObjectif.saisons[s].distances ?? {};
    if (rawObjectif.distances) return rawObjectif.distances;
    return {};
  }, [rawObjectif, filterSaison]);

  const saisons = useMemo(() => {
    const set = new Set(seances.map(s => s.date ? getSaison(s.date) : null).filter(Boolean));
    return ["Toutes", ...[...set].sort((a, b) => b.localeCompare(a))];
  }, [seances]);


  // ── Chart 1 : une séance = un point ──────────────────────────────────────
  const { lineData, lineOpts, hasLineData } = useMemo(() => {
    // colors est capturé dans la closure — useMemo se relance quand colors.theme change
    const src = seances
      .filter(s => {
        if (!s.date) return false;
        const okSaison = filterSaison === "Toutes" || getSaison(s.date) === filterSaison;
        const okDist   = filterDist   === "Toutes" || s.distance === filterDist;
        return okSaison && okDist && getCompte(s) > 0 && (s.score ?? 0) > 0;
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const labels    = src.map(s => fmtDate(s.date));
    const entraData = src.map(s => s.type === "Entraînement" ? s.score / getCompte(s) : null);
    const compData  = src.map(s => s.type === "Compétition"  ? s.score / getCompte(s) : null);

    const datasets = [
      {
        label: "Entraînements",
        data: entraData,
        borderColor: PRIMARY,
        backgroundColor: "rgba(255,0,122,0.08)",
        pointBackgroundColor: PRIMARY,
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: "Compétitions",
        data: compData,
        borderColor: BLUE,
        backgroundColor: "rgba(59,130,246,0.08)",
        pointBackgroundColor: BLUE,
        pointStyle: "rectRot",
        pointRadius: 6,
        pointHoverRadius: 8,
        borderDash: [6, 3],
        tension: 0.3,
        spanGaps: true,
      },
    ];
    if (filterDist !== "Toutes" && objectives[filterDist] != null) {
      const objMoyFl = objectives[filterDist] / normFactor(filterDist);
      datasets.push({
        label: "Objectif",
        data: labels.map(() => objMoyFl),
        borderColor: OBJ_COLOR,
        backgroundColor: "transparent",
        borderDash: [6, 3],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0,
        spanGaps: true,
      });
    }

    const lineData = { labels, datasets };

    const lineOpts = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: {
            font: { size: 11 }, color: colors.dim,
            maxRotation: 45, autoSkip: true, maxTicksLimit: 24,
          },
          grid: { color: colors.grid },
        },
        y: {
          beginAtZero: false,
          ticks: { font: { size: 11 }, color: colors.dim },
          grid: { color: colors.grid },
          title: { display: true, text: "Moy. / flèche", color: colors.dim, font: { size: 11 } },
        },
      },
      plugins: {
        legend: {
          labels: { font: { size: 12 }, color: colors.text, boxWidth: 18, padding: 18 },
        },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.label ?? "",
            label: (ctx) => {
              if (ctx.parsed.y == null) return null;
              if (ctx.dataset.label === "Objectif") {
                return `Objectif : ${ctx.parsed.y.toFixed(2)} moy/fl`;
              }
              const seance = src[ctx.dataIndex];
              if (!seance) return null;
              const c = getCompte(seance);
              return [
                `${ctx.dataset.label} : ${ctx.parsed.y.toFixed(2)} moy/fl`,
                `Score ${seance.score}  ·  ${c} fl. comptées  ·  ${seance.distance}`,
              ];
            },
          },
        },
      },
    };

    return { lineData, lineOpts, hasLineData: entraData.some(v => v !== null) || compData.some(v => v !== null) };
  }, [seances, filterDist, filterSaison, objectives, colors.theme]);

  // ── Chart 2 : score moyen par mois ──────────────────────────────────────────
  const { monthlyData, monthlyOpts, hasMonthlyData } = useMemo(() => {
    const src = seances
      .filter(s => {
        if (!s.date) return false;
        const okSaison = filterSaison === "Toutes" || getSaison(s.date) === filterSaison;
        const okDist   = filterDist   === "Toutes" || s.distance === filterDist;
        return okSaison && okDist && getCompte(s) > 0 && (s.score ?? 0) > 0;
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const months = [...new Set(src.map(s => s.date.slice(0, 7)))].sort();

    const avgByType = (type) => months.map(ym => {
      const group = src.filter(s => s.date.startsWith(ym) && s.type === type);
      if (!group.length) return null;
      const totSc  = group.reduce((n, s) => n + s.score,        0);
      const totVol = group.reduce((n, s) => n + getCompte(s), 0);
      return totVol > 0 ? parseFloat((totSc / totVol).toFixed(2)) : null;
    });

    const entraData = avgByType("Entraînement");
    const compData  = avgByType("Compétition");

    const datasets = [
      {
        label: "Entraînements",
        data: entraData,
        borderColor: PRIMARY,
        backgroundColor: "rgba(255,0,122,0.1)",
        pointBackgroundColor: PRIMARY,
        pointRadius: 5, pointHoverRadius: 7,
        tension: 0.35, fill: true, spanGaps: false,
      },
      {
        label: "Compétitions",
        data: compData,
        borderColor: BLUE,
        backgroundColor: "rgba(59,130,246,0.1)",
        pointBackgroundColor: BLUE,
        pointStyle: "rectRot",
        pointRadius: 6, pointHoverRadius: 8,
        borderDash: [6, 3], tension: 0.35, fill: true, spanGaps: false,
      },
    ];

    if (filterDist !== "Toutes" && objectives[filterDist] != null) {
      const objMoyFl = objectives[filterDist] / normFactor(filterDist);
      datasets.push({
        label: "Objectif",
        data: months.map(() => objMoyFl),
        borderColor: OBJ_COLOR, backgroundColor: "transparent",
        borderDash: [6, 3], borderWidth: 2,
        pointRadius: 0, fill: false, tension: 0, spanGaps: true,
      });
    }

    const labels = months.map(fmtMonth);

    const opts = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { font: { size: 11 }, color: colors.dim, maxRotation: 45, autoSkip: true, maxTicksLimit: 18 },
          grid: { color: colors.grid },
        },
        y: {
          beginAtZero: false,
          ticks: { font: { size: 11 }, color: colors.dim },
          grid: { color: colors.grid },
          title: { display: true, text: "Moy. / flèche", color: colors.dim, font: { size: 11 } },
        },
      },
      plugins: {
        legend: {
          labels: { font: { size: 12 }, color: colors.text, boxWidth: 18, padding: 18 },
        },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.label ?? "",
            label: (ctx) => {
              if (ctx.parsed.y == null) return null;
              if (ctx.dataset.label === "Objectif") return `Objectif : ${ctx.parsed.y.toFixed(2)} moy/fl`;
              const ym    = months[ctx.dataIndex];
              const type  = ctx.dataset.label === "Entraînements" ? "Entraînement" : "Compétition";
              const group = src.filter(s => s.date.startsWith(ym) && s.type === type);
              const nb    = group.length;
              return [
                `${ctx.dataset.label} : ${ctx.parsed.y.toFixed(2)} moy/fl`,
                `${nb} séance${nb > 1 ? "s" : ""} ce mois`,
              ];
            },
          },
        },
      },
    };

    return {
      monthlyData: { labels, datasets },
      monthlyOpts: opts,
      hasMonthlyData: entraData.some(v => v !== null) || compData.some(v => v !== null),
    };
  }, [seances, filterDist, filterSaison, objectives, colors.theme]);

  // ── Chart 3 : top 3 moy. par distance, 1 graphique / distance, X = saisons ──
  const distBarCharts = useMemo(() => {
    const allSaisons = [...new Set(
      seances.filter(s => s.date).map(s => getSaison(s.date))
    )].sort();

    return DIST_ONLY
      .map(dist => {
        const src = seances.filter(s =>
          s.distance === dist && s.date && getCompte(s) > 0 && (s.score ?? 0) > 0
        );
        if (!src.length) return null;

        const nf = normFactor(dist);
        const top3avg = (type, saison) => {
          const scores = src
            .filter(s => s.type === type && getSaison(s.date) === saison)
            .map(s => s.score / getCompte(s) * nf)
            .sort((a, b) => b - a)
            .slice(0, 3);
          return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
        };

        const entrData = allSaisons.map(sn => top3avg("Entraînement", sn));
        const compData = allSaisons.map(sn => top3avg("Compétition",  sn));
        if (!entrData.some(v => v !== null) && !compData.some(v => v !== null)) return null;

        const datasets = [
          { type: "bar", label: "Entr.", data: entrData,
            backgroundColor: "rgba(255,0,122,0.75)", borderRadius: 4 },
          { type: "bar", label: "Comp.", data: compData,
            backgroundColor: "rgba(59,130,246,0.75)", borderRadius: 4 },
        ];

        const objVal = objectives[dist];
        const baseOpts = makeDistBarOpts(nf, colors);
        const opts = objVal != null
          ? { ...baseOpts, plugins: { ...baseOpts.plugins, horizontalLine: { value: objVal, color: OBJ_COLOR } } }
          : baseOpts;

        return { dist, nf, data: { labels: allSaisons.map(fmtSaison), datasets }, opts, objVal };
      })
      .filter(Boolean);
  }, [seances, objectives, colors.theme]);

  if (loading) return <div style={s.info}>Chargement…</div>;
  if (error)   return <div style={s.errMsg}>{error}</div>;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>Graphiques</h2>
        <div style={s.filters}>
          <FilterSelect label="Saison"   value={filterSaison} options={saisons}   onChange={setFilterSaison} />
          <FilterSelect label="Distance" value={filterDist}   options={DISTANCES} onChange={setFilterDist} />
        </div>
      </div>

      {/* Courbe moyenne/flèche — 1 point par séance */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <span style={s.cardTitle}>Évolution de la moyenne / flèche</span>
          {filterDist !== "Toutes" && <span style={s.distBadge}>{filterDist}</span>}
          <span style={s.hint}>1 point = 1 séance avec tir compté</span>
        </div>
        {!hasLineData ? (
          <div style={s.empty}>Aucune séance avec tir compté pour cette sélection.</div>
        ) : (
          <div style={{ height: 320 }}>
            <Line data={lineData} options={lineOpts} />
          </div>
        )}
      </div>

      {/* Score moyen par mois */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <span style={s.cardTitle}>Score moyen par mois</span>
          {filterDist !== "Toutes" && <span style={s.distBadge}>{filterDist}</span>}
          <span style={s.hint}>Moy./flèche agrégée par mois</span>
        </div>
        {!hasMonthlyData ? (
          <div style={s.empty}>Aucune séance avec tir compté pour cette sélection.</div>
        ) : (
          <div style={{ height: 320 }}>
            <Line data={monthlyData} options={monthlyOpts} />
          </div>
        )}
      </div>

      {/* Meilleur score moy. par distance — 1 graphique / distance, toutes saisons */}
      {distBarCharts.length > 0 && (
        <div style={s.sectionCard}>
          <div style={s.sectionCardHeader}>
            <span style={s.sectionCardTitle}>Meilleur score moy. par distance — toutes saisons</span>
            <span style={s.hint}>Moyenne top 3 · ×60 (5m/18m) · ×72 autres</span>
          </div>
          <div style={s.distGrid}>
            {distBarCharts.map(({ dist, nf, data, opts, objVal }) => (
              <div key={dist} style={s.distCard}>
                <div style={s.cardHeader}>
                  <span style={s.cardTitle}>
                    {dist}{" "}
                    <span style={{ color: "var(--text-dim)", fontWeight: "400", fontSize: "12px" }}>
                      (max {nf * 10} pts / {nf} fl.)
                    </span>
                  </span>
                </div>
                <div key={`${dist}-${objVal ?? 0}`} style={{ height: 260 }}>
                  <ChartMixed type="bar" data={data} options={opts} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


const s = {
  page: { display: "flex", flexDirection: "column", gap: "20px" },
  header: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between", flexWrap: "wrap", gap: "12px",
  },
  title:   { fontSize: "20px", fontWeight: "700", color: "var(--text)", margin: 0 },
  filters: { display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" },
  filterLabel: {
    fontSize: "12px", fontWeight: "600", color: "var(--text-muted)",
    textTransform: "uppercase", letterSpacing: "0.06em",
  },
  filterSelect: {
    padding: "7px 10px", border: "var(--border-2)", borderRadius: "7px",
    fontSize: "13px", color: "var(--text)", backgroundColor: "var(--surface-raised)",
    outline: "none", fontFamily: "inherit", cursor: "pointer",
  },
  card: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)",
    padding: "20px 24px 24px",
  },
  cardHeader: {
    display: "flex", alignItems: "center", gap: "10px",
    marginBottom: "20px", flexWrap: "wrap",
  },
  cardTitle: { fontSize: "14px", fontWeight: "600", color: "var(--text-2)" },
  distBadge: {
    backgroundColor: "var(--border)", borderRadius: "5px",
    padding: "2px 8px", fontSize: "12px", fontWeight: "600", color: "var(--text-3)",
  },
  hint: { fontSize: "11px", color: "var(--text-dim)", fontStyle: "italic", marginLeft: "auto" },
  sectionTitle: {
    fontSize: "11px", fontWeight: "700", color: "var(--text-dim)",
    textTransform: "uppercase", letterSpacing: "0.08em",
    display: "flex", alignItems: "center", gap: "12px",
  },
  sectionCard: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)",
    padding: "20px 24px 24px",
    display: "flex", flexDirection: "column", gap: "20px",
  },
  sectionCardHeader: {
    display: "flex", alignItems: "center", gap: "10px",
    paddingBottom: "16px",
    borderBottom: "var(--border)",
    flexWrap: "wrap",
  },
  sectionCardTitle: {
    fontSize: "14px", fontWeight: "600", color: "var(--text-2)",
  },
  distGrid: { display: "flex", flexDirection: "column", gap: "16px" },
  distCard: {
    backgroundColor: "var(--surface-sub)", borderRadius: "10px",
    border: "1px solid var(--border)",
    padding: "16px 20px 20px",
  },
  empty: { textAlign: "center", color: "var(--text-dim)", fontSize: "14px", padding: "52px 0" },
  info:  { color: "var(--text-muted)", fontSize: "14px" },
  errMsg: {
    color: PRIMARY, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "rgba(255,0,122,0.1)", borderRadius: "8px", border: `1px solid ${PRIMARY}`,
  },
};
