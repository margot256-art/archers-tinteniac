// Grille de zones simplifiée, commune à tous les protocoles qui comptent les
// flèches par zone (Test 100, Potentiel Max, Zone, et plus tard Tir compté
// au clavier). X vaut 10 points (compté séparément pour le suivi des "dans le 10").
export const ZONES = ["X", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "M"];

export const pointsZone = (code) => {
  if (code === "X") return 10;
  if (code === "M") return 0;
  return parseInt(code, 10) || 0;
};

// Couleurs réelles du blason (littérales : un blason ne se réinterprète pas
// selon le thème de l'app) — utilisées partout où un code de zone est affiché
// (pavé de saisie, feuille de score, blason visuel).
const COULEUR_ZONE = {
  X:    { bg: "#f2c84b", text: "#1a1a1a" },
  "10": { bg: "#f2c84b", text: "#1a1a1a" },
  "9":  { bg: "#f2c84b", text: "#1a1a1a" },
  "8":  { bg: "#d6342f", text: "#fff" },
  "7":  { bg: "#d6342f", text: "#fff" },
  "6":  { bg: "#4fa8d8", text: "#fff" },
  "5":  { bg: "#4fa8d8", text: "#fff" },
  "4":  { bg: "#19191a", text: "#fff" },
  "3":  { bg: "#19191a", text: "#fff" },
  "2":  { bg: "#f3f1ea", text: "#1a1a1a" },
  "1":  { bg: "#f3f1ea", text: "#1a1a1a" },
  M:    { bg: "transparent", text: "var(--text-dim)" },
};
export const couleurZone = (code) => COULEUR_ZONE[code] ?? { bg: "var(--surface-raised)", text: "var(--text)" };
