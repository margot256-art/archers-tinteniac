// Géométrie et couleurs du blason, paramétrées par nombre d'anneaux : 10
// pour un blason complet (CibleSaisie.jsx), 5 (valeurs 10 à 6) pour un
// trispot, dont les flèches tenant toutes dans un petit visuel, les
// anneaux 1 à 5 n'existent pas (TrispotSaisie.jsx). Couleurs littérales :
// un blason ne se réinterprète pas selon le thème de l'app.
export const RAYON_MAX = 95;

const COULEUR_ANNEAU = {
  "10": "#f2c84b", "9": "#f2c84b",
  "8": "#d6342f", "7": "#d6342f",
  "6": "#4fa8d8", "5": "#4fa8d8",
  "4": "#19191a", "3": "#19191a",
  "2": "#f3f1ea", "1": "#f3f1ea",
};
const STROKE_ANNEAU = {
  "10": "#00000030", "9": "#00000030",
  "8": "#00000030", "7": "#00000030",
  "6": "#00000030", "5": "#00000030",
  "4": "#ffffff30", "3": "#ffffff30",
  "2": "#00000030", "1": "#00000030",
};

/** Rayon de la zone X : toujours la moitié de la largeur de l'anneau "10". */
export function rayonX(nbAnneaux = 10) {
  return (RAYON_MAX / nbAnneaux) / 2;
}

/** Anneaux à dessiner, du plus grand rayon (extérieur) au plus petit (centre). */
export function anneauxBlason(nbAnneaux = 10) {
  const largeur = RAYON_MAX / nbAnneaux;
  return Array.from({ length: nbAnneaux }, (_, i) => {
    const ringIndex = i + 1; // 1 (centre) .. nbAnneaux (bord)
    const valeur = String(11 - ringIndex);
    return { valeur, r: ringIndex * largeur, fill: COULEUR_ANNEAU[valeur], stroke: STROKE_ANNEAU[valeur] };
  }).reverse();
}

export function zoneDepuisRayon(r, nbAnneaux = 10) {
  if (r > RAYON_MAX) return "M";
  if (r <= rayonX(nbAnneaux)) return "X";
  const largeur = RAYON_MAX / nbAnneaux;
  const anneau = Math.ceil(r / largeur); // 1 (centre) .. nbAnneaux (bord)
  return String(11 - anneau);
}

/** Position normalisée (x, y dans [-1,1]) à partir d'un clic sur un <svg> viewBox="0 0 200 200". */
export function positionDepuisClic(svg, clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  const px = ((clientX - rect.left) / rect.width) * 200 - 100;
  const py = ((clientY - rect.top) / rect.height) * 200 - 100;
  return { x: px / RAYON_MAX, y: py / RAYON_MAX, rayon: Math.hypot(px, py) };
}

/** Impact saisi sur un spot de trispot (5 anneaux) plutôt que sur le blason complet :
 *  sa valeur ne correspond qu'à l'échelle du trispot (cas ambigus près du centre exclus). */
export function impactDeTrispot(code, p) {
  const r = Math.hypot(p.x, p.y) * RAYON_MAX;
  return zoneDepuisRayon(r, 10) !== code && zoneDepuisRayon(r, 5) === code;
}

/** Tir compté saisi au trispot ? Mode enregistré (`saisie`) quand c'est trispot ou blason ;
 *  sinon (clavier en fin de tir, tirs anciens sans mode) déduit des impacts eux-mêmes. */
export function tirSurTrispot(d) {
  if (d.saisie === "trispot") return true;
  if (d.saisie === "blason") return false;
  let trispot = 0, blason = 0;
  for (const v of d.volees ?? []) {
    (v.impacts ?? []).forEach((p, i) => {
      if (!p) return;
      const code = v.codes?.[i];
      const r = Math.hypot(p.x, p.y) * RAYON_MAX;
      if (impactDeTrispot(code, p)) trispot++;
      else if (zoneDepuisRayon(r, 10) === code && zoneDepuisRayon(r, 5) !== code) blason++;
    });
  }
  return trispot > blason;
}
