import { getPaille, getBlason, getCompte } from "./seances";

export const PROTOCOLE_PAR_DEFAUT = "manuel";

// `actif: false` = pas encore proposé dans le sélecteur de nouvel exercice,
// mais le protocole reste pleinement géré (affichage, édition) pour les
// séances déjà enregistrées avec.
export const PROTOCOLES = [
  {
    id: "tir-compte",
    nom: "Tir compté",
    resume: "Score sur un nombre de flèches comptées — le protocole standard d'entraînement ou de compétition.",
    actif: true,
  },
  {
    id: "volume",
    nom: "Volume",
    resume: "Tirer sans compter les points : nombre de flèches, à la paille, au visuel ou à la cible.",
    actif: true,
  },
  {
    // Pas un exercice à proprement parler : séance notée après coup depuis l'Accueil,
    // donc jamais proposée dans la liste des exercices d'une séance en direct.
    id: "manuel",
    nom: "Saisie manuelle",
    resume: "Séance notée après coup : nombre de flèches et score.",
    actif: false,
  },
];

export const PROTOCOLES_ACTIFS = PROTOCOLES.filter((p) => p.actif);

export const PROTOCOLE_PAR_ID = Object.fromEntries(PROTOCOLES.map((p) => [p.id, p]));
export const protocoleExiste = (id) => id in PROTOCOLE_PAR_ID;

// Protocole réel d'une séance — les séances créées avant l'ajout des exercices
// n'ont pas de champ `protocole` : elles venaient de l'ancien formulaire (volumes
// paille/blason/compté + score), soit exactement une saisie manuelle. Un protocole
// abandonné (Test 100, Groupements, Potentiel Max, Zone) est traité de même :
// volumes et score restent lisibles et modifiables par la saisie manuelle.
export const protocoleDe = (s) => (protocoleExiste(s.protocole) ? s.protocole : PROTOCOLE_PAR_DEFAUT);

// Une saisie manuelle est une séance entière : son commentaire est un commentaire
// de séance. Les anciennes saisies l'avaient en commentaire d'exercice (`commentaire`).
export const commentaireSeanceDe = (s) =>
  s.commentaireSeance || (protocoleDe(s) === "manuel" ? s.commentaire?.trim() : "") || "";
export const commentaireExerciceDe = (s) =>
  (protocoleDe(s) === "manuel" ? "" : s.commentaire?.trim() ?? "");

/**
 * Résultat affichable d'une séance pour un protocole donné, ou null si la séance
 * n'a pas les données nécessaires (ex. score manquant pour un tir compté).
 * @returns {{ texte: string, detail: string } | null}
 */
export function indicateurExercice(protocoleId, s) {
  switch (protocoleId) {
    case "tir-compte": {
      const c = getCompte(s);
      if (!c || !s.score) return null;
      const moy = s.score / c;
      return { texte: `${s.score} pts`, detail: `moy. ${moy.toFixed(2)} / flèche · ${c} fl. · ${s.distance ?? ""}`.trim() };
    }
    case "volume": {
      const total = getPaille(s) + getBlason(s) + getCompte(s);
      if (!total) return null;
      return { texte: `${total} fl.`, detail: "flèches tirées" };
    }
    case "manuel": {
      const c = getCompte(s);
      if (c && s.score) {
        return { texte: `${s.score} pts`, detail: `moy. ${(s.score / c).toFixed(2)} / flèche · ${c} fl. · ${s.distance ?? ""}`.trim() };
      }
      const total = getPaille(s) + getBlason(s) + c;
      if (!total) return null;
      return { texte: `${total} fl.`, detail: "flèches tirées" };
    }
    default:
      return null;
  }
}

/** Résultat court d'un exercice, avec la moyenne par flèche à côté du score
 *  quand il y en a un (« 320 pts (moy. 5.33) »), ou null. */
export function resultatAvecMoyenne(s) {
  const proto = protocoleDe(s);
  const ind = indicateurExercice(proto, s);
  if (!ind) return null;
  const c = getCompte(s);
  if ((proto === "tir-compte" || proto === "manuel") && c && s.score) {
    return `${ind.texte} (moy. ${(s.score / c).toFixed(2)})`;
  }
  return ind.texte;
}
