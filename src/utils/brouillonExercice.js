// Brouillons des saisies en cours (flèches, volées, formulaire…), gardés dans le
// téléphone à chaque changement : si l'appli se ferme, si la page recharge ou si
// l'archer revient à l'accueil en plein exercice, il reprend là où il en était.
// Un brouillon par saisie (exercice d'une séance, modification d'un exercice,
// saisie manuelle) : reprendre l'un n'écrase jamais l'autre. Chaque brouillon
// est effacé quand la saisie est enregistrée, annulée ou supprimée.
const prefixe = (userId) => `at_brouillon_${userId}|`;
const cle = (userId, { protocole, seanceId, existantId }) =>
  `${prefixe(userId)}${seanceId ?? "-"}|${existantId ?? "-"}|${protocole}`;

const PEREMPTION_MS = 30 * 24 * 3600 * 1000; // un brouillon oublié depuis 30 jours est jeté

function lire(k) {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** État sauvegardé pour cette saisie précise, ou null. */
export function lireBrouillon(userId, saisie) {
  if (!userId) return null;
  return lire(cle(userId, saisie))?.etat ?? null;
}

export function ecrireBrouillon(userId, { protocole, seanceId, existantId }, etat) {
  if (!userId) return;
  try {
    localStorage.setItem(cle(userId, { protocole, seanceId, existantId }), JSON.stringify({
      protocole, seanceId: seanceId ?? null, existantId: existantId ?? null, majLe: Date.now(), etat,
    }));
  } catch {
    // stockage indisponible — pas de reprise possible, tant pis
  }
}

export function effacerBrouillon(userId, saisie) {
  if (!userId) return;
  try {
    localStorage.removeItem(cle(userId, saisie));
  } catch {
    // ignore
  }
}

/** Tous les brouillons de l'archer, du plus récent au plus ancien (les périmés sont jetés). */
function tousLesBrouillons(userId) {
  if (!userId) return [];
  const liste = [];
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(prefixe(userId))) continue;
      const b = lire(k);
      if (!b || Date.now() - (b.majLe ?? 0) > PEREMPTION_MS) { localStorage.removeItem(k); continue; }
      liste.push(b);
    }
  } catch {
    return [];
  }
  return liste.sort((a, b) => b.majLe - a.majLe);
}

/** Brouillons rattachés à une séance, du plus récent au plus ancien. */
export const brouillonsDeSeance = (userId, seanceId) =>
  tousLesBrouillons(userId).filter((b) => b.seanceId === seanceId);

export function effacerBrouillonsDeSeance(userId, seanceId) {
  for (const b of brouillonsDeSeance(userId, seanceId)) effacerBrouillon(userId, b);
}
