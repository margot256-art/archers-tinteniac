// Slug ASCII (sans accents ni apostrophes) utilisé comme identifiant de connexion
// (partie locale de l'email Firebase Auth). Distinct de l'ID du document Firestore
// (toDocId), qui lui conserve les accents et sert d'uid.

const stripAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const stripApostrophes = (s) => s.replace(/['’‘`´ʼʹ]/g, "");

const slugPart = (s) =>
  stripApostrophes(stripAccents(s.trim().toLowerCase())).replace(/\s+/g, "_");

export function slug(prenom, nom) {
  return `${slugPart(prenom)}_${slugPart(nom)}`;
}
