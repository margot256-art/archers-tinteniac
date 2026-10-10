import ExerciceTirCompte from "./ExerciceTirCompte";
import ExerciceVolume from "./ExerciceVolume";
import SaisieManuelle from "./SaisieManuelle";

// Composant de saisie (création ET édition) par protocole, partagé entre
// Exercices.jsx, NouvelleSeanceMulti.jsx et MesSeances.jsx.
export const COMPOSANTS_EXERCICE = {
  "tir-compte":    ExerciceTirCompte,
  volume:          ExerciceVolume,
  manuel:          SaisieManuelle,
};
