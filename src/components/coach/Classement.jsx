import { useState, useMemo } from "react";
import { useAllSeances } from "../../hooks/useAllSeances";
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

// ── Constants ──────────────────────────────────────────────────────────────────

const PRIMARY = "#FF007A";
const ORANGE  = "#f97316";

const DISTANCES   = ["Toutes", "5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const TYPES       = ["Tous", "Entraînement", "Compétition"];
const GRAPH_TYPES = ["Entr. + Comp.", "Entraînement", "Compétition"];

const ARCHER_COLORS = [
  "#6366f1", "#22d3ee", "#a3e635", "#fb923c", "#e879f9",
  "#34d399", "#f472b6", "#60a5fa", "#fbbf24", "#a78bfa",
  "#f43f5e", "#0ea5e9", "#84cc16",
];

const MOIS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const getSaison  = (iso) => { const [y, m] = iso.split("-").map(Number); return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`; };
const normFactor = (d)   => (d === "5m" || d === "18m") ? 60 : 72;
const getCompte  = (s)   => s.compte ?? s.volumeCompte ?? 0;
const sumFleches = (s)   => s.totalFleches != null
  ? s.totalFleches
  : (s.paille ?? s.volumePaille ?? 0) + (s.blason ?? s.volumeBlason ?? 0) + getCompte(s);

function getCurrentSaison() {
  const d = new Date(); const m = d.getMonth() + 1; const y = d.getFullYear();
  return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

function stdDev(vals) {
  if (vals.length < 2) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / vals.length);
}

function ordinal(n) {
  if (n === 1) return "1er";
  if (n === 2) return "2e";
  if (n === 3) return "3e";
  return `${n}`;
}

function regulariteLabel(sigma) {
  if (sigma < 0.5) return "Très régulier";
  if (sigma < 1.0) return "Régulier";
  return "Irrégulier";
}

const CURRENT_SAISON = getCurrentSaison();

const RANK_STYLE = {
  1: { backgroundColor: PRIMARY,   color: "#fff" },
  2: { backgroundColor: "#8e8e8e", color: "#fff" },
  3: { backgroundColor: "#b06e30", color: "#fff" },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function RangBadge({ rang }) {
  const extra = RANK_STYLE[rang] ?? { backgroundColor: "#252525", color: "#666" };
  return <span style={{ ...s.rankBadge, ...extra }}>{ordinal(rang)}</span>;
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label style={s.filterWrap}>
      <span style={s.filterLabel}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={s.filterSelect}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Classement() {
  const { seances, loading, error } = useAllSeances();

  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);
  const [filterPeriod, setFilterPeriod] = useState("Toute la saison");
  const [filterDist,   setFilterDist]   = useState("Toutes");
  const [filterType,   setFilterType]   = useState("Tous");

  const [graphArcher, setGraphArcher] = useState("Tous les archers");
  const [graphDist,   setGraphDist]   = useState("Toutes distances");
  const [graphType,   setGraphType]   = useState("Entr. + Comp.");

  const saisonOptions = useMemo(() => {
    const set = new Set(seances.filter(s => s.date).map(s => getSaison(s.date)));
    set.add(CURRENT_SAISON);
    return ["Toutes", ...[...set].sort().reverse()];
  }, [seances]);

  const periodOptions = useMemo(() => {
    if (filterSaison === "Toutes") return ["Toute la saison"];
    const months = new Set();
    seances
      .filter(s => s.date && getSaison(s.date) === filterSaison)
      .forEach(s => {
        const [y, m] = s.date.split("-").map(Number);
        months.add(`${y}-${String(m).padStart(2, "0")}`);
      });
    const labels = [...months].sort().reverse().map(ym => {
      const [y, m] = ym.split("-").map(Number);
      return `${MOIS_FR[m - 1]} ${y}`;
    });
    return ["Toute la saison", ...labels];
  }, [seances, filterSaison]);

  const rows = useMemo(() => {
    const src = seances.filter(s => {
      if (!s.date || !s.archer) return false;
      if (filterSaison !== "Toutes" && getSaison(s.date) !== filterSaison) return false;
      if (filterPeriod !== "Toute la saison") {
        const parts = filterPeriod.split(" ");
        const mIdx  = MOIS_FR.indexOf(parts[0]);
        const ym    = `${parts[1]}-${String(mIdx + 1).padStart(2, "0")}`;
        if (!s.date.startsWith(ym)) return false;
      }
      if (filterDist !== "Toutes" && s.distance !== filterDist) return false;
      if (filterType !== "Tous"   && s.type     !== filterType)  return false;
      return true;
    });

    const map = {};
    for (const sess of src) {
      if (!map[sess.archer]) map[sess.archer] = { archer: sess.archer, sessions: [] };
      map[sess.archer].sessions.push(sess);
    }

    const computed = Object.values(map).map(({ archer, sessions }) => {
      const nbSeances    = sessions.length;
      const totalFleches = sessions.reduce((n, s) => n + sumFleches(s), 0);
      const withCompte   = sessions.filter(s => getCompte(s) > 0 && (s.score ?? 0) > 0);
      const moyennes     = withCompte.map(s => s.score / getCompte(s));
      const avgMoy       = moyennes.length
        ? moyennes.reduce((a, b) => a + b, 0) / moyennes.length
        : null;
      const scoreMoy     = withCompte.length
        ? Math.round(withCompte.reduce((sum, s) => sum + (s.score / getCompte(s)) * normFactor(s.distance), 0) / withCompte.length)
        : null;
      let bestNorm = null;
      for (const s of withCompte) {
        const n = Math.round((s.score / getCompte(s)) * normFactor(s.distance));
        if (bestNorm === null || n > bestNorm) bestNorm = n;
      }
      return { archer, nbSeances, totalFleches, avgMoy, scoreMoy, sigma: stdDev(moyennes), bestNorm };
    });

    computed.sort((a, b) => {
      const ma = a.avgMoy ?? -Infinity;
      const mb = b.avgMoy ?? -Infinity;
      return mb !== ma ? mb - ma : a.archer.localeCompare(b.archer);
    });

    for (let i = 0; i < computed.length; i++) {
      computed[i].rang = i > 0 && computed[i].avgMoy === computed[i - 1].avgMoy
        ? computed[i - 1].rang
        : i + 1;
    }

    return computed;
  }, [seances, filterSaison, filterPeriod, filterDist, filterType]);

  const allArchers = useMemo(() => {
    const set = new Set(seances.filter(s => s.archer).map(s => s.archer));
    return ["Tous les archers", ...[...set].sort()];
  }, [seances]);

  const graphDistOptions = useMemo(() => {
    const set = new Set(seances.filter(s => s.distance).map(s => s.distance));
    const ordered = DISTANCES.slice(1).filter(d => set.has(d));
    return ["Toutes distances", ...ordered];
  }, [seances]);

  const { chartData, chartOptions } = useMemo(() => {
    const saisonsSet = new Set(seances.filter(s => s.date).map(s => getSaison(s.date)));
    const allSaisons = [...saisonsSet].sort();

    const archerList = graphArcher === "Tous les archers"
      ? [...new Set(seances.filter(s => s.archer).map(s => s.archer))].sort()
      : [graphArcher];

    const datasets = archerList.map((archer, idx) => {
      const color = ARCHER_COLORS[idx % ARCHER_COLORS.length];
      const data  = allSaisons.map(saison => {
        const src = seances.filter(s => {
          if (!s.date || s.archer !== archer) return false;
          if (getSaison(s.date) !== saison)   return false;
          if (graphDist !== "Toutes distances" && s.distance !== graphDist) return false;
          if (graphType === "Entraînement" && s.type !== "Entraînement") return false;
          if (graphType === "Compétition"  && s.type !== "Compétition")  return false;
          return getCompte(s) > 0 && (s.score ?? 0) > 0;
        });
        if (!src.length) return null;
        return Math.max(...src.map(s => Math.round((s.score / getCompte(s)) * normFactor(s.distance))));
      });
      return {
        label: archer,
        data,
        borderColor: color,
        backgroundColor: color + "22",
        pointBackgroundColor: color,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        spanGaps: true,
      };
    });

    const chartData = { labels: allSaisons, datasets };

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            font: { size: 12 }, color: "#d0d0d0",
            boxWidth: 14, padding: 18,
          },
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

    return { chartData, chartOptions };
  }, [seances, graphArcher, graphDist, graphType]);

  const hasGraphData = chartData.datasets.some(ds => ds.data.some(v => v !== null));

  const handleExport = () => {
    const headers = ["Rang", "Archer", "Séances", "Total fl.", "Moy./fl.", "Score moy.", "Régularité σ", "Meilleur score"];
    const csvRows = rows.map(r => [
      ordinal(r.rang), r.archer, r.nbSeances, r.totalFleches,
      r.avgMoy  != null ? r.avgMoy.toFixed(2)  : "",
      r.scoreMoy != null ? r.scoreMoy : "",
      r.sigma   != null ? r.sigma.toFixed(2)   : "",
      r.bestNorm ?? "",
    ].join(";"));
    const csv  = [headers.join(";"), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `classement_${filterSaison.replace("/", "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={s.page}>

      {/* ── Season bar ── */}
      <div style={s.saisonBar}>
        <span style={s.saisonBarLabel}>Saison</span>
        <select
          value={filterSaison}
          onChange={e => { setFilterSaison(e.target.value); setFilterPeriod("Toute la saison"); }}
          style={s.saisonSelect}
        >
          {saisonOptions.map(sn => <option key={sn}>{sn}</option>)}
        </select>
      </div>

      {/* ── Filters row ── */}
      <div style={s.filtersRow}>
        <FilterSelect label="Période"  value={filterPeriod} options={periodOptions} onChange={setFilterPeriod} />
        <FilterSelect label="Distance" value={filterDist}   options={DISTANCES}     onChange={setFilterDist} />
        <FilterSelect label="Type"     value={filterType}   options={TYPES}         onChange={setFilterType} />
        <button style={s.exportBtn} onClick={handleExport}>Exporter</button>
      </div>

      {loading && <div style={s.info}>Chargement…</div>}
      {error   && <div style={s.errMsg}>{error}</div>}

      {/* ── Ranking table ── */}
      {!loading && !error && (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Rang</th>
                <th style={s.th}>Archer</th>
                <th style={{ ...s.th, ...s.thR }}>Séances</th>
                <th style={{ ...s.th, ...s.thR }}>Total fl.</th>
                <th style={{ ...s.th, ...s.thR }}>Moy./fl.</th>
                <th style={{ ...s.th, ...s.thR }}>Score moy.</th>
                <th style={{ ...s.th, ...s.thR }}>Régularité</th>
                <th style={{ ...s.th, ...s.thR }}>Meilleur score</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} style={s.empty}>Aucune séance pour cette sélection.</td></tr>
              ) : rows.map(r => {
                const top = r.rang <= 3;
                return (
                  <tr key={r.archer} style={{ ...s.tr, ...(top ? s.trTop : {}) }}>
                    <td style={s.td}><RangBadge rang={r.rang} /></td>
                    <td style={{ ...s.td, fontWeight: top ? "700" : "400", color: top ? "#fff" : "#d0d0d0" }}>
                      {r.archer}
                    </td>
                    <td style={s.tdR}>{r.nbSeances}</td>
                    <td style={s.tdR}>{r.totalFleches.toLocaleString("fr-FR")}</td>
                    <td style={{ ...s.tdR, color: PRIMARY, fontWeight: "700" }}>
                      {r.avgMoy != null ? r.avgMoy.toFixed(2) : "—"}
                    </td>
                    <td style={s.tdR}>
                      {r.scoreMoy != null ? r.scoreMoy : "—"}
                    </td>
                    <td style={s.tdR}>
                      {r.sigma != null ? (
                        <span style={{ color: ORANGE, fontWeight: "600" }}>
                          {r.sigma.toFixed(2)}{" "}
                          <span style={s.regTag}>{regulariteLabel(r.sigma)}</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ ...s.tdR, fontWeight: "600", color: "#e8e8e8" }}>
                      {r.bestNorm ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Evolution chart ── */}
      {!loading && !error && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <span style={s.cardTitle}>Évolution des records par saison</span>
          </div>
          <div style={s.graphFilters}>
            <FilterSelect label="Archers"  value={graphArcher} options={allArchers}      onChange={setGraphArcher} />
            <FilterSelect label="Distance" value={graphDist}   options={graphDistOptions} onChange={setGraphDist} />
            <FilterSelect label="Type"     value={graphType}   options={GRAPH_TYPES}      onChange={setGraphType} />
          </div>
          {hasGraphData ? (
            <div style={{ height: 320, marginTop: "20px" }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          ) : (
            <div style={s.empty}>Aucune donnée pour cette sélection.</div>
          )}
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
    backgroundColor: "#243660", color: "#e0eaf8",
    border: "1px solid #2e4a80", borderRadius: "7px",
    padding: "7px 12px", fontSize: "14px", fontWeight: "600",
    outline: "none", fontFamily: "inherit", cursor: "pointer",
  },

  filtersRow: {
    display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap",
    backgroundColor: "#1a1a1a", borderRadius: "10px",
    padding: "12px 16px",
    boxShadow: "0 1px 6px rgba(0,0,0,0.2)",
  },
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
  exportBtn: {
    marginLeft: "auto",
    padding: "7px 16px", borderRadius: "8px",
    border: "1.5px solid #2e2e2e",
    backgroundColor: "#252525", color: "#c0c0c0",
    fontSize: "12px", fontWeight: "600", cursor: "pointer",
    fontFamily: "inherit", letterSpacing: "0.03em",
    whiteSpace: "nowrap",
  },

  tableWrap: {
    backgroundColor: "#1a1a1a", borderRadius: "12px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.3)", overflowX: "auto",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th: {
    padding: "11px 14px", textAlign: "left",
    fontSize: "11px", fontWeight: "700", color: "#666",
    textTransform: "uppercase", letterSpacing: "0.07em",
    borderBottom: "1px solid #252525", whiteSpace: "nowrap",
    backgroundColor: "#1e1e1e",
  },
  thR:   { textAlign: "right" },
  tr:    { borderBottom: "1px solid #1e1e1e", transition: "background 0.1s" },
  trTop: { backgroundColor: "rgba(255,0,122,0.07)" },
  td:    { padding: "11px 14px", color: "#d0d0d0", whiteSpace: "nowrap" },
  tdR:   { padding: "11px 14px", textAlign: "right", color: "#ccc", whiteSpace: "nowrap" },
  rankBadge: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: "36px", height: "24px", borderRadius: "12px",
    fontSize: "12px", fontWeight: "700", padding: "0 8px",
  },
  regTag: {
    fontSize: "10px", fontWeight: "600",
    backgroundColor: "rgba(249,115,22,0.12)",
    borderRadius: "4px", padding: "1px 5px",
    color: ORANGE,
  },
  empty:  { padding: "40px", textAlign: "center", color: "#555", fontSize: "14px" },
  info:   { color: "#777", fontSize: "14px" },
  errMsg: {
    color: PRIMARY, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "rgba(255,0,122,0.1)", borderRadius: "8px", border: `1px solid ${PRIMARY}`,
  },

  card: {
    backgroundColor: "#1a1a1a", borderRadius: "12px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
    padding: "20px 24px 28px",
  },
  cardHead: { display: "flex", alignItems: "center", marginBottom: "16px" },
  cardTitle: { fontSize: "14px", fontWeight: "600", color: "#d0d0d0" },
  graphFilters: { display: "flex", gap: "16px", flexWrap: "wrap" },
};
