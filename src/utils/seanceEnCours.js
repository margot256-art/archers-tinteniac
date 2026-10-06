// Persistance locale de la séance multi-exercices en cours, pour pouvoir la
// reprendre si on quitte l'onglet ou ferme l'appli en plein milieu (comme RTrainer).
const cle = (userId) => `at_seance_en_cours_${userId}`;

export function lireSeanceEnCours(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(cle(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function ecrireSeanceEnCours(userId, donnees) {
  if (!userId) return;
  try {
    localStorage.setItem(cle(userId), JSON.stringify(donnees));
  } catch {
    // stockage indisponible (navigation privée, quota…) — tant pis, pas de reprise
  }
}

export function effacerSeanceEnCours(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(cle(userId));
  } catch {
    // ignore
  }
}
