import ExerciceTirCompte from "./ExerciceTirCompte";
import ExerciceVolume from "./ExerciceVolume";
import ExerciceTest100 from "./ExerciceTest100";
import ExerciceGroupements from "./ExerciceGroupements";
import ExercicePotentielMax from "./ExercicePotentielMax";
import ExerciceZone from "./ExerciceZone";

// Composant de saisie (création ET édition) par protocole, partagé entre
// Exercices.jsx, NouvelleSeanceMulti.jsx et MesSeances.jsx.
export const COMPOSANTS_EXERCICE = {
  "tir-compte":    ExerciceTirCompte,
  volume:          ExerciceVolume,
  test100:         ExerciceTest100,
  groupements:     ExerciceGroupements,
  "potentiel-max": ExercicePotentielMax,
  zone:            ExerciceZone,
};
