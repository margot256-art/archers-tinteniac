import { useMemo } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useSeances } from "../../hooks/useSeances";
import { useObjectif } from "../../hooks/useObjectif";
import { PRIMARY as PINK, getPaille, getBlason, getCompte, normFactor, getSaison, fmtYM, CURRENT_SAISON } from "../../utils/seances";
import { lireSeanceEnCours } from "../../utils/seanceEnCours";

const JOURS_30 = 30 * 24 * 60 * 60 * 1000;
const DIST_ORDER = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];

const todayYM = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function Accueil({ onReprendre, onNouvelleSeance }) {
  const { user } = useAuth();
  const { seances, loading, error } = useSeances();
  const rawObjectif = useObjectif();

  const enCours = lireSeanceEnCours(user?.id);

  const seuil30 = useMemo(() => {
    const d = new Date();
    d.setTime(d.getTime() - JOURS_30);
    return d.toISOString().split("T")[0];
  }, []);

  const currentYM = useMemo(() => todayYM(), []);

  const volEntr = useMemo(() => {
    if (!rawObjectif) return null;
    if (rawObjectif.saisons?.[CURRENT_SAISON]) return rawObjectif.saisons[CURRENT_SAISON].volEntr ?? 0;
    if (rawObjectif.volEntr != null) return rawObjectif.volEntr;
    return null;
  }, [rawObjectif]);

  const volumeMois = useMemo(() =>
    seances
      .filter((s) => s.type === "Entraînement" && s.date?.startsWith(currentYM))
      .reduce((sum, s) => sum + getPaille(s) + getBlason(s) + getCompte(s), 0),
    [seances, currentYM]
  );

  const pctVolume = volEntr > 0 ? Math.min(100, Math.round((volumeMois / volEntr) * 100)) : 0;
  const gaugeColor = pctVolume >= 100 ? PINK : pctVolume >= 80 ? "var(--good)" : pctVolume >= 50 ? "var(--warn)" : "var(--bad)";

  const { fleches30, tirsComptes30, moyenne30 } = useMemo(() => {
    const recentes = seances.filter((s) => s.date && s.date >= seuil30);
    const fleches30 = recentes.reduce((n, s) => n + getPaille(s) + getBlason(s) + getCompte(s), 0);
    const scorees   = recentes.filter((s) => getCompte(s) > 0 && (s.score ?? 0) > 0);
    const totSc = scorees.reduce((n, s) => n + s.score, 0);
    const totFl = scorees.reduce((n, s) => n + getCompte(s), 0);
    return {
      fleches30,
      tirsComptes30: scorees.length,
      moyenne30: totFl > 0 ? totSc / totFl : null,
    };
  }, [seances, seuil30]);

  const parDistance = useMemo(() => {
    const saisonSeances = seances.filter((s) => s.date && getSaison(s.date) === CURRENT_SAISON);
    const map = {};
    for (const s of saisonSeances) {
      if (!s.distance) continue;
      if (!map[s.distance]) map[s.distance] = { nbSeances: 0, fleches: 0, scoreSum: 0, compteSum: 0 };
      const g = map[s.distance];
      g.nbSeances++;
      g.fleches += getPaille(s) + getBlason(s) + getCompte(s);
      const c = getCompte(s);
      if (c > 0 && (s.score ?? 0) > 0) { g.scoreSum += s.score; g.compteSum += c; }
    }
    return DIST_ORDER.filter((d) => map[d]).map((d) => {
      const g = map[d];
      const moyenne = g.compteSum > 0 ? g.scoreSum / g.compteSum : null;
      return {
        distance: d, nbSeances: g.nbSeances, fleches: g.fleches,
        moyenne, scoreMoyen: moyenne != null ? Math.round(moyenne * normFactor(d)) : null,
      };
    });
  }, [seances]);

  if (loading) return <div style={s.info}>Chargement…</div>;
  if (error)   return <div style={s.errMsg}>{error}</div>;

  return (
    <div style={s.page}>
      {enCours ? (
        <div style={s.carteEnCours}>
          <div style={s.glow} />
          <p style={s.heroEyebrow}>Séance en cours</p>
          <p style={s.heroTitre}>On reprend ?</p>
          <p style={s.heroSous}>{enCours.distance} · {enCours.type}{enCours.lieu ? ` · ${enCours.lieu}` : ""}</p>
          <button style={s.cta} onClick={onReprendre}>▶ Reprendre la séance</button>
        </div>
      ) : (
        <div style={s.hero}>
          <div style={s.glow} />
          <p style={s.heroEyebrow}>Bonjour</p>
          <p style={s.heroTitre}>Prêt à tirer, {user?.prenom} ?</p>
          <p style={s.heroSous}>Vos séances, vos exercices et vos scores — même sans réseau.</p>
          <button style={s.cta} onClick={onNouvelleSeance}>＋ Nouvelle séance</button>
        </div>
      )}

      {volEntr > 0 && (
        <section style={s.section}>
          <p style={s.sectionLabel}>Volume d'entraînement — {fmtYM(currentYM)}</p>
          <div style={s.gaugeBox}>
            <div style={s.gaugeRow}>
              <span className="num" style={s.gaugeFigures}>{volumeMois} / {volEntr} flèches</span>
              <span className="num" style={{ ...s.gaugePct, color: gaugeColor }}>{pctVolume}%</span>
            </div>
            <div style={s.gaugeTrack}>
              <div style={{ ...s.gaugeBar, width: `${pctVolume}%`, backgroundColor: gaugeColor }} />
            </div>
          </div>
        </section>
      )}

      <section style={s.section}>
        <p style={s.sectionLabel}>30 derniers jours</p>
        <div style={s.kpis}>
          <Kpi valeur={fleches30} label="flèches tirées" />
          <Kpi valeur={tirsComptes30} label={tirsComptes30 > 1 ? "tirs comptés" : "tir compté"} />
          <Kpi valeur={moyenne30 != null ? moyenne30.toFixed(2) : "—"} label="moy. / flèche" />
        </div>
      </section>

      <section style={s.section}>
        <p style={s.sectionLabel}>Par distance — saison {CURRENT_SAISON}</p>
        {parDistance.length === 0 ? (
          <div style={s.distEmpty}>Aucune séance cette saison.</div>
        ) : (
          <div style={s.distListe}>
            {parDistance.map((d) => (
              <div key={d.distance} style={s.distRow}>
                <span style={s.distBadge}>{d.distance}</span>
                <div style={s.distStats}>
                  <DistStat valeur={d.nbSeances} label={d.nbSeances > 1 ? "séances" : "séance"} />
                  <DistStat valeur={d.fleches.toLocaleString("fr-FR")} label="flèches" />
                  <DistStat valeur={d.moyenne != null ? d.moyenne.toFixed(2) : "—"} label="moy./fl." accent={d.moyenne != null} />
                  <DistStat valeur={d.scoreMoyen ?? "—"} label="score moy." accent={d.scoreMoyen != null} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ valeur, label }) {
  return (
    <div style={s.kpi}>
      <div className="num" style={s.kpiValeur}>{valeur}</div>
      <div style={s.kpiLabel}>{label}</div>
    </div>
  );
}

function DistStat({ valeur, label, accent }) {
  return (
    <div style={s.distStat}>
      <div className="num" style={{ ...s.distStatValeur, color: accent ? PINK : "var(--text)" }}>{valeur}</div>
      <div style={s.distStatLabel}>{label}</div>
    </div>
  );
}

const s = {
  page: { display: "flex", flexDirection: "column", gap: "26px" },

  hero: {
    position: "relative", overflow: "hidden",
    backgroundColor: "var(--surface)", borderRadius: "16px", border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)", padding: "28px 30px",
    display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start",
  },
  carteEnCours: {
    position: "relative", overflow: "hidden",
    backgroundColor: "var(--surface)", border: `1px solid ${PINK}`, borderRadius: "16px",
    padding: "28px 30px", boxShadow: "var(--shadow-card)",
    display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start",
  },
  glow: {
    position: "absolute", top: "-60px", right: "-60px", width: "220px", height: "220px",
    borderRadius: "50%", background: "radial-gradient(circle, var(--pink-soft) 0%, transparent 72%)",
    pointerEvents: "none",
  },
  heroEyebrow: {
    fontFamily: "var(--mono)", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase",
    color: PINK, fontWeight: "600", margin: "0 0 6px",
  },
  heroTitre: { fontFamily: "var(--display)", fontSize: "26px", fontWeight: "600", color: "var(--text)", margin: "0 0 6px" },
  heroSous:  { fontSize: "13.5px", color: "var(--text-muted)", margin: "0 0 18px", maxWidth: "48ch", lineHeight: 1.55 },
  cta: {
    position: "relative", backgroundColor: PINK, color: "#fff", border: "none",
    borderRadius: "10px", padding: "12px 22px", fontSize: "14px", fontWeight: "700",
    cursor: "pointer", fontFamily: "inherit",
  },

  section: { display: "flex", flexDirection: "column", gap: "12px" },
  sectionLabel: {
    fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase",
    color: "var(--text-dim)", fontWeight: "600", margin: 0,
  },

  gaugeBox: {
    backgroundColor: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)", padding: "16px 18px",
    display: "flex", flexDirection: "column", gap: "10px",
  },
  gaugeRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" },
  gaugeFigures: { fontSize: "13px", color: "var(--text-2)", fontWeight: "600" },
  gaugePct: { fontSize: "15px", fontWeight: "700" },
  gaugeTrack: { height: "8px", borderRadius: "4px", backgroundColor: "var(--border)", overflow: "hidden" },
  gaugeBar: { height: "100%", borderRadius: "4px", transition: "width 0.4s ease" },

  kpis: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" },
  kpi: {
    backgroundColor: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)", padding: "16px", textAlign: "center",
    display: "flex", flexDirection: "column", gap: "4px",
  },
  kpiValeur: { fontSize: "26px", fontWeight: "700", color: "var(--text)", letterSpacing: "-0.01em" },
  kpiLabel:  { fontSize: "10.5px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" },

  distListe: { display: "flex", flexDirection: "column", gap: "1px", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" },
  distRow: {
    backgroundColor: "var(--surface)", padding: "14px 16px",
    display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap",
  },
  distBadge: {
    fontFamily: "var(--display)", fontSize: "15px", fontWeight: "600", color: "var(--text)",
    backgroundColor: "var(--surface-raised)", borderRadius: "8px", padding: "4px 10px", flexShrink: 0,
  },
  distStats: { display: "flex", gap: "20px", flexWrap: "wrap", marginLeft: "auto" },
  distStat: { textAlign: "right" },
  distStatValeur: { fontSize: "15px", fontWeight: "700", letterSpacing: "-0.01em" },
  distStatLabel: { fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" },
  distEmpty: {
    backgroundColor: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)", padding: "24px", textAlign: "center", color: "var(--text-dim)", fontSize: "13px",
  },

  info:   { color: "var(--text-muted)", fontSize: "14px" },
  errMsg: {
    color: PINK, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "var(--pink-soft)", borderRadius: "8px", border: `1px solid ${PINK}`,
  },
};
