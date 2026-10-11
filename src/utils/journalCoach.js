// Lignes du Journal coach : une ligne par archer, par jour et par distance pour
// l'entraînement (les exercices regroupés), une par enregistrement pour la
// compétition. Partagé par le Journal et le Tableau de bord (commentaires sans réponse).
import { getPaille, getBlason, getCompte, buildMonthTotals, parOrdreDeTir, todayISO } from "./seances";
import { PROTOCOLE_PAR_ID, protocoleDe, commentaireSeanceDe, commentaireExerciceDe } from "./exercices";

export const nomExercice = (s) => PROTOCOLE_PAR_ID[protocoleDe(s)]?.nom ?? s.protocole ?? "—";
const uniques = (vals) => [...new Set(vals.filter(Boolean))].join(" / ");
export const somme = (docs, f) => docs.reduce((n, s) => n + f(s), 0);

// Moyenne par flèche et score ramené sur 600 (salle) ou 720 (extérieur), calculés
// sur les seules flèches comptées avec un score. Pas de score ramené si les tirs
// comptés mélangent plusieurs distances.
export const statsTir = (docs) => {
  const { tmoy, tscoreMoy } = buildMonthTotals(docs);
  return { moyenne: tmoy, ramene: tscoreMoy };
};

// « Séance – … » puis « Exercice – … » pour chaque exercice commenté, un commentaire par ligne.
const commentaireDuJour = (docs) => {
  const seance = [...new Set(docs.map(commentaireSeanceDe).filter(Boolean))].map((c) => `Séance – ${c}`);
  const exos   = docs.filter(commentaireExerciceDe).map((d) => `${nomExercice(d)} – ${commentaireExerciceDe(d)}`);
  return [...seance, ...exos].join("\n");
};

export function regrouperParJour(docs) {
  const map = new Map();
  for (const s of docs) {
    const cle = s.type === "Compétition" ? `comp|${s.id}` : `${s.date}|${s.archer}|${s.distance}|entr`;
    if (!map.has(cle)) map.set(cle, []);
    map.get(cle).push(s);
  }
  return [...map.entries()].map(([cle, ds]) => {
    const tries = [...ds].sort(parOrdreDeTir);
    return {
      id: cle, docs: tries,
      date: tries[0].date, archer: tries[0].archer, archerId: tries[0].archerId,
      type:     uniques(tries.map((d) => d.type)),
      lieu:     uniques(tries.map((d) => d.lieu)),
      distance: uniques(tries.map((d) => d.distance)),
      paille:   somme(tries, getPaille),
      blason:   somme(tries, getBlason),
      compte:   somme(tries, getCompte),
      tir:      statsTir(tries),
      commentaire: commentaireDuJour(tries),
      retourCoach: tries.find((d) => d.retourCoach)?.retourCoach ?? "",
    };
  });
}

// Commentaires sans réponse : les séances récentes où l'archer a écrit un
// commentaire et n'a pas encore de retour du coach. Rien n'oblige à répondre à
// chaque entraînement : seuls les archers qui ont pris la parole sont signalés.
// Celles du coach connecté ne comptent pas (on ne se répond pas à soi-même).
export const JOURS_A_COMMENTER = 14;

/** Première date (AAAA-MM-JJ) de la fenêtre des séances à commenter. */
export function debutACommenter() {
  const d = new Date();
  d.setDate(d.getDate() - JOURS_A_COMMENTER);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function aCommenter(ligne, moiId, aujourdhui = todayISO()) {
  if (ligne.retourCoach || !ligne.date || !ligne.commentaire) return false;
  if (moiId && ligne.archerId === moiId) return false;
  const jours = (new Date(`${aujourdhui}T12:00:00`) - new Date(`${ligne.date}T12:00:00`)) / 86400000;
  return jours >= 0 && jours <= JOURS_A_COMMENTER;
}
