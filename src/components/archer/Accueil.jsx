import { useMemo } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useSeances } from "../../hooks/useSeances";
import { PRIMARY as PINK, getPaille, getBlason, getCompte, fmtDate } from "../../utils/seances";
import { lireSeanceEnCours } from "../../utils/seanceEnCours";

const JOURS_30 = 30 * 24 * 60 * 60 * 1000;

export default function Accueil({ onReprendre, onNouvelleSeance }) {
  const { user } = useAuth();
  const { seances, loading, error } = useSeances();

  const enCours = lireSeanceEnCours(user?.id);

  const seuil30 = useMemo(() => {
    const d = new Date();
    d.setTime(d.getTime() - JOURS_30);
    return d.toISOString().split("T")[0];
  }, []);

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

  const derniere = seances[0];

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

      <section style={s.section}>
        <p style={s.sectionLabel}>30 derniers jours</p>
        <div style={s.kpis}>
          <Kpi valeur={fleches30} label="flèches tirées" />
          <Kpi valeur={tirsComptes30} label={tirsComptes30 > 1 ? "tirs comptés" : "tir compté"} />
          <Kpi valeur={moyenne30 != null ? moyenne30.toFixed(2) : "—"} label="moy. / flèche" />
        </div>
      </section>

      {derniere && (
        <section style={s.section}>
          <p style={s.sectionLabel}>Dernière séance</p>
          <div style={s.derniereCard}>
            <div style={s.derniereDate}>{fmtDate(derniere.date)}</div>
            <div style={s.derniereDetail}>
              {derniere.distance} · {derniere.type}{derniere.lieu ? ` · ${derniere.lieu}` : ""}
              {derniere.score > 0 && <span style={s.derniereScore}>{derniere.score} pts</span>}
            </div>
          </div>
        </section>
      )}
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

  kpis: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" },
  kpi: {
    backgroundColor: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)", padding: "16px", textAlign: "center",
    display: "flex", flexDirection: "column", gap: "4px",
  },
  kpiValeur: { fontSize: "26px", fontWeight: "700", color: "var(--text)", letterSpacing: "-0.01em" },
  kpiLabel:  { fontSize: "10.5px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" },

  derniereCard: {
    backgroundColor: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)", padding: "16px 18px",
    display: "flex", flexDirection: "column", gap: "4px",
  },
  derniereDate:   { fontFamily: "var(--display)", fontSize: "15px", fontWeight: "600", color: "var(--text)" },
  derniereDetail: { fontSize: "12px", color: "var(--text-muted)", display: "flex", gap: "8px", alignItems: "baseline" },
  derniereScore:  { fontFamily: "var(--mono)", color: PINK, fontWeight: "600" },

  info:   { color: "var(--text-muted)", fontSize: "14px" },
  errMsg: {
    color: PINK, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "var(--pink-soft)", borderRadius: "8px", border: `1px solid ${PINK}`,
  },
};
