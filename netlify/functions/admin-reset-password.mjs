// Nouveau mot de passe pour un archer (demande « Mot de passe oublié »), réservé aux coachs.
// POST { uid, prenom, nom, password }. Le compte est cherché par `uid` ; s'il n'existe
// pas (nom tapé sans accent dans la demande : « Celine » → celine_bajard au lieu de
// céline_bajard), il est retrouvé par l'adresse de connexion, qui ignore accents et
// majuscules.
import { getAuth } from "firebase-admin/auth";
import { requireCoach, jsonResponse } from "./_admin.mjs";
import { slug } from "../../src/utils/slug.js";

const MIN_PWD_LEN = 6;
const DOMAIN      = "@archers-tinteniac.fr";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Méthode non autorisée." });
  }

  const auth = await requireCoach(event);
  if (auth.error) return auth.error;

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "JSON invalide." });
  }

  const { uid, prenom, nom, password } = payload;
  if (!uid || !password) {
    return jsonResponse(400, { error: "uid et password requis." });
  }
  if (password.length < MIN_PWD_LEN) {
    return jsonResponse(400, { error: `Mot de passe trop court (${MIN_PWD_LEN} caractères min).` });
  }

  const authInst = getAuth(auth.app);
  const introuvable = (err) => {
    if (err.code === "auth/user-not-found") return null;
    throw err;
  };

  try {
    let compte = await authInst.getUser(uid).catch(introuvable);
    if (!compte && prenom && nom) {
      compte = await authInst.getUserByEmail(`${slug(prenom, nom)}${DOMAIN}`).catch(introuvable);
    }
    if (!compte) {
      return jsonResponse(404, { error: "Aucun compte à ce nom : vérifiez l'orthographe ou supprimez la demande." });
    }
    await authInst.updateUser(compte.uid, { password });
    return jsonResponse(200, { success: true });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
