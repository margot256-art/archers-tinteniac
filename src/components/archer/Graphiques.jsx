import { useState, useMemo, useEffect } from "react";
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
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../hooks/useAuth";
import { useSeances } from "../../hooks/useSeances";

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

const PRIMARY   = "#FF007A";
const BLUE      = "#3b82f6";
const OBJ_COLOR = "#F59E0B";
const DISTANCES = ["Toutes", "5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const DIST_ONLY = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];

const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const getSaison = (iso) => {
  const [y, m] = iso.split("-").map(Number);
  return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
};

const normFactor = (dist) => (dist === "5m" || dist === "18m") ? 60 : 72;
const getCompte  = s => s.compte ?? s.volumeCompte ?? 0;
const fmtSaison  = s => "S" + s.split("/")[1];

const makeDistBarOpts = (nf) => ({
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      ticks: { font: { size: 12 }, color: "#777" },
      grid: { display: false },
    },
    y: {
      min: 0,
      max: nf * 10,
      ticks: { font: { size: 11 }, color: "#666", stepSize: 100 },
      grid: { color: "#2a2a2a" },
      title: { display: true, text: `/ ${nf * 10}`, color: "#555", font: { size: 11 } },
    },
  },
  plugins: {
    legend: {
      labels: {
        font: { size: 12 }, color: "#fff", boxWidth: 12, padding: 14,
        generateLabels: (chart) => {
          const items = chart.data.datasets.map((ds, i) => ({
            text: ds.label,
            fillStyle: ds.backgroundColor,
            strokeStyle: ds.backgroundColor,
            lineDash: [],
            lineWidth: 0,
            hidden: !chart.isDatasetVisible(i),
            datasetIndex: i,
            fontColor: "#fff",
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
              fontColor: "#fff",
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

const DIST_BAR_OPTS_60 = makeDistBarOpts(60);
const DIST_BAR_OPTS_72 = makeDistBarOpts(72);

const CURRENT_SAISON = (() => {
  const d = new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
})();

export default function Graphiques() {
  const { user }                        = useAuth();
  const { seances, loading, error }     = useSeances();
  const [filterDist,   setFilterDist]   = useState("Toutes");
  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);
  const [objectives,   setObjectives]   = useState({});

  useEffect(() => {
    if (!user) return;
    const archerId = user.id ?? `${user.prenom.toLowerCase()}_${user.nom.toLowerCase()}`;
    const unsub = onSnapshot(doc(db, "objectifs", archerId), (snap) => {
      setObjectives(snap.exists() ? (snap.data().distances ?? {}) : {});
    });
    return () => unsub();
  }, [user]);

  const saisons = useMemo(() => {
    const set = new Set(seances.map(s => s.date ? getSaison(s.date) : null).filter(Boolean));
    return ["Toutes", ...[...set].sort((a, b) => b.localeCompare(a))];
  }, [seances]);

  // ── Chart 1 : une séance = un point ──────────────────────────────────────
  const { lineData, lineOpts, hasLineData } = useMemo(() => {
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
            font: { size: 11 }, color: "#666",
            maxRotation: 45, autoSkip: true, maxTicksLimit: 24,
          },
          grid: { color: "#2a2a2a" },
        },
        y: {
          beginAtZero: false,
          ticks: { font: { size: 11 }, color: "#666" },
          grid: { color: "#2a2a2a" },
          title: { display: true, text: "Moy. / flèche", color: "#555", font: { size: 11 } },
        },
      },
      plugins: {
        legend: {
          labels: { font: { size: 12 }, color: "#fff", boxWidth: 18, padding: 18 },
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
  }, [seances, filterDist, filterSaison, objectives]);

  // ── Chart 2 : top 3 moy. par distance, 1 graphique / distance, X = saisons ──
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
        const baseOpts = nf === 60 ? DIST_BAR_OPTS_60 : DIST_BAR_OPTS_72;
        const opts = objVal != null
          ? { ...baseOpts, plugins: { ...baseOpts.plugins, horizontalLine: { value: objVal, color: OBJ_COLOR } } }
          : baseOpts;

        return { dist, nf, data: { labels: allSaisons.map(fmtSaison), datasets }, opts, objVal };
      })
      .filter(Boolean);
  }, [seances, objectives]);

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

      {/* Meilleur score moy. par distance — 1 graphique / distance, toutes saisons */}
      {distBarCharts.length > 0 && (
        <>
          <div style={s.sectionTitle}>
            Meilleur score moy. par distance — toutes saisons
            <span style={s.hint}>Moyenne top 3 · ×60 (5m/18m) · ×72 autres</span>
          </div>
          <div style={s.distGrid}>
            {distBarCharts.map(({ dist, nf, data, opts, objVal }) => (
              <div key={dist} style={s.card}>
                <div style={s.cardHeader}>
                  <span style={s.cardTitle}>
                    {dist}{" "}
                    <span style={{ color: "#666", fontWeight: "400", fontSize: "12px" }}>
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
        </>
      )}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={s.filterLabel}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={s.filterSelect}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

const s = {
  page: { display: "flex", flexDirection: "column", gap: "20px" },
  header: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between", flexWrap: "wrap", gap: "12px",
  },
  title:   { fontSize: "20px", fontWeight: "700", color: "#e8e8e8", margin: 0 },
  filters: { display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" },
  filterLabel: {
    fontSize: "12px", fontWeight: "600", color: "#777",
    textTransform: "uppercase", letterSpacing: "0.06em",
  },
  filterSelect: {
    padding: "7px 10px", border: "1.5px solid #2e2e2e", borderRadius: "7px",
    fontSize: "13px", color: "#e8e8e8", backgroundColor: "#1e1e1e",
    outline: "none", fontFamily: "inherit", cursor: "pointer",
  },
  card: {
    backgroundColor: "#1a1a1a", borderRadius: "12px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
    padding: "20px 24px 24px",
  },
  cardHeader: {
    display: "flex", alignItems: "center", gap: "10px",
    marginBottom: "20px", flexWrap: "wrap",
  },
  cardTitle: { fontSize: "14px", fontWeight: "600", color: "#d0d0d0" },
  distBadge: {
    backgroundColor: "#2a2a2a", borderRadius: "5px",
    padding: "2px 8px", fontSize: "12px", fontWeight: "600", color: "#bbb",
  },
  hint: { fontSize: "11px", color: "#555", fontStyle: "italic", marginLeft: "auto" },
  sectionTitle: {
    fontSize: "11px", fontWeight: "700", color: "#666",
    textTransform: "uppercase", letterSpacing: "0.08em",
    display: "flex", alignItems: "center", gap: "12px",
  },
  distGrid: { display: "flex", flexDirection: "column", gap: "16px" },
  empty: { textAlign: "center", color: "#555", fontSize: "14px", padding: "52px 0" },
  info:  { color: "#777", fontSize: "14px" },
  errMsg: {
    color: PRIMARY, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "rgba(255,0,122,0.1)", borderRadius: "8px", border: `1px solid ${PRIMARY}`,
  },
};
