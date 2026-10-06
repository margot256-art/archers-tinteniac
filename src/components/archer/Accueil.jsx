import { useMemo } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useSeances } from "../../hooks/useSeances";
import { PRIMARY, getPaille, getBlason, getCompte, fmtDate } from "../../utils/seances";
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
          <div style={s.badgeEnCours}>Séance en cours</div>
          <p style={s.cardTexte}>
            {enCours.distance} · {enCours.type}{enCours.lieu ? ` · ${enCours.lieu}` : ""}
          </p>
          <button style={s.btnPrimaireBloc} onClick={onReprendre}>▶ Reprendre</button>
        </div>
      ) : (
        <div style={s.hero}>
          <p style={s.heroTitre}>Prêt à tirer ?</p>
          <p style={s.heroSous}>Vos séances, vos exercices et vos scores.</p>
          <button style={s.btnPrimaireBloc} onClick={onNouvelleSeance}>+ Nouvelle séance</button>
        </div>
      )}

      <h3 style={s.sectionTitre}>30 derniers jours</h3>
      <div style={s.kpis}>
        <Kpi valeur={fleches30} label="flèches tirées" />
        <Kpi valeur={tirsComptes30} label={tirsComptes30 > 1 ? "tirs comptés" : "tir compté"} />
        <Kpi valeur={moyenne30 != null ? moyenne30.toFixed(2) : "—"} label="moy. par flèche" />
      </div>

      {derniere && (
        <>
          <h3 style={s.sectionTitre}>Dernière séance</h3>
          <div style={s.derniereCard}>
            <div style={s.derniereDate}>{fmtDate(derniere.date)}</div>
            <div style={s.derniereDetail}>
              {derniere.distance} · {derniere.type}{derniere.lieu ? ` · ${derniere.lieu}` : ""}
              {derniere.score > 0 && ` · ${derniere.score} pts`}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ valeur, label }) {
  return (
    <div style={s.kpi}>
      <div style={s.kpiValeur}>{valeur}</div>
      <div style={s.kpiLabel}>{label}</div>
    </div>
  );
}

const s = {
  page: { display: "flex", flexDirection: "column", gap: "20px" },

  hero: {
    backgroundColor: "var(--surface)", borderRadius: "14px",
    boxShadow: "var(--shadow-card)", padding: "24px",
    display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-start",
  },
  heroTitre: { fontSize: "18px", fontWeight: "800", color: "var(--text)", margin: 0 },
  heroSous:  { fontSize: "13px", color: "var(--text-muted)", margin: "0 0 10px" },

  carteEnCours: {
    backgroundColor: "rgba(255,0,122,0.08)", border: `1.5px solid ${PRIMARY}`,
    borderRadius: "14px", padding: "20px",
    display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start",
  },
  badgeEnCours: {
    color: PRIMARY, fontSize: "11px", fontWeight: "800",
    textTransform: "uppercase", letterSpacing: "0.07em",
  },
  cardTexte: { fontSize: "13px", color: "var(--text-muted)", margin: "0 0 6px" },

  btnPrimaireBloc: {
    backgroundColor: PRIMARY, color: "#fff", border: "none",
    borderRadius: "10px", padding: "12px 22px", fontSize: "14px", fontWeight: "700",
    cursor: "pointer", fontFamily: "inherit",
  },

  sectionTitre: { fontSize: "14px", fontWeight: "700", color: "var(--text-2)", margin: 0 },

  kpis: {
    display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px",
  },
  kpi: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)", padding: "16px", textAlign: "center",
    display: "flex", flexDirection: "column", gap: "4px",
  },
  kpiValeur: { fontSize: "24px", fontWeight: "800", color: "var(--text)", letterSpacing: "-0.01em" },
  kpiLabel:  { fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" },

  derniereCard: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)", padding: "16px 18px",
    display: "flex", flexDirection: "column", gap: "4px",
  },
  derniereDate:   { fontSize: "15px", fontWeight: "700", color: "var(--text)" },
  derniereDetail: { fontSize: "12px", color: "var(--text-muted)" },

  info:   { color: "var(--text-muted)", fontSize: "14px" },
  errMsg: {
    color: PRIMARY, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "rgba(255,0,122,0.1)", borderRadius: "8px", border: `1px solid ${PRIMARY}`,
  },
};
