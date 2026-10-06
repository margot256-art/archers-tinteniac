// Grille de zones simplifiée, commune à tous les protocoles qui comptent les
// flèches par zone (Test 100, Potentiel Max, Zone, et plus tard Tir compté
// au clavier). X vaut 10 points (compté séparément pour le suivi des "dans le 10").
export const ZONES = ["X", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "M"];

export const pointsZone = (code) => {
  if (code === "X") return 10;
  if (code === "M") return 0;
  return parseInt(code, 10) || 0;
};
