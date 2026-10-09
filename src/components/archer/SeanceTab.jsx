import NouvelleSeanceMulti from "./NouvelleSeanceMulti";

// Écran "+Séance" : compositeur multi-exercices (choix au fur et à mesure du tir).
// Terminer ou annuler la séance ramène à l'Accueil.
export default function SeanceTab({ onQuitter }) {
  return <NouvelleSeanceMulti onQuitter={onQuitter} />;
}
