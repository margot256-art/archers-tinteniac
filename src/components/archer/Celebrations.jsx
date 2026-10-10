import { useEffect, useState } from "react";
import { useSeances } from "../../hooks/useSeances";
import { useObjectif } from "../../hooks/useObjectif";
import { launch as launchFireworks } from "../../hooks/useFireworks";
import { PRIMARY, getPaille, getBlason, getCompte, CURRENT_SAISON } from "../../utils/seances";
import { scoreEpreuve, scoreSerie } from "../../utils/records";

const moisEnCours = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const volumeEntrMois = (docs, ym) =>
  docs
    .filter((s) => s.type === "Entraînement" && s.date?.startsWith(ym))
    .reduce((n, s) => n + getPaille(s) + getBlason(s) + getCompte(s), 0);

// Feu d'artifice + message quand un exercice qui vient d'être enregistré bat
// un record (même distance, même type) ou fait passer l'objectif de volume
// d'entraînement du mois. Fonctionne pour toutes les saisies (exercices en
// direct, saisie manuelle), puisqu'on surveille les séances elles-mêmes.
export default function Celebrations() {
  const { seances, loading } = useSeances();
  const rawObjectif = useObjectif();
  const [messages,    setMessages]    = useState([]);
  const [precedentes, setPrecedentes] = useState(null); // séances connues au dernier passage (null = pas encore chargé)

  const volEntr = rawObjectif?.saisons?.[CURRENT_SAISON]?.volEntr ?? rawObjectif?.volEntr ?? 0;

  // Comparaison avec les séances connues au passage précédent (pendant le rendu,
  // comme le recommande React pour un état dérivé d'un changement de props).
  if (!loading && seances !== precedentes) {
    setPrecedentes(seances);
    if (precedentes) {
      const msgs = nouveauxMessages(precedentes, seances, volEntr);
      if (msgs.length > 0) setMessages(msgs);
    }
  }

  // Feu d'artifice à l'apparition des messages, puis disparition après 3,5 s.
  useEffect(() => {
    if (messages.length === 0) return;
    launchFireworks();
    navigator.vibrate?.(50);
    const timer = setTimeout(() => setMessages([]), 3500);
    return () => clearTimeout(timer);
  }, [messages]);

  if (messages.length === 0) return null;
  return (
    <div style={s.overlay}>
      {messages.map((m) => <div key={m} style={s.banner}>{m}</div>)}
    </div>
  );
}

function nouveauxMessages(avant, seances, volEntr) {
  const idsAvant = new Set(avant.map((s) => s.id));
  const nouvelles = seances.filter((s) => !idsAvant.has(s.id));
  if (nouvelles.length === 0) return [];

  const msgs = [];

  const ym = moisEnCours();
  if (volEntr > 0 && volumeEntrMois(avant, ym) < volEntr && volumeEntrMois(seances, ym) >= volEntr) {
    msgs.push("🏆 Objectif volume accompli !");
  }

  // Record = épreuve complète (2 séries) ; une seule série = « série record ».
  for (const s of nouvelles) {
    const memes = avant.filter((x) => x.distance === s.distance && x.type === s.type);
    const typeLabel = s.type === "Compétition" ? "compétition" : "entraînement";
    const bat = (calcul) => {
      const score = calcul(s);
      if (score == null) return false;
      const meilleur = memes.reduce((best, x) => Math.max(best, calcul(x) ?? 0), 0);
      return meilleur > 0 && score > meilleur;
    };
    if (bat(scoreEpreuve)) msgs.push(`🎯 Nouveau record ${typeLabel} à ${s.distance} !`);
    if (bat(scoreSerie))   msgs.push(`🎯 Série record ${typeLabel} à ${s.distance} !`);
  }

  return msgs;
}

const s = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 500,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: "16px", padding: "0 16px", pointerEvents: "none",
  },
  banner: {
    backgroundColor: "var(--surface)", border: `2px solid ${PRIMARY}`, borderRadius: "16px",
    padding: "20px 32px", fontSize: "20px", fontWeight: "800", color: PRIMARY,
    textAlign: "center", boxShadow: "var(--shadow-modal)",
  },
};
