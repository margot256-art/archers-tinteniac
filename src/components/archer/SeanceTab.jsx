import { useState } from "react";
import NouvelleSeanceMulti from "./NouvelleSeanceMulti";
import Saisie from "./Saisie";

// Onglet "+Séance" : le compositeur multi-exercices par défaut, avec un repli
// vers l'ancienne saisie rapide (un seul tir compté) pour aller vite.
export default function SeanceTab() {
  const [rapide,     setRapide]     = useState(false);
  const [seanceKey,  setSeanceKey]  = useState(0);

  if (rapide) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <button style={s.lienRetour} onClick={() => setRapide(false)}>
          ← Revenir à la séance avec plusieurs exercices
        </button>
        <Saisie />
      </div>
    );
  }

  // Changer la clé force un nouveau compositeur vierge pour la prochaine séance.
  const nouvelleSeance = () => setSeanceKey((k) => k + 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <NouvelleSeanceMulti key={seanceKey} onQuitter={nouvelleSeance} />
      <button style={s.lienRapide} onClick={() => setRapide(true)}>
        Saisie rapide d'un seul tir compté →
      </button>
    </div>
  );
}

const s = {
  lienRetour: {
    background: "none", border: "none", color: "var(--text-dim)",
    fontSize: "12px", cursor: "pointer", fontFamily: "inherit",
    textAlign: "left", padding: "4px 0",
  },
  lienRapide: {
    background: "none", border: "none", color: "var(--text-dim)",
    fontSize: "12px", cursor: "pointer", fontFamily: "inherit",
    textAlign: "center", padding: "4px 0",
  },
};
