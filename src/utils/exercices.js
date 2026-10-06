import { getPaille, getBlason, getCompte, normFactor } from "./seances";

export const PROTOCOLE_PAR_DEFAUT = "tir-compte";

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
    id: "test100",
    nom: "Test 100",
    resume: "Une centaine de flèches comptées : score moyen et équivalence sur un tir de compétition (60 ou 72 flèches).",
    actif: false,
  },
  {
    id: "groupements",
    nom: "Régularité groupements",
    resume: "Taille du groupement, en centimètres — plus c'est petit, plus c'est régulier.",
    actif: false,
  },
  {
    id: "potentiel-max",
    nom: "Potentiel Max",
    resume: "Seules les 3 meilleures flèches de chaque volée comptent : le meilleur score en un minimum de flèches.",
    actif: false,
  },
  {
    id: "zone",
    nom: "Zone",
    resume: "Pourcentage de flèches dans une zone visée (ex. le 7 et mieux).",
    actif: false,
  },
];

export const PROTOCOLES_ACTIFS = PROTOCOLES.filter((p) => p.actif);

export const PROTOCOLE_PAR_ID = Object.fromEntries(PROTOCOLES.map((p) => [p.id, p]));
export const protocoleExiste = (id) => id in PROTOCOLE_PAR_ID;

// Protocole réel d'une séance — les séances créées avant l'ajout des exercices
// n'ont pas de champ `protocole` : elles comptent comme du tir compté classique.
export const protocoleDe = (s) => s.protocole ?? PROTOCOLE_PAR_DEFAUT;

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
    case "test100": {
      const c = getCompte(s);
      if (!c || !s.score) return null;
      const moy  = s.score / c;
      const base = normFactor(s.distance);
      return { texte: moy.toFixed(2), detail: `${s.score} pts en ${c} fl. · ≈ ${Math.round(moy * base)} sur ${base}` };
    }
    case "groupements": {
      if (s.groupementCm == null) return null;
      return { texte: `${s.groupementCm} cm`, detail: "taille du groupement" };
    }
    case "potentiel-max": {
      const nbVolees = s.volees?.length ?? 0;
      if (!nbVolees || s.score == null) return null;
      const comptees = nbVolees * 3;
      const moy  = s.score / comptees;
      const base = normFactor(s.distance);
      return { texte: `${Math.round(moy * base)}`, detail: `projection sur ${base} fl. · ${s.score} pts, ${comptees} fl. comptées` };
    }
    case "zone": {
      const c = getCompte(s);
      if (!c || s.zoneDansZone == null) return null;
      const pct = Math.round((s.zoneDansZone / c) * 100);
      return { texte: `${pct} %`, detail: `${s.zoneDansZone}/${c} dans la zone${s.zoneCible ? ` ${s.zoneCible}` : ""}` };
    }
    default:
      return null;
  }
}
