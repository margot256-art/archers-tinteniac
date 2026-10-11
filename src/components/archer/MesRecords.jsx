import { useState, useMemo } from "react";
import { useSeances } from "../../hooks/useSeances";
import { PRIMARY, BLUE, getCompte, getSaison, CURRENT_SAISON, fmtDateCourte } from "../../utils/seances";
import { scoreEpreuve, scoreSerie, maxEpreuve, maxSerie } from "../../utils/records";
import FilterSelect from "../shared/FilterSelect";
import * as ui from "./styleArcher";

const DIST_ORDER = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];

// ── Section entr. / comp. ─────────────────────────────────────────────────────

function RecordSection({ type, color, bgColor, best, max, history, serie, maxS }) {
  const [open, setOpen] = useState(false);
  const pct = best ? Math.round(best.score / max * 100) : 0;
  return (
    <div style={{ ...s.section, backgroundColor: bgColor }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={s.type}><span style={ui.point(color)} />{type}</span>
        {history.length > 1 && (
          <button
            onClick={() => setOpen(o => !o)}
            style={{ ...s.historyBtn, color }}
          >
            {open ? "▲" : "▼"} {history.length} records
          </button>
        )}
      </div>

      {best ? (
        <>
          <div style={s.scoreRow}>
            <span style={{ ...s.bigScore, color }}>{best.score}</span>
            <span style={s.scoreCtx}>/{max} ({pct}%)</span>
          </div>
          <div style={s.meta}>
            {fmtDateCourte(best.date)}{best.lieu ? ` · ${best.lieu}` : ""}
          </div>
          <div style={s.barTrack}>
            <div style={{ ...s.barFill, width: `${pct}%`, backgroundColor: color }} />
          </div>
        </>
      ) : (
        <div style={s.noData}>{serie ? "Aucune épreuve complète (2 séries)" : "Aucune séance"}</div>
      )}

      {serie && (
        <div style={s.serieRecord}>
          <span style={{ ...s.serieLabel, color }}>Série record</span>
          <span style={s.serieScore}>{serie.score}<span style={s.serieMax}>/{maxS}</span></span>
          <span style={s.serieDate}>{fmtDateCourte(serie.date)}{serie.lieu ? ` · ${serie.lieu}` : ""}</span>
        </div>
      )}

      {open && (
        <div style={s.historyList}>
          {[...history].reverse().map((h, i) => (
            <div key={h.date} style={{ ...s.historyRow, ...(i === 0 ? s.historyRowCurrent : {}) }}>
              <span style={{ ...s.historyScore, color: i === 0 ? color : "var(--text-2)" }}>
                {h.score}
              </span>
              <span style={s.historyDate}>{fmtDateCourte(h.date)}{h.lieu ? ` · ${h.lieu}` : ""}</span>
              {h.delta != null && (
                <span style={{ ...s.historyDelta, color }}>+{h.delta}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function MesRecords() {
  const { seances, loading, error } = useSeances();
  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);

  const saisons = useMemo(() => {
    const set = new Set(seances.filter(s => s.date).map(s => getSaison(s.date)));
    return ["Toutes", ...[...set].sort((a, b) => b.localeCompare(a))];
  }, [seances]);

  const toutesLesSaisons = filterSaison === "Toutes";
  const subtitle = toutesLesSaisons
    ? "Meilleurs scores personnels — toutes saisons confondues"
    : (() => { const [y1, y2] = filterSaison.split("/"); return `Records de la saison ${filterSaison} (1 sept. ${y1} — 31 août ${y2})`; })();

  const records = useMemo(() => {
    const src = seances.filter(s => {
      if (!s.date) return false;
      const okSaison = toutesLesSaisons || getSaison(s.date) === filterSaison;
      return okSaison && getCompte(s) > 0 && (s.score ?? 0) > 0;
    });

    return DIST_ORDER.map(dist => {
      const distSrc = src.filter(s => s.distance === dist);
      if (!distSrc.length) return null;

      const max  = maxEpreuve(dist);
      const maxS = maxSerie(dist);

      // Meilleur résultat d'un type selon une règle (épreuve complète ou série).
      const getBest = (type, calcul) => {
        let best = null;
        for (const s of distSrc.filter(x => x.type === type)) {
          const score = calcul(s);
          if (score != null && (!best || score > best.score)) {
            best = { score, date: s.date, lieu: s.lieu || null };
          }
        }
        return best;
      };

      const getHistory = (type) => {
        const hits = distSrc
          .filter(s => s.type === type && scoreEpreuve(s) != null)
          .map(s => ({ score: scoreEpreuve(s), date: s.date, lieu: s.lieu || null }))
          .sort((a, b) => a.date.localeCompare(b.date));
        const history = [];
        let prev = 0;
        for (const h of hits) {
          if (h.score > prev) {
            history.push({ ...h, delta: prev > 0 ? h.score - prev : null });
            prev = h.score;
          }
        }
        return history;
      };

      const entr = getBest("Entraînement", scoreEpreuve);
      const comp = getBest("Compétition", scoreEpreuve);
      const entrSerie = getBest("Entraînement", scoreSerie);
      const compSerie = getBest("Compétition", scoreSerie);
      if (!entr && !comp && !entrSerie && !compSerie) return null;

      return {
        dist, max, maxS, entr, comp, entrSerie, compSerie,
        entrHistory: getHistory("Entraînement"), compHistory: getHistory("Compétition"),
      };
    }).filter(Boolean);
  }, [seances, filterSaison]);

  if (loading) return <div style={s.info}>Chargement…</div>;
  if (error)   return <div style={s.errMsg}>{error}</div>;

  return (
    <div style={s.page}>

      <div style={ui.filtres}>
        <FilterSelect label="Saison" value={filterSaison} options={saisons} onChange={setFilterSaison} />
        <span style={ui.sousTitre}>{subtitle}</span>
      </div>

      {/* ── Grille de cartes ── */}
      {records.length === 0 ? (
        <div style={s.empty}>{toutesLesSaisons ? "Aucune séance avec tir compté." : "Aucune séance avec tir compté pour cette saison."}</div>
      ) : (
        <div style={s.grid}>
          {records.map(({ dist, max, maxS, entr, comp, entrSerie, compSerie, entrHistory, compHistory }) => (
            <div key={dist} style={s.card}>
              <div style={s.cardHead}>
                <span style={s.cardDistVal}>{dist}</span>
                <span style={ui.sousTitre}>sur {max}</span>
              </div>

              <RecordSection
                type="Entraînement"
                color={PRIMARY}
                bgColor="var(--pink-soft)"
                best={entr}
                max={max}
                history={entrHistory}
                serie={entrSerie}
                maxS={maxS}
              />
              <RecordSection
                type="Compétition"
                color={BLUE}
                bgColor="var(--blue-soft)"
                best={comp}
                max={max}
                history={compHistory}
                serie={compSerie}
                maxS={maxS}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  page: { ...ui.page, gap: "18px" },

  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "14px" },

  card: { ...ui.carte, padding: "16px 18px", display: "flex", flexDirection: "column", gap: "12px" },
  cardHead: { display: "flex", alignItems: "baseline", gap: "8px", paddingBottom: "10px", borderBottom: "1px solid var(--border)" },
  cardDistVal: { fontFamily: "var(--display)", fontSize: "19px", fontWeight: "600", color: "var(--text)" },

  section: { borderRadius: "10px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" },
  type: { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "600", color: "var(--text-2)" },

  scoreRow: { display: "flex", alignItems: "baseline", gap: "6px" },
  bigScore: { fontFamily: "var(--display)", fontSize: "34px", fontWeight: "600", lineHeight: 1 },
  scoreCtx: { fontSize: "14px", color: "var(--text-muted)", fontWeight: "500" },
  meta: { fontSize: "12px", color: "var(--text-muted)" },

  barTrack: { height: "6px", borderRadius: "3px", backgroundColor: "var(--border)", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: "3px", transition: "width 0.4s ease" },

  noData: { fontSize: "13px", color: "var(--text-muted)" },

  serieRecord: {
    display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap",
    borderTop: "1px solid var(--border)", paddingTop: "8px", marginTop: "4px",
  },
  serieLabel: { fontSize: "12px", fontWeight: "700" },
  serieScore: { fontFamily: "var(--display)", fontSize: "17px", fontWeight: "600", color: "var(--text)" },
  serieMax:   { fontFamily: "inherit", fontSize: "12px", fontWeight: "600", color: "var(--text-muted)" },
  serieDate:  { fontSize: "12px", color: "var(--text-muted)" },

  historyBtn: {
    backgroundColor: "transparent", border: "none", cursor: "pointer",
    fontSize: "12px", fontWeight: "700", fontFamily: "inherit", padding: "2px 0",
  },
  historyList: {
    display: "flex", flexDirection: "column", gap: "1px",
    borderTop: "1px solid var(--border)", marginTop: "4px", paddingTop: "8px",
  },
  historyRow: { display: "flex", alignItems: "baseline", gap: "8px", padding: "5px 0", borderBottom: "1px solid var(--border)" },
  historyRowCurrent: { fontWeight: "700" },
  historyScore: { fontSize: "15px", fontWeight: "700", minWidth: "36px", fontVariantNumeric: "tabular-nums" },
  historyDate: { fontSize: "12px", color: "var(--text-muted)", flex: 1 },
  historyDelta: { fontSize: "12px", fontWeight: "700" },

  info: ui.info,
  errMsg: ui.erreur,
  empty: ui.vide,
};
