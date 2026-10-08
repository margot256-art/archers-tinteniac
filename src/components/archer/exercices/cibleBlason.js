// Géométrie et couleurs du blason standard (10 zones + X), partagées entre
// CibleSaisie.jsx (un grand blason) et TrispotSaisie.jsx (trois petits, un
// par flèche de la volée). Couleurs littérales : un blason ne se
// réinterprète pas selon le thème de l'app.
export const RAYON_MAX = 95;
export const RAYON_X = 4.75;

export const ANNEAUX = [
  { valeur: "1",  r: 95.0, fill: "#f3f1ea", stroke: "#00000030" },
  { valeur: "2",  r: 85.5, fill: "#f3f1ea", stroke: "#00000030" },
  { valeur: "3",  r: 76.0, fill: "#19191a", stroke: "#ffffff30" },
  { valeur: "4",  r: 66.5, fill: "#19191a", stroke: "#ffffff30" },
  { valeur: "5",  r: 57.0, fill: "#4fa8d8", stroke: "#00000030" },
  { valeur: "6",  r: 47.5, fill: "#4fa8d8", stroke: "#00000030" },
  { valeur: "7",  r: 38.0, fill: "#d6342f", stroke: "#00000030" },
  { valeur: "8",  r: 28.5, fill: "#d6342f", stroke: "#00000030" },
  { valeur: "9",  r: 19.0, fill: "#f2c84b", stroke: "#00000030" },
  { valeur: "10", r: 9.5,  fill: "#f2c84b", stroke: "#00000030" },
];

export function zoneDepuisRayon(r) {
  if (r > RAYON_MAX) return "M";
  if (r <= RAYON_X) return "X";
  const anneau = Math.ceil(r / (RAYON_MAX / 10)); // 1 (centre) .. 10 (bord)
  return String(11 - anneau);
}

/** Position normalisée (x, y dans [-1,1]) à partir d'un clic sur un <svg> viewBox="0 0 200 200". */
export function positionDepuisClic(svg, clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  const px = ((clientX - rect.left) / rect.width) * 200 - 100;
  const py = ((clientY - rect.top) / rect.height) * 200 - 100;
  return { x: px / RAYON_MAX, y: py / RAYON_MAX, rayon: Math.hypot(px, py) };
}
