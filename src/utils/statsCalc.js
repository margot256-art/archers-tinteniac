// Calculs statistiques partagés entre les écrans archer et coach, pour éviter
// la réimplémentation (filtre saison/distance/type, agrégation mensuelle,
// moyenne top 3 normalisée, écart-type) qui existait en double dans
// StatsMensuelles.jsx / StatsCoach.jsx / Graphiques.jsx / CoachGraph.jsx / Classement.jsx.
import { getPaille, getBlason, getCompte, normFactor, getSaison } from "./seances";

// Un tir compté : flèches comptées avec un score renseigné. Les protocoles
// sans score (Volume, Régularité groupements) en sont naturellement exclus
// puisqu'ils sont enregistrés avec score=0 — pas besoin de filtrer sur
// `protocole` explicitement pour les agrégats de score.
export const estTirCompte = (s) => getCompte(s) > 0 && (s.score ?? 0) > 0;

export function filtrerSeances(seances, { saison, distance, type, archer } = {}) {
  return seances.filter((s) => {
    if (!s.date) return false;
    if (saison && saison !== "Toutes" && getSaison(s.date) !== saison) return false;
    if (distance && distance !== "Toutes" && s.distance !== distance) return false;
    if (type && type !== "Tous" && s.type !== type) return false;
    if (archer && archer !== "Tous" && s.archer !== archer) return false;
    return true;
  });
}

export function ecartType(valeurs) {
  if (valeurs.length < 2) return null;
  const moy = valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
  const variance = valeurs.reduce((s, v) => s + (v - moy) ** 2, 0) / valeurs.length;
  return Math.sqrt(variance);
}

/**
 * Agrège des séances par mois × distance (et optionnellement par archer),
 * dans la forme utilisée par le tableau "Progression" (archer et coach) :
 * nb séances entr./comp., volumes, score, moyenne et score moyen par type.
 */
export function agregerParMoisDistance(seances, { parArcher = false } = {}) {
  const map = new Map();
  for (const s of seances) {
    if (!s.date) continue;
    const month = s.date.slice(0, 7);
    const key = parArcher ? `${month}__${s.distance}__${s.archer ?? ""}` : `${month}__${s.distance}`;
    if (!map.has(key)) {
      map.set(key, {
        month, distance: s.distance, archer: parArcher ? s.archer : undefined,
        nbrEntr: 0, nbrComp: 0,
        paille: 0, blason: 0, compteTotal: 0,
        compteEntr: 0, scoreEntr: 0,
        compteComp: 0, scoreComp: 0,
      });
    }
    const g = map.get(key);
    const p = getPaille(s), b = getBlason(s), c = getCompte(s), sc = s.score ?? 0;
    g.paille += p;
    g.blason += b;
    g.compteTotal += c;
    if (s.type === "Entraînement") {
      g.nbrEntr++;
      if (c > 0 && sc > 0) { g.compteEntr += c; g.scoreEntr += sc; }
    } else if (s.type === "Compétition") {
      g.nbrComp++;
      if (c > 0 && sc > 0) { g.compteComp += c; g.scoreComp += sc; }
    }
  }

  return [...map.values()].map((g) => {
    const nf = normFactor(g.distance);
    const moyEntr = g.compteEntr > 0 ? g.scoreEntr / g.compteEntr : null;
    const moyComp = g.compteComp > 0 ? g.scoreComp / g.compteComp : null;
    return {
      ...g,
      total: g.paille + g.blason + g.compteTotal,
      score: g.scoreEntr + g.scoreComp,
      moyEntr, scoreMoyEntr: moyEntr != null ? Math.round(moyEntr * nf) : null,
      moyComp, scoreMoyComp: moyComp != null ? Math.round(moyComp * nf) : null,
    };
  });
}

export const DIST_ORDER = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];

export function trierParMoisPuisDistance(rows) {
  return [...rows].sort((a, b) => {
    const cm = b.month.localeCompare(a.month);
    if (cm !== 0) return cm;
    return DIST_ORDER.indexOf(a.distance) - DIST_ORDER.indexOf(b.distance);
  });
}
