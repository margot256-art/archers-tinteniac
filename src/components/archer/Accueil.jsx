import { useMemo } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useSeances } from "../../hooks/useSeances";
import { useObjectif } from "../../hooks/useObjectif";
import {
  PRIMARY as PINK, BLUE, getPaille, getBlason, getCompte, getSaison, fmtYM, CURRENT_SAISON,
  cleSeance, nbSeances, retoursNonLus, fmtDateLongue, couleurJaugeVolume, avancementMois, parOrdreDeTir,
} from "../../utils/seances";
import { PROTOCOLE_PAR_ID, protocoleDe } from "../../utils/exercices";
import { lireSeanceEnCours } from "../../utils/seanceEnCours";
import { lireBrouillon } from "../../utils/brouillonExercice";
import * as ui from "./styleArcher";

// Phrase d'encouragement de l'accueil : tirée au hasard à chaque ouverture de
// l'appli (pas à chaque retour sur l'onglet), jamais la même qu'à l'ouverture précédente.
const PHRASES = [
  "Chaque flèche est une nouvelle chance de bien faire.",
  "La régularité bat le talent quand le talent ne s'entraîne pas.",
  "Respire, vise, lâche : le reste suivra.",
  "Les grands scores se construisent une volée à la fois.",
  "Aujourd'hui, une flèche de mieux qu'hier.",
  "Le 10 n'est pas un hasard, c'est un geste répété.",
  "Concentre-toi sur le geste, le score viendra.",
  "Une mauvaise flèche ne fait pas une mauvaise séance.",
  "Chaque entraînement te rapproche de ton objectif.",
  "Calme dans la tête, solide dans le geste.",
  "La patience est la corde la plus solide de l'archer.",
  "Fais confiance à ton entraînement.",
  "Progresser, c'est tirer encore une volée quand on pense avoir fini.",
  "Le centre se mérite, flèche après flèche.",
];

const CLE_PHRASE = "archers-tinteniac.dernierePhrase";

let phraseOuverture = null; // tirée une seule fois par ouverture de l'appli

const phraseDuMoment = () => {
  if (phraseOuverture) return phraseOuverture;
  let precedente = -1;
  try { precedente = Number(localStorage.getItem(CLE_PHRASE) ?? -1); } catch { /* stockage indisponible */ }
  let index;
  do { index = Math.floor(Math.random() * PHRASES.length); } while (index === precedente);
  try { localStorage.setItem(CLE_PHRASE, String(index)); } catch { /* stockage indisponible */ }
  phraseOuverture = PHRASES[index];
  return phraseOuverture;
};

const todayYM = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const nomExercice = (d) => PROTOCOLE_PAR_ID[protocoleDe(d)]?.nom ?? d.protocole;

export default function Accueil({ onReprendre, onNouvelleSeance, onSaisieManuelle, onOuvrirSeance }) {
  const { user } = useAuth();
  const { seances, loading, error } = useSeances();
  const rawObjectif = useObjectif();
  const phrase = phraseDuMoment();

  const enCours = lireSeanceEnCours(user?.id);
  const manuelleEnCours = !!lireBrouillon(user?.id, { protocole: "manuel" });

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

  // Jauge de volume jugée au rythme du mois : au 11, 35 % du mois est écoulé.
  const rythme = avancementMois();
  const pctVolume = volEntr > 0 ? Math.min(100, Math.round((volumeMois / volEntr) * 100)) : 0;
  const gaugeColor = couleurJaugeVolume(pctVolume, rythme);
  const messageRythme = pctVolume >= 100 ? "Objectif du mois atteint !"
    : pctVolume >= rythme ? "Dans le rythme du mois"
    : `Un peu en retard sur le rythme (${rythme} % attendus à ce jour)`;

  const { nbSeancesSaison, flechesSaison } = useMemo(() => {
    const src = seances.filter((s) => s.date && getSaison(s.date) === CURRENT_SAISON);
    return {
      nbSeancesSaison: nbSeances(src),
      flechesSaison: src.reduce((n, s) => n + getPaille(s) + getBlason(s) + getCompte(s), 0),
    };
  }, [seances]);

  // Dernière séance : raccourci vers son détail dans le journal.
  const derniere = useMemo(() => {
    if (!seances.length) return null;
    const recent = [...seances].filter((s) => s.date)
      .sort((a, b) => b.date.localeCompare(a.date) || parOrdreDeTir(b, a))[0];
    if (!recent) return null;
    const docs = seances.filter((s) => cleSeance(s) === cleSeance(recent)).sort(parOrdreDeTir);
    const fleches = docs.reduce((n, s) => n + getPaille(s) + getBlason(s) + getCompte(s), 0);
    const comptes = docs.filter((s) => getCompte(s) > 0 && (s.score ?? 0) > 0);
    const nbParExo = new Map();
    for (const d of docs) nbParExo.set(nomExercice(d), (nbParExo.get(nomExercice(d)) ?? 0) + 1);
    return {
      cle: cleSeance(recent), date: recent.date, type: recent.type, distance: recent.distance, lieu: recent.lieu,
      exercices: [...nbParExo].map(([nom, n]) => (n > 1 ? `${nom} ×${n}` : nom)).join(" · "),
      fleches,
      score: comptes.length === 1 ? comptes[0].score : null,
    };
  }, [seances]);

  const retours = retoursNonLus(seances);

  if (loading) return <div style={ui.info}>Chargement…</div>;
  if (error)   return <div style={ui.erreur}>{error}</div>;

  const couleurDerniere = derniere?.type === "Compétition" ? BLUE : PINK;

  return (
    <div style={{ ...ui.page, gap: "26px" }}>
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
          <p style={s.heroSous}>{phrase}</p>
          <div style={s.ctaRow}>
            <button style={s.cta} onClick={onNouvelleSeance}>▶ Séance en direct</button>
            <button style={s.ctaSecondaire} onClick={onSaisieManuelle}>{manuelleEnCours ? "✎ Reprendre la saisie manuelle" : "✎ Saisie manuelle"}</button>
          </div>
        </div>
      )}

      {retours.length > 0 && (
        <section style={s.section}>
          <h3 style={ui.titreSection}>
            💬 {retours.length > 1 ? `${retours.length} nouveaux retours` : "Nouveau retour"} du coach
          </h3>
          {retours.map((r) => (
            <button key={r.cle} style={s.retourCarte} onClick={() => onOuvrirSeance?.(r.cle)}>
              <span style={s.retourTete}>
                <span style={s.retourDate}>{fmtDateLongue(r.date)} · {r.distance} · {r.type}</span>
                <span style={s.retourLire}>Lire →</span>
              </span>
              <span style={s.retourTexte}>{r.texte}</span>
            </button>
          ))}
        </section>
      )}

      {volEntr > 0 && (
        <section style={s.section}>
          <div style={s.sectionTete}>
            <h3 style={ui.titreSection}>Volume d'entraînement</h3>
            <span style={ui.sousTitre}>{fmtYM(currentYM)}</span>
          </div>
          <div style={{ ...ui.carte, ...s.gaugeBox }}>
            <div style={s.gaugeRow}>
              <span style={ui.sousTitre}><strong style={s.fort}>{volumeMois}</strong> / {volEntr} flèches</span>
              <span style={{ ...s.gaugePct, color: gaugeColor }}>{pctVolume} %</span>
            </div>
            <div style={s.gaugeTrack}>
              <div style={{ ...s.gaugeBar, width: `${pctVolume}%`, backgroundColor: gaugeColor }} />
              {/* Repère : où il faudrait en être à ce jour. */}
              {pctVolume < 100 && <div style={{ ...s.repereRythme, left: `${rythme}%` }} title={`${rythme} % attendus à ce jour`} />}
            </div>
            <span style={ui.sousTitre}>{messageRythme}</span>
          </div>
        </section>
      )}

      <section style={s.section}>
        <h3 style={ui.titreSection}>Saison {CURRENT_SAISON}</h3>
        <div style={s.kpis}>
          <Kpi valeur={nbSeancesSaison} label={nbSeancesSaison > 1 ? "séances" : "séance"} />
          <Kpi valeur={flechesSaison.toLocaleString("fr-FR")} label="flèches tirées" />
        </div>
      </section>

      {derniere && (
        <section style={s.section}>
          <h3 style={ui.titreSection}>Dernière séance</h3>
          <button style={{ ...ui.carte, ...s.derniere }} onClick={() => onOuvrirSeance?.(derniere.cle)}>
            <span style={s.derniereCorps}>
              <span style={s.derniereTitre}>{fmtDateLongue(derniere.date)}</span>
              <span style={ui.sousTitre}>{derniere.lieu ? `${derniere.lieu} · ${derniere.distance}` : derniere.distance} · {derniere.type}</span>
              <span style={s.derniereExos}>{derniere.exercices}</span>
            </span>
            <span style={s.derniereChiffres}>
              {derniere.score != null && <span style={{ ...s.derniereValeur, color: couleurDerniere }}>{derniere.score} <small style={s.derniereUnite}>pts</small></span>}
              <span style={s.derniereValeur}>{derniere.fleches} <small style={s.derniereUnite}>flèches</small></span>
              <span style={s.derniereLien}>Voir →</span>
            </span>
          </button>
        </section>
      )}
    </div>
  );
}

function Kpi({ valeur, label }) {
  return (
    <div style={{ ...ui.carte, ...s.kpi }}>
      <div style={s.kpiValeur}>{valeur}</div>
      <div style={ui.sousTitre}>{label}</div>
    </div>
  );
}

const s = {
  retourCarte: {
    display: "flex", flexDirection: "column", gap: "6px", textAlign: "left",
    backgroundColor: "var(--pink-soft)", border: `1px solid ${PINK}`, borderRadius: "12px",
    padding: "14px 16px", cursor: "pointer", fontFamily: "inherit",
  },
  retourTete:  { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", flexWrap: "wrap" },
  retourDate:  { fontSize: "12px", fontWeight: "700", color: PINK },
  retourLire:  { fontSize: "12px", fontWeight: "700", color: PINK, whiteSpace: "nowrap" },
  retourTexte: {
    fontSize: "14px", color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-line",
    display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
  },

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
  heroEyebrow: { fontSize: "13px", fontWeight: "700", color: PINK, margin: "0 0 4px" },
  heroTitre: { fontFamily: "var(--display)", fontSize: "26px", fontWeight: "600", color: "var(--text)", margin: "0 0 6px" },
  heroSous:  { fontSize: "14px", color: "var(--text-muted)", margin: "0 0 18px", maxWidth: "48ch", lineHeight: 1.55 },
  cta: {
    position: "relative", backgroundColor: PINK, color: "#fff", border: "none",
    borderRadius: "10px", padding: "12px 22px", fontSize: "14px", fontWeight: "700",
    cursor: "pointer", fontFamily: "inherit",
  },
  ctaRow: { position: "relative", display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "10px" },
  ctaSecondaire: {
    position: "relative", backgroundColor: "transparent", color: "var(--text)",
    border: "1.5px solid var(--border-2)", borderRadius: "10px",
    padding: "12px 22px", fontSize: "14px", fontWeight: "700",
    cursor: "pointer", fontFamily: "inherit",
  },

  section: { display: "flex", flexDirection: "column", gap: "10px" },
  sectionTete: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" },
  fort: { fontWeight: "700", color: "var(--text)" },

  gaugeBox: { padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px" },
  gaugeRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" },
  gaugePct: { fontFamily: "var(--display)", fontSize: "20px", fontWeight: "600" },
  gaugeTrack: { position: "relative", height: "8px", borderRadius: "4px", backgroundColor: "var(--border)" },
  gaugeBar: { height: "100%", borderRadius: "4px", transition: "width 0.4s ease" },
  repereRythme: {
    position: "absolute", top: "-4px", width: "2px", height: "16px", borderRadius: "1px",
    backgroundColor: "var(--text-muted)", transform: "translateX(-1px)",
  },

  kpis: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" },
  kpi: { padding: "16px", textAlign: "center", display: "flex", flexDirection: "column", gap: "2px" },
  kpiValeur: { fontFamily: "var(--display)", fontSize: "28px", fontWeight: "600", color: "var(--text)" },

  derniere: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px",
    padding: "14px 16px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit", width: "100%",
  },
  derniereCorps: { display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 },
  derniereTitre: { fontFamily: "var(--display)", fontSize: "17px", fontWeight: "600", color: "var(--text)" },
  derniereExos: { fontSize: "13px", fontWeight: "600", color: "var(--text-2)" },
  derniereChiffres: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flex: "0 0 auto" },
  derniereValeur: { fontFamily: "var(--display)", fontSize: "19px", fontWeight: "600", color: "var(--text)", whiteSpace: "nowrap" },
  derniereUnite: { fontFamily: "var(--sans)", fontSize: "11px", fontWeight: "600", color: "var(--text-muted)" },
  derniereLien: { fontSize: "12px", fontWeight: "700", color: "var(--text-muted)" },
};
