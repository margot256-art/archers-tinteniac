import { useState, useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useAllSeances } from "../../hooks/useAllSeances";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

// ── Constants ──────────────────────────────────────────────────────────────────

const PRIMARY = "#FF007A";

const ARCHER_COLORS = [
  "#6366f1", "#22d3ee", "#a3e635", "#fb923c", "#e879f9",
  "#34d399", "#f472b6", "#60a5fa", "#fbbf24", "#a78bfa",
  "#f43f5e", "#0ea5e9", "#84cc16",
];

const DISTANCES   = ["Toutes distances", "5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const GRAPH_TYPES = ["Entr. + Comp.", "Entraînement", "Compétition"];

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmtDate    = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const getSaison  = (iso) => { const [y, m] = iso.split("-").map(Number); return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`; };
const normFactor = (d)   => (d === "5m" || d === "18m") ? 60 : 72;
const getCompte  = (s)   => s.compte ?? s.volumeCompte ?? 0;

function getCurrentSaison() {
  const d = new Date(); const m = d.getMonth() + 1; const y = d.getFullYear();
  return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

const CURRENT_SAISON = getCurrentSaison();

// ── Sub-components ─────────────────────────────────────────────────────────────

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

// ── Main component ─────────────────────────────────────────────────────────────

export default function CoachGraph() {
  const { seances, loading, error } = useAllSeances();

  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);

  const [c1Archer, setC1Archer] = useState("Tous les archers");
  const [c1Dist,   setC1Dist]   = useState("Toutes distances");

  const [c2Archer, setC2Archer] = useState("Tous les archers");
  const [c2Dist,   setC2Dist]   = useState("Toutes distances");
  const [c2Type,   setC2Type]   = useState("Entr. + Comp.");

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
        label:               archer,
        data,
        borderColor:         color,
        backgroundColor:     color + "22",
        pointBackgroundColor: color,
        pointRadius:         4,
        pointHoverRadius:    6,
        tension:             0.3,
        spanGaps:            true,
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
        label:               archer,
        data,
        borderColor:         color,
        backgroundColor:     color + "22",
        pointBackgroundColor: color,
        pointRadius:         5,
        pointHoverRadius:    7,
        tension:             0.3,
        spanGaps:            true,
      };
    });

    return { c2Labels: saisons, c2Datasets: datasets };
  }, [seances, c2Archer, c2Dist, c2Type]);

  const hasC2 = c2Datasets.some(d => d.data.some(v => v !== null));

  // ── Chart.js options ──────────────────────────────────────────────────────

  const c1Opts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: { font: { size: 12 }, color: "#d0d0d0", boxWidth: 14, padding: 18 },
      },
      tooltip: {
        callbacks: {
          label: ctx => ctx.parsed.y != null ? `${ctx.dataset.label} : ${ctx.parsed.y.toFixed(2)} moy/fl.` : null,
        },
      },
    },
    scales: {
      x: {
        ticks: { font: { size: 10 }, color: "#666", maxRotation: 45, maxTicksLimit: 18 },
        grid: { color: "#2a2a2a" },
      },
      y: {
        beginAtZero: false,
        ticks: { font: { size: 11 }, color: "#666" },
        grid: { color: "#2a2a2a" },
        title: { display: true, text: "Moy. / flèche", color: "#555", font: { size: 11 } },
      },
    },
  };

  const c2Opts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: { font: { size: 12 }, color: "#d0d0d0", boxWidth: 14, padding: 18 },
      },
      tooltip: {
        callbacks: {
          label: ctx => ctx.parsed.y != null ? `${ctx.dataset.label} : ${ctx.parsed.y} pts` : null,
        },
      },
    },
    scales: {
      x: {
        ticks: { font: { size: 12 }, color: "#777" },
        grid: { color: "#2a2a2a" },
      },
      y: {
        beginAtZero: false,
        ticks: { font: { size: 11 }, color: "#666" },
        grid: { color: "#2a2a2a" },
        title: { display: true, text: "Meilleur score normalisé", color: "#555", font: { size: 11 } },
      },
    },
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div style={s.info}>Chargement…</div>;
  if (error)   return <div style={s.errMsg}>{error}</div>;

  return (
    <div style={s.page}>

      {/* ── Season bar ── */}
      <div style={s.saisonBar}>
        <span style={s.saisonBarLabel}>Saison</span>
        <select
          value={filterSaison}
          onChange={e => setFilterSaison(e.target.value)}
          style={s.saisonSelect}
        >
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
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = {
  page: { display: "flex", flexDirection: "column", gap: "16px" },

  saisonBar: {
    display: "flex", alignItems: "center", gap: "16px",
    backgroundColor: "#1a2744",
    borderRadius: "12px",
    padding: "14px 20px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
    flexWrap: "wrap",
  },
  saisonBarLabel: {
    fontSize: "11px", fontWeight: "700", color: "#5b7ab8",
    textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap",
  },
  saisonSelect: {
    padding: "7px 14px", borderRadius: "8px",
    border: "1.5px solid #2e4a7a",
    backgroundColor: "#152035",
    color: "#c8daf5",
    fontSize: "14px", fontWeight: "600",
    cursor: "pointer", outline: "none",
    fontFamily: "inherit",
  },

  card: {
    backgroundColor: "#1a1a1a", borderRadius: "12px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
    padding: "20px 24px 28px",
  },
  cardHead: {
    display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "12px",
  },
  cardTitle: { fontSize: "14px", fontWeight: "600", color: "#d0d0d0", paddingTop: "5px" },
  cardFilters: { display: "flex", gap: "12px", flexWrap: "wrap" },

  filterWrap: { display: "flex", alignItems: "center", gap: "8px" },
  filterLabel: {
    fontSize: "12px", fontWeight: "600", color: "#777",
    textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap",
  },
  filterSelect: {
    padding: "6px 10px", border: "1.5px solid #2e2e2e", borderRadius: "7px",
    fontSize: "13px", color: "#e8e8e8", backgroundColor: "#272727",
    outline: "none", fontFamily: "inherit", cursor: "pointer",
  },

  empty: { padding: "40px", textAlign: "center", color: "#555", fontSize: "14px" },
  info:  { color: "#777", fontSize: "14px" },
  errMsg: {
    color: PRIMARY, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "rgba(255,0,122,0.1)", borderRadius: "8px", border: `1px solid ${PRIMARY}`,
  },
};
