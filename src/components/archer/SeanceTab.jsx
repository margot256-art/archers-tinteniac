import { useState } from "react";
import NouvelleSeanceMulti from "./NouvelleSeanceMulti";

// Onglet "+Séance" : compositeur multi-exercices (choix au fur et à mesure du tir).
export default function SeanceTab() {
  const [seanceKey, setSeanceKey] = useState(0);

  // Changer la clé force un nouveau compositeur vierge pour la prochaine séance.
  const nouvelleSeance = () => setSeanceKey((k) => k + 1);

  return <NouvelleSeanceMulti key={seanceKey} onQuitter={nouvelleSeance} />;
}
