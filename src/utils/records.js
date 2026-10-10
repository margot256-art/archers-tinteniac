// Règles des records.
// Un record (score sur 600 en salle / 720 en extérieur) ne compte que sur une
// épreuve complète : les 2 séries tirées, soit 60 / 72 flèches comptées.
// Une série complète (30 / 36 flèches) peut donner un « série record », noté
// sur 300 / 360. En dessous d'une série, aucun record.
import { getCompte, normFactor } from "./seances";
import { epreuveStandard, resumeTir } from "./tirCompte";
import { protocoleDe } from "./exercices";

export const flechesEpreuve = (distance) => normFactor(distance);     // 60 | 72
export const flechesSerie   = (distance) => normFactor(distance) / 2; // 30 | 36
export const maxEpreuve     = (distance) => flechesEpreuve(distance) * 10;
export const maxSerie       = (distance) => flechesSerie(distance) * 10;

const estCompte = (s) => getCompte(s) > 0 && (s.score ?? 0) > 0;

/** Score de l'épreuve ramené sur 600 / 720, ou null si les 2 séries ne sont pas tirées. */
export function scoreEpreuve(s) {
  if (!estCompte(s) || getCompte(s) < flechesEpreuve(s.distance)) return null;
  return Math.round((s.score / getCompte(s)) * flechesEpreuve(s.distance));
}

/** Meilleure série complète, sur 300 / 360, ou null.
 *  Tir compté détaillé (épreuve standard) : la meilleure de ses séries complètes.
 *  Sinon, un tir d'au moins une série mais de moins de deux : son score ramené sur une série. */
export function scoreSerie(s) {
  if (!estCompte(s)) return null;
  if (protocoleDe(s) === "tir-compte" && s.format !== "libre" && s.volees?.length) {
    const reglages = { ...epreuveStandard(s.distance), nbSeries: s.nbSeries ?? 2 };
    const series = resumeTir(s.volees.map((v) => v.codes ?? []), reglages).series ?? [];
    const completes = series.filter((se) => se.complete).map((se) => se.total);
    return completes.length ? Math.max(...completes) : null;
  }
  const c = getCompte(s);
  if (c < flechesSerie(s.distance) || c >= flechesEpreuve(s.distance)) return null;
  return Math.round((s.score / c) * flechesSerie(s.distance));
}
