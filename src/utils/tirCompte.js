// Domaine du Tir compté : épreuve standard (séries), score, dispersion des
// impacts. Les volées sont un tableau de codes déjà validés (exactement
// `flechesParVolee` codes chacune) ; la volée en cours de saisie est gérée à
// part par l'écran (pas incluse ici), contrairement à RTrainer qui la garde
// en fin de tableau.
import { pointsZone } from "./blason";
import { normFactor } from "./seances";

export const estSalle = (distance) => distance === "5m" || distance === "18m";
export const flechesParVolee = (distance) => (estSalle(distance) ? 3 : 6);

/** Épreuve standard pour une distance : volées par série et nombre de séries
 *  (2 séries complètes, comme un format de compétition club). */
export function epreuveStandard(distance) {
  const fpv = flechesParVolee(distance);
  const base = normFactor(distance); // 60 (salle) ou 72 (extérieur)
  const totalVolees = base / fpv;
  return { flechesParVolee: fpv, voleesParSerie: totalVolees / 2, series: 2 };
}

export const scoreVolee = (codes) => codes.reduce((n, c) => n + pointsZone(c), 0);

/** Résumé d'un tir : score, moyenne, répartition X/10/manques, séries éventuelles. */
export function resumeTir(volees, { flechesParVolee, voleesParSerie, nbSeries }) {
  let cumul = 0, fleches = 0, x = 0, dixPlusX = 0, manques = 0;
  const detail = volees.map((codes, index) => {
    const total = scoreVolee(codes);
    cumul += total;
    fleches += codes.length;
    for (const c of codes) {
      if (c === "X") { x++; dixPlusX++; }
      else if (c === "10") dixPlusX++;
      if (c === "M") manques++;
    }
    return { index, codes, total };
  });

  let series = null;
  if (voleesParSerie) {
    const nb = Math.max(nbSeries ?? 1, Math.ceil(detail.length / voleesParSerie) || 1, 1);
    series = Array.from({ length: nb }, (_, s) => {
      const tranche = detail.slice(s * voleesParSerie, (s + 1) * voleesParSerie);
      return {
        numero: s + 1,
        volees: tranche,
        total: tranche.reduce((t, v) => t + v.total, 0),
        max: voleesParSerie * flechesParVolee * 10,
        complete: tranche.length === voleesParSerie,
      };
    });
  }

  return {
    fleches, total: cumul,
    moyenne: fleches > 0 ? cumul / fleches : null,
    maxPossible: fleches * 10,
    x, dixPlusX, manques,
    volees: detail,
    series,
  };
}

// Zone de réussite : la zone visée par l'archer (« 8 et mieux »…). Seuil "X" = les X
// seulement ; "10" compte aussi les X.
export const SEUILS_REUSSITE = ["X", "10", "9", "8", "7", "6"];
export const SEUIL_REUSSITE_DEFAUT = "8";
export const libelleSeuil = (seuil) => (seuil === "X" ? "X" : `${seuil} et mieux`);

/** Flèches dans la zone de réussite, en tout et par série (si l'épreuve a des séries). */
export function reussite(volees, seuil, voleesParSerie = null) {
  const dansZone = (code) => (seuil === "X" ? code === "X" : pointsZone(code) >= Number(seuil));
  const compter = (liste) => {
    const fleches = liste.flat();
    const dans = fleches.filter(dansZone).length;
    return { dans, total: fleches.length, pct: fleches.length ? Math.round((dans / fleches.length) * 100) : null };
  };
  const parSerie = voleesParSerie
    ? Array.from({ length: Math.ceil(volees.length / voleesParSerie) }, (_, i) =>
        ({ numero: i + 1, ...compter(volees.slice(i * voleesParSerie, (i + 1) * voleesParSerie)) }))
    : null;
  return { ...compter(volees), parSerie };
}

/** Position dans l'épreuve (série/volée en cours, 1-based) et si elle est terminée. */
export function positionEpreuve(nbVoleesValidees, voleeEnCoursLength, { voleesParSerie, nbSeries }) {
  if (!voleesParSerie) return { serie: 1, volee: nbVoleesValidees + 1, terminee: false };
  const serie = Math.floor(nbVoleesValidees / voleesParSerie) + 1;
  const volee = (nbVoleesValidees % voleesParSerie) + 1;
  const terminee = voleeEnCoursLength === 0 && nbVoleesValidees >= voleesParSerie * (nbSeries ?? 1);
  return { serie, volee, terminee };
}

/** Dispersion des impacts (position normalisée [-1,1] par flèche) : centre et rayon moyen,
 *  exprimés en largeur de zone (1 = la largeur d'un anneau de score). */
export function dispersion(impacts) {
  const pts = impacts.flat().filter(Boolean);
  if (!pts.length) return null;
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const rayonMoyen = pts.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / pts.length;
  return { centre: { x: cx, y: cy }, rayonMoyen: rayonMoyen * 10, n: pts.length };
}
