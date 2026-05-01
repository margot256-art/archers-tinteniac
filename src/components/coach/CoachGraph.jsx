import { useState, useMemo } from "react";
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
import { useAllSeances } from "../../hooks/useAllSeances";

// ── Plugin ligne horizontale (objectif) ────────────────────────────────────────
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

// ── Constantes ─────────────────────────────────────────────────────────────────

const PRIMARY    = "#FF007A";
const BLUE       = "#3b82f6";
const OBJ_COLOR  = "#F59E0B";

const ARCHER_COLORS = [
  "#6366f1", "#22d3ee", "#a3e635", "#fb923c", "#e879f9",
  "#34d399", "#f472b6", "#60a5fa", "#fbbf24", "#a78bfa",
  "#f43f5e", "#0ea5e9", "#84cc16",
];

const DISTANCES   = ["Toutes distances", "5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const DIST_ONLY   = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const GRAPH_TYPES = ["Entr. + Comp.", "Entraînement", "Compétition"];
const MONTHS_FR   = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmtDate    = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const getSaison  = (iso) => { const [y, m] = iso.split("-").map(Number); return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`; };
const normFactor = (d)   => (d === "5m" || d === "18m") ? 60 : 72;
const getCompte  = (s)   => s.compte ?? s.volumeCompte ?? 0;
const fmtSaison  = (sn)  => "S" + sn.split("/")[1];
const fmtMonth   = (ym)  => { const [y, m] = ym.split("-"); return `${MONTHS_FR[parseInt(m) - 1]} ${y.slice(2)}`; };

function getCurrentSaison() {
  const d = new Date(); const m = d.getMonth() + 1; const y = d.getFullYear();
  return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}
const CURRENT_SAISON = getCurrentSaison();

const makeDistBarOpts = (nf) => ({
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      ticks: { font: { size: 12 }, color: "var(--text-muted)" },
      grid: { display: false },
    },
    y: {
      min: 0, max: nf * 10,
      ticks: { font: { size: 11 }, color: "var(--text-dim)", stepSize: 100 },
      grid: { color: "var(--border)" },
      title: { display: true, text: `/ ${nf * 10}`, color: "var(--text-dim)", font: { size: 11 } },
    },
  },
  plugins: {
    legend: {
      labels: {
        font: { size: 12 }, color: "#fff", boxWidth: 12, padding: 14,
      },
    },
    tooltip: {
      callbacks: {
        label: (ctx) => ctx.parsed.y != null ? `${ctx.dataset.label} : ${ctx.parsed.y} pts` : null,
      },
    },
  },
});
const DIST_BAR_OPTS_60 = makeDistBarOpts(60);
const DIST_BAR_OPTS_72 = makeDistBarOpts(72);

// ── Sous-composants ────────────────────────────────────────────────────────────

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label style={s.filterWrap}>
      <span style={s.filterLabel}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="coach-filter-select">
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────

export default function CoachGraph() {
  const { seances, loading, error } = useAllSeances();

  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);

  // Chart 1 — progression par archer (séance par séance)
  const [c1Archer, setC1Archer] = useState("Tous les archers");
  const [c1Dist,   setC1Dist]   = useState("Toutes distances");

  // Chart 2 — records par saison
  const [c2Archer, setC2Archer] = useState("Tous les archers");
  const [c2Dist,   setC2Dist]   = useState("Toutes distances");
  const [c2Type,   setC2Type]   = useState("Entr. + Comp.");

  // Chart 3 — score moyen par mois
  const [c3Archer, setC3Archer] = useState("Tous les archers");
  const [c3Dist,   setC3Dist]   = useState("Toutes distances");

  // Chart 4 — meilleur score moy. par distance
  const [c4Archer, setC4Archer] = useState("Tous les archers");

  const saisonOptions = useMemo(() => {
    const set = new Set(seances.filter(s => s.date).map(s => getSaison(s.date)));
    set.add(CURRENT_SAISON);
    return [...set].sort().reverse();
  }, [seances]);

  const archerOptions = useMemo(() => {
    const set = new Set(seances.filter(s => s.archer).map(s => s.archer));
    return ["Tous les archers", ...[...set].sort()];
  }, [seances]);

  // ── Chart 1 : progression moy/flèche par archer dans la saison ───────────

  const { c1Labels, c1Datasets } = useMemo(() => {
    const src = seances.filter(s => {
      if (!s.date || !s.archer) return false;
      if (getSaison(s.date) !== filterSaison) return false;
      const compte = getCompte(s);
      if (!compte || !(s.score > 0)) return false;
      if (c1Archer !== "Tous les archers" && s.archer !== c1Archer) return false;
      if (c1Dist   !== "Toutes distances" && s.distance !== c1Dist) return false;
      return true;
    });

    const sortedDates = [...new Set(src.map(s => s.date))].sort();
    const archers     = [...new Set(src.map(s => s.archer))].sort();

    const datasets = archers.map((archer, i) => {
      const color    = ARCHER_COLORS[i % ARCHER_COLORS.length];
      const byArcher = src.filter(s => s.archer === archer);
      const data = sortedDates.map(d => {
        const hits = byArcher.filter(s => s.date === d);
        if (!hits.length) return null;
        const vals = hits.map(s => s.score / getCompte(s)).filter(v => isFinite(v));
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      });
      return {
        label: archer, data,
        borderColor: color, backgroundColor: color + "22",
        pointBackgroundColor: color,
        pointRadius: 4, pointHoverRadius: 6,
        tension: 0.3, spanGaps: true,
      };
    });

    return { c1Labels: sortedDates.map(fmtDate), c1Datasets: datasets };
  }, [seances, filterSaison, c1Archer, c1Dist]);

  const hasC1 = c1Datasets.some(d => d.data.some(v => v !== null));

  // ── Chart 2 : meilleur score normalisé par archer par saison ─────────────

  const { c2Labels, c2Datasets } = useMemo(() => {
    const src = seances.filter(s => {
      if (!s.date || !s.archer) return false;
      const compte = getCompte(s);
      if (!compte || !(s.score > 0)) return false;
      if (c2Archer !== "Tous les archers" && s.archer !== c2Archer) return false;
      if (c2Dist   !== "Toutes distances" && s.distance !== c2Dist) return false;
      if (c2Type   !== "Entr. + Comp."   && s.type !== c2Type) return false;
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
          const n = Math.round((s.score / getCompte(s)) * normFactor(s.distance));
          if (best === null || n > best) best = n;
        }
        return best;
      });
      return {
        label: archer, data,
        borderColor: color, backgroundColor: color + "22",
        pointBackgroundColor: color,
        pointRadius: 5, pointHoverRadius: 7,
        tension: 0.3, spanGaps: true,
      };
    });

    return { c2Labels: saisons, c2Datasets: datasets };
  }, [seances, c2Archer, c2Dist, c2Type]);

  const hasC2 = c2Datasets.some(d => d.data.some(v => v !== null));

  // ── Chart 3 : score moyen par mois ───────────────────────────────────────

  const { c3Data, c3Opts, hasC3 } = useMemo(() => {
    const src = seances
      .filter(s => {
        if (!s.date || !s.archer) return false;
        const okSaison = filterSaison === "Toutes" || getSaison(s.date) === filterSaison;
        const okArcher = c3Archer === "Tous les archers" || s.archer === c3Archer;
        const okDist   = c3Dist   === "Toutes distances" || s.distance === c3Dist;
        return okSaison && okArcher && okDist && getCompte(s) > 0 && (s.score ?? 0) > 0;
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const months = [...new Set(src.map(s => s.date.slice(0, 7)))].sort();

    const avgByType = (type) => months.map(ym => {
      const group  = src.filter(s => s.date.startsWith(ym) && s.type === type);
      if (!group.length) return null;
      const totSc  = group.reduce((n, s) => n + s.score,      0);
      const totVol = group.reduce((n, s) => n + getCompte(s), 0);
      return totVol > 0 ? parseFloat((totSc / totVol).toFixed(2)) : null;
    });

    const entraData = avgByType("Entraînement");
    const compData  = avgByType("Compétition");

    const datasets = [
      {
        label: "Entraînements", data: entraData,
        borderColor: PRIMARY, backgroundColor: "rgba(255,0,122,0.1)",
        pointBackgroundColor: PRIMARY,
        pointRadius: 5, pointHoverRadius: 7,
        tension: 0.35, fill: true, spanGaps: false,
      },
      {
        label: "Compétitions", data: compData,
        borderColor: BLUE, backgroundColor: "rgba(59,130,246,0.1)",
        pointBackgroundColor: BLUE,
        pointStyle: "rectRot",
        pointRadius: 6, pointHoverRadius: 8,
        borderDash: [6, 3], tension: 0.35, fill: true, spanGaps: false,
      },
    ];

    const labels = months.map(fmtMonth);

    const opts = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { font: { size: 11 }, color: "var(--text-dim)", maxRotation: 45, autoSkip: true, maxTicksLimit: 18 },
          grid: { color: "var(--border)" },
        },
        y: {
          beginAtZero: false,
          ticks: { font: { size: 11 }, color: "var(--text-dim)" },
          grid: { color: "var(--border)" },
          title: { display: true, text: "Moy. / flèche", color: "var(--text-dim)", font: { size: 11 } },
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
      c3Data: { labels, datasets },
      c3Opts: opts,
      hasC3: entraData.some(v => v !== null) || compData.some(v => v !== null),
    };
  }, [seances, filterSaison, c3Archer, c3Dist]);

  // ── Chart 4 : meilleur score moy. par distance — toutes saisons ──────────

  const distBarCharts = useMemo(() => {
    const allSaisons = [...new Set(
      seances.filter(s => s.date).map(s => getSaison(s.date))
    )].sort();

    return DIST_ONLY
      .map(dist => {
        const src = seances.filter(s =>
          s.distance === dist && s.date && s.archer &&
          getCompte(s) > 0 && (s.score ?? 0) > 0 &&
          (c4Archer === "Tous les archers" || s.archer === c4Archer)
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

        const baseOpts = nf === 60 ? DIST_BAR_OPTS_60 : DIST_BAR_OPTS_72;
        return { dist, nf, data: { labels: allSaisons.map(fmtSaison), datasets }, opts: baseOpts };
      })
      .filter(Boolean);
  }, [seances, c4Archer]);

  // ── Options Chart 1 & 2 ───────────────────────────────────────────────────

  const c1Opts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: { font: { size: 12 }, color: "var(--text-2)", boxWidth: 14, padding: 18 },
      },
      tooltip: {
        callbacks: {
          label: ctx => ctx.parsed.y != null ? `${ctx.dataset.label} : ${ctx.parsed.y.toFixed(2)} moy/fl.` : null,
        },
      },
    },
    scales: {
      x: {
        ticks: { font: { size: 10 }, color: "var(--text-dim)", maxRotation: 45, maxTicksLimit: 18 },
        grid: { color: "var(--border)" },
      },
      y: {
        beginAtZero: false,
        ticks: { font: { size: 11 }, color: "var(--text-dim)" },
        grid: { color: "var(--border)" },
        title: { display: true, text: "Moy. / flèche", color: "var(--text-dim)", font: { size: 11 } },
      },
    },
  };

  const c2Opts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: { font: { size: 12 }, color: "var(--text-2)", boxWidth: 14, padding: 18 },
      },
      tooltip: {
        callbacks: {
          label: ctx => ctx.parsed.y != null ? `${ctx.dataset.label} : ${ctx.parsed.y} pts` : null,
        },
      },
    },
    scales: {
      x: {
        ticks: { font: { size: 12 }, color: "var(--text-muted)" },
        grid: { color: "var(--border)" },
      },
      y: {
        beginAtZero: false,
        ticks: { font: { size: 11 }, color: "var(--text-dim)" },
        grid: { color: "var(--border)" },
        title: { display: true, text: "Meilleur score normalisé", color: "var(--text-dim)", font: { size: 11 } },
      },
    },
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (loading) return <div style={s.info}>Chargement…</div>;
  if (error)   return <div style={s.errMsg}>{error}</div>;

  return (
    <div style={s.page}>

      {/* ── Barre saison ── */}
      <div style={s.saisonBar}>
        <span style={s.saisonBarLabel}>Saison</span>
        <select value={filterSaison} onChange={e => setFilterSaison(e.target.value)} style={s.saisonSelect}>
          {saisonOptions.map(sn => <option key={sn}>{sn}</option>)}
        </select>
      </div>

      {/* ── Chart 1 : Progression par archer ── */}
      <div style={s.card}>
        <div style={s.cardHead}>
          <span style={s.cardTitle}>Progression par archer</span>
          <div style={s.cardFilters}>
            <FilterSelect label="Archer"   value={c1Archer} options={archerOptions} onChange={setC1Archer} />
            <FilterSelect label="Distance" value={c1Dist}   options={DISTANCES}     onChange={setC1Dist} />
          </div>
        </div>
        {hasC1 ? (
          <div style={{ height: 320, marginTop: "20px" }}>
            <Line data={{ labels: c1Labels, datasets: c1Datasets }} options={c1Opts} />
          </div>
        ) : (
          <div style={s.empty}>Aucune séance avec tir compté pour cette sélection.</div>
        )}
      </div>

      {/* ── Chart 3 : Score moyen par mois ── */}
      <div style={s.card}>
        <div style={s.cardHead}>
          <span style={s.cardTitle}>Score moyen par mois</span>
          <div style={s.cardFilters}>
            <FilterSelect label="Archer"   value={c3Archer} options={archerOptions} onChange={setC3Archer} />
            <FilterSelect label="Distance" value={c3Dist}   options={DISTANCES}     onChange={setC3Dist} />
          </div>
        </div>
        {hasC3 ? (
          <div style={{ height: 320, marginTop: "20px" }}>
            <Line data={c3Data} options={c3Opts} />
          </div>
        ) : (
          <div style={s.empty}>Aucune séance avec tir compté pour cette sélection.</div>
        )}
      </div>

      {/* ── Chart 2 : Évolution des records par saison ── */}
      <div style={s.card}>
        <div style={s.cardHead}>
          <span style={s.cardTitle}>Évolution des records par saison</span>
          <div style={s.cardFilters}>
            <FilterSelect label="Archer"   value={c2Archer} options={archerOptions} onChange={setC2Archer} />
            <FilterSelect label="Distance" value={c2Dist}   options={DISTANCES}     onChange={setC2Dist} />
            <FilterSelect label="Type"     value={c2Type}   options={GRAPH_TYPES}   onChange={setC2Type} />
          </div>
        </div>
        {hasC2 ? (
          <div style={{ height: 320, marginTop: "20px" }}>
            <Line data={{ labels: c2Labels, datasets: c2Datasets }} options={c2Opts} />
          </div>
        ) : (
          <div style={s.empty}>Aucune donnée pour cette sélection.</div>
        )}
      </div>

      {/* ── Chart 4 : Meilleur score moy. par distance — toutes saisons ── */}
      {distBarCharts.length > 0 && (
        <div style={s.sectionCard}>
          <div style={s.sectionCardHeader}>
            <span style={s.cardTitle}>Meilleur score moy. par distance — toutes saisons</span>
            <div style={{ marginLeft: "auto" }}>
              <FilterSelect label="Archer" value={c4Archer} options={archerOptions} onChange={setC4Archer} />
            </div>
            <span style={s.hint}>Moyenne top 3 · ×60 (5m/18m) · ×72 autres</span>
          </div>
          <div style={s.distGrid}>
            {distBarCharts.map(({ dist, nf, data, opts }) => (
              <div key={dist} style={s.distCard}>
                <div style={s.distCardTitle}>
                  {dist}{" "}
                  <span style={{ color: "var(--text-dim)", fontWeight: "400", fontSize: "12px" }}>
                    (max {nf * 10} pts / {nf} fl.)
                  </span>
                </div>
                <div style={{ height: 260 }}>
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

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = {
  page: { display: "flex", flexDirection: "column", gap: "16px" },

  saisonBar: {
    display: "flex", alignItems: "center", gap: "16px",
    backgroundColor: "var(--blue-deep)", borderRadius: "12px",
    padding: "14px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
    flexWrap: "wrap",
  },
  saisonBarLabel: {
    fontSize: "11px", fontWeight: "700", color: "var(--blue-dark)",
    textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap",
  },
  saisonSelect: {
    padding: "7px 14px", borderRadius: "8px",
    border: "1.5px solid var(--blue-dark)", backgroundColor: "var(--blue-deep)",
    color: "var(--blue-soft)", fontSize: "14px", fontWeight: "600",
    cursor: "pointer", outline: "none", fontFamily: "inherit",
  },

  card: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)",
    padding: "20px 24px 28px",
  },
  cardHead:    { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "12px" },
  cardTitle:   { fontSize: "14px", fontWeight: "600", color: "var(--text-2)", paddingTop: "5px" },
  cardFilters: { display: "flex", gap: "12px", flexWrap: "wrap" },

  filterWrap:  { display: "flex", alignItems: "center", gap: "8px" },
  filterLabel: {
    fontSize: "12px", fontWeight: "600", color: "var(--text-muted)",
    textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap",
  },

  sectionCard: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)",
    padding: "20px 24px 24px",
    display: "flex", flexDirection: "column", gap: "20px",
  },
  sectionCardHeader: {
    display: "flex", alignItems: "center", gap: "10px",
    paddingBottom: "16px", borderBottom: "var(--border)",
    flexWrap: "wrap",
  },
  hint: { fontSize: "11px", color: "var(--text-dim)", fontStyle: "italic" },
  distGrid: { display: "flex", flexDirection: "column", gap: "16px" },
  distCard: {
    backgroundColor: "var(--surface-sub)", borderRadius: "10px",
    border: "1px solid #242424", padding: "16px 20px 20px",
  },
  distCardTitle: { fontSize: "13px", fontWeight: "600", color: "var(--text-2)", marginBottom: "14px" },

  empty: { padding: "40px", textAlign: "center", color: "var(--text-dim)", fontSize: "14px" },
  info:  { color: "var(--text-muted)", fontSize: "14px" },
  errMsg: {
    color: PRIMARY, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "rgba(255,0,122,0.1)", borderRadius: "8px", border: `1px solid ${PRIMARY}`,
  },
};
